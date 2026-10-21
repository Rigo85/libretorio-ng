import {applyMobileEpubMargins} from './epub-mobile-margins';

describe('EPUB mobile margins',()=>{
  let frame:HTMLIFrameElement;
  beforeEach(()=>{frame=document.createElement('iframe');frame.style.cssText='border:0;height:200px';document.body.append(frame);});
  afterEach(()=>frame.remove());
  it('survives layout changes, preserves desktop padding and does not change the book text',()=>{
    const doc=frame.contentDocument!;
    doc.body.innerHTML='<p style="margin-left:16px;text-indent:20px">Texto del libro</p>';
    const content=doc.body.innerHTML;
    applyMobileEpubMargins(doc,'reflowable');applyMobileEpubMargins(doc,'reflowable');
    expect(doc.head.querySelectorAll('#libretorio-mobile-margins').length).toBe(1);
    for(const width of [360,1440,390]){
      frame.style.width=width+'px';doc.body.style.padding=`0 ${width/12}px`;
      const style=frame.contentWindow!.getComputedStyle(doc.body);
      expect(style.paddingLeft).toBe(width<768?'12px':`${width/12}px`);
      expect(style.paddingRight).toBe(style.paddingLeft);
      expect(doc.body.innerHTML).toBe(content);
    }
  });
  it('leaves fixed-layout and unknown documents untouched',()=>{
    for(const layout of ['pre-paginated',undefined])applyMobileEpubMargins(frame.contentDocument!,layout);
    expect(frame.contentDocument!.head.querySelector('style')).toBeNull();
  });
});
