import {EpubCFI} from 'epubjs';
import {captureEpubSelection, EpubSpeechContext, inspectEpubSelection, restoreEpubSource, selectedBlocks, selectedTextPieces,textAnchoredRange} from './epub-speech-source';
import {BLOCK_SIZE, normalizeText} from './recoverable-speech/source.mjs';

describe('EPUB bounded speech source',()=>{
  function example(html='<p>Primera frase. Segunda frase.</p>') {
    const doc=new DOMParser().parseFromString(`<html xmlns="http://www.w3.org/1999/xhtml"><head/><body>${html}</body></html>`,'application/xhtml+xml');
    const body=doc.getElementsByTagName('body')[0],range=doc.createRange();range.selectNodeContents(body);
    const cfi=new EpubCFI(textAnchoredRange(range),'/6/2[chapter]').toString();
    const book={getRange:async(cfi:string)=>new EpubCFI(cfi).toRange(doc),spine:{get:()=>({href:'chapter.xhtml'})}};
    const context:EpubSpeechContext={archiveId:17,path:'/books/fixture.epub',book};
    return {doc,body,range,cfi,context,anchor:{cfi,sectionHref:'chapter.xhtml',preview:''},signal:new AbortController().signal};
  }
  it('extracts only the selected text with structural separators, excluding hidden content',()=>{
    const {range,body}=example('<p>antes <b>uno</b> dos</p><script>bad()</script><p hidden="hidden">oculto</p><p>tres<br/>cuatro fin</p>');
    range.setStart(body.firstChild!.firstChild!,6);
    range.setEnd(body.lastChild!.lastChild!,6);
    expect([...selectedTextPieces(range)].join('')).toBe('uno dos\ntres\ncuatro');
  });
  it('handles element endpoint offsets and hidden common ancestors',()=>{
    const {range,body}=example('<p>excluir</p><p>incluir</p><p hidden="hidden">secreto</p>');
    range.setStart(body,1);range.setEnd(body,2);
    expect([...selectedTextPieces(range)].join('')).toBe('incluir');
    range.selectNodeContents(body.lastChild!.firstChild!);
    expect([...selectedTextPieces(range)]).toEqual([]);
  });
  it('captures a CFI and bounded preview without serializing the entire selection',()=>{
    const item=example(`<p>${'Texto largo. '.repeat(20000)}</p>`);
    const stringify=jasmine.createSpy();
    spyOn(item.doc,'getSelection').and.returnValue({isCollapsed:false,rangeCount:1,getRangeAt:()=>item.range,toString:stringify} as unknown as Selection);
    const selected=captureEpubSelection({document:item.doc,cfiFromRange:()=>item.cfi},item.context)!;
    expect(selected.preview.length).toBe(140);expect(stringify).not.toHaveBeenCalled();
  });
  it('round trips a real CFI and rejects changed content without invoking renderer navigation',async()=>{
    const item=example();
    const saved=(await inspectEpubSelection(item.context,item.anchor,'etag',item.signal)).document;
    const source=await restoreEpubSource(item.context,saved,'etag',item.signal);
    expect(await source.read(0,saved.length)).toBe('Primera frase. Segunda frase.');
    item.body.firstChild!.firstChild!.nodeValue='Texto modificado';
    await expectAsync(restoreEpubSource(item.context,saved,'etag',item.signal)).toBeRejected();
  });
  it('streams large selections in bounded blocks and preserves line normalization and Unicode',async()=>{
    const text=('Una ora-\ncion con pa\u00adlabras. \ud83d\ude00 ').repeat(9000),item=example(`<p>${text}</p>`);
    const saved=(await inspectEpubSelection(item.context,item.anchor,'etag',item.signal)).document;
    expect(saved.length).toBe(text.length);
    const source=await restoreEpubSource(item.context,saved,'etag',item.signal);
    for(let start=0;start<saved.length;start+=BLOCK_SIZE) {
      expect(await source.read(start,Math.min(saved.length,start+BLOCK_SIZE))).toBe(text.slice(start,start+BLOCK_SIZE));
      expect(source.cache.size).toBeLessThanOrEqual(2);
    }
    expect(source.peakCharacters).toBeLessThanOrEqual(2*BLOCK_SIZE);
    expect(normalizeText('Una ora-\ncion con pa\u00adlabras.')).toBe('Una oracion con palabras.');
    expect([...selectedBlocks(item.range)].every(block=>block.length<=BLOCK_SIZE)).toBeTrue();
  });
  it('rejects cancellation, changed HTTP revision and different archive identity',async()=>{
    const item=example(),saved=(await inspectEpubSelection(item.context,item.anchor,'etag',item.signal)).document;
    await expectAsync(restoreEpubSource(item.context,saved,'other',item.signal)).toBeRejectedWithError('source-changed');
    await expectAsync(restoreEpubSource({...item.context,archiveId:18},saved,'etag',item.signal)).toBeRejectedWithError('source-changed');
    const stop=new AbortController();stop.abort();
    await expectAsync(restoreEpubSource(item.context,saved,'etag',stop.signal)).toBeRejected();
  });
});
