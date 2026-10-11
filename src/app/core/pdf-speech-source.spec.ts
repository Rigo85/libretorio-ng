import {describePdfSelection,PdfSpeechContext,PdfSpeechLayout,PdfSpeechSelection,PdfSpeechSource} from './pdf-speech-source';
import {BLOCK_SIZE} from './recoverable-speech/source.mjs';

describe('PDF windowed speech provider',()=>{
  const layout:PdfSpeechLayout={reading:false,layoutWidth:390,fontSize:20,fontFamily:'serif',pageMargin:12,lineHeight:1.5};
  const signal=()=>new AbortController().signal;
  function example(texts=['Primera pagina.\n','Segunda pagina.\n']) {
    const reads:jasmine.Spy=jasmine.createSpy().and.callFake(async(page,_layout,start,end)=>{
      if(page.revision!==String(page.page+1).repeat(64))throw new Error('source-changed');
      expect(end-start).toBeLessThanOrEqual(BLOCK_SIZE);return texts[page.page].slice(start,end);
    });
    const context:PdfSpeechContext={format:'pdf',path:'/books/test.pdf',archiveId:15,pages:texts.length,readText:reads};
    const selection:PdfSpeechSelection={format:'pdf',layout,preview:'Preview',pages:texts.map((text,page)=>({page,start:0,end:text.length,length:text.length,revision:String(page+1).repeat(64)}))};
    const saved=describePdfSelection(context,selection,'etag');
    return {context,selection,saved,reads,texts};
  }
  it('describes pages without extracting their text and reads only the requested blocks',async()=>{
    const item=example(['A. '.repeat(10000),'B. '.repeat(10000)]);
    expect(item.reads).not.toHaveBeenCalled();
    const source=new PdfSpeechSource(item.context,item.saved,'etag',signal());
    expect((await source.read(0,100))).toBe(item.texts[0].slice(0,100));
    expect(item.reads.calls.allArgs().every(args=>args[0].page===0)).toBeTrue();
    for(let start=0;start<item.saved.length;start+=BLOCK_SIZE)await source.read(start,Math.min(item.saved.length,start+BLOCK_SIZE));
    expect(source.peakCharacters).toBeLessThanOrEqual(BLOCK_SIZE*2);
  });
  it('preserves exact offsets across page boundaries and partial endpoints',async()=>{
    const item=example();item.selection.pages[0].start=4;item.selection.pages[1].end=7;
    const saved=describePdfSelection(item.context,item.selection,'etag'),source=new PdfSpeechSource(item.context,saved,'etag',signal());
    expect(await source.read(0,saved.length)).toBe(item.texts[0].slice(4)+'\n'+item.texts[1].slice(0,7));
  });
  it('checks the pages behind a persisted pending fragment without re-reading prior pages',async()=>{
    const item=example(),source=new PdfSpeechSource(item.context,item.saved,'etag',signal());
    await source.validateRange(item.texts[0].length+1,item.saved.length);
    expect(item.reads.calls.allArgs().map(args=>args[0].page)).toEqual([1]);
    expect(item.reads.calls.mostRecent().args[2]).toBe(item.reads.calls.mostRecent().args[3]);
  });
  it('does not silently skip blank pages that changed since capture',async()=>{
    const item=example(['A','','B']),source=new PdfSpeechSource(item.context,item.saved,'etag',signal());
    item.reads.and.callFake(async page=>{if(page.page===1)throw new Error('source-changed');return item.texts[page.page];});
    await expectAsync(source.read(0,item.saved.length)).toBeRejectedWithError('source-changed');
  });
  it('rejects changed identity, revision, malformed descriptors and cancellation',async()=>{
    const item=example();
    expect(()=>new PdfSpeechSource({...item.context,archiveId:16},item.saved,'etag',signal())).toThrowError('source-changed');
    expect(()=>new PdfSpeechSource(item.context,item.saved,'other',signal())).toThrowError('source-changed');
    expect(()=>new PdfSpeechSource(item.context,{...item.saved,length:999},'etag',signal())).toThrowError('source-changed');
    const controller=new AbortController(),source=new PdfSpeechSource(item.context,item.saved,'etag',controller.signal);controller.abort();
    await expectAsync(source.read(0,3)).toBeRejected();expect(item.reads).not.toHaveBeenCalled();
  });
});
