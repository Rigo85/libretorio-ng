import {capturePdfSpeechSelection} from './pdf-speech-selection';
import {PdfSpeechLayout} from '../../core/pdf-speech-source';

describe('PDF speech selection descriptor',()=>{
  const layout:PdfSpeechLayout={reading:true,layoutWidth:390,fontSize:20,fontFamily:'serif',pageMargin:12,lineHeight:1.5};
  let root:HTMLElement;
  beforeEach(()=>{root=document.createElement('div');document.body.appendChild(root);});
  afterEach(()=>{document.getSelection()?.removeAllRanges();root.remove();});
  function page(index:number,html:string,length:number) {
    const el=document.createElement('div');el.className='pdf-text-layer';el.dataset['page']=String(index);el.innerHTML=html;
    el.dataset['speechLength']=String(length);el.dataset['speechRevision']='a'.repeat(64);el.dataset['speechLayout']=JSON.stringify(layout);
    root.appendChild(el);return el;
  }
  it('captures reversed native selections over words and pages without materializing full text',()=>{
    const first=page(0,'<span>Hola mundo</span><br>',11),last=page(1,'<span>Segunda pagina</span><br>',15);
    const selection=document.getSelection()!;selection.setBaseAndExtent(last.firstChild!.firstChild!,7,first.firstChild!.firstChild!,5);
    const stringify=spyOn(selection,'toString').and.throwError('No full text');
    const captured=capturePdfSpeechSelection(root,layout)!;
    expect(captured.pages.map(p=>[p.page,p.start,p.end])).toEqual([[0,5,11],[1,0,7]]);
    expect(captured.preview).toBe('mundo\nSegunda');expect(stringify).not.toHaveBeenCalled();
  });
  it('keeps the layout that produced the text, not newer UI settings',()=>{
    const el=page(2,'<span>Texto</span><br>',6),selection=document.getSelection()!,range=document.createRange();range.selectNodeContents(el);selection.addRange(range);
    expect(capturePdfSpeechSelection(root,{...layout,fontSize:30})!.layout.fontSize).toBe(20);
  });
  it('bounds preview for a large selection and rejects missing intermediate pages',()=>{
    const el=page(0,`<span>${'A'.repeat(50000)}</span><br>`,50001),selection=document.getSelection()!,range=document.createRange();range.selectNodeContents(el);selection.addRange(range);
    expect(capturePdfSpeechSelection(root,layout)!.preview.length).toBe(140);
    const last=page(2,'<span>Fin</span><br>',4);range.setEnd(last,1);selection.removeAllRanges();selection.addRange(range);
    expect(capturePdfSpeechSelection(root,layout)).toBeUndefined();
  });
});
