import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EpubViewerComponent } from './epub-viewer.component';
import {provideHttpClient} from '@angular/common/http';
import {SessionActivityService} from '../../services/session-activity.service';
import {EpubCFI} from 'epubjs';

describe('EpubViewerComponent', () => {
  let component: EpubViewerComponent;
  let fixture: ComponentFixture<EpubViewerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EpubViewerComponent], providers: [provideHttpClient()]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EpubViewerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('keeps one search annotation and removes it on replacement and close',async()=>{
    const annotations={highlight:jasmine.createSpy(),remove:jasmine.createSpy()};
    component['rendition']={display:jasmine.createSpy().and.resolveTo(),annotations};
    await component.searchResult({label:'First',excerpt:'text',cfi:'first'});
    await component.searchResult({label:'Next',excerpt:'text',cfi:'second'});
    expect(annotations.remove).toHaveBeenCalledWith('first','highlight');
    expect(annotations.highlight).toHaveBeenCalledTimes(2);
    component.clearSearchHighlight();expect(annotations.remove).toHaveBeenCalledWith('second','highlight');
    expect(component['searchHighlight']).toBeUndefined();
  });

  for (const width of [320, 390, 1440]) {
    it(`centers progress and groups TTS/reading settings at ${width}px`, () => {
      const root=fixture.nativeElement as HTMLElement;
      root.style.display='block';
      root.style.width=`${width}px`;
      component.percentage=100; fixture.detectChanges();
      const toolbar=root.querySelector<HTMLElement>('.reader-toolbar')!;
      const progress=root.querySelector<HTMLElement>('.reading-progress')!;
      const actions=root.querySelector<HTMLElement>('.reader-actions')!;
      const speech=actions.querySelector<HTMLElement>('epub-speech')!;
      // Include the extra transport button shown while TTS is active.
      speech.style.width='88px';
      const bar=toolbar.getBoundingClientRect(), percent=progress.getBoundingClientRect();
      expect(bar.width).toBeCloseTo(width, 0);
      const settings=actions.querySelector<HTMLElement>('#options-toggle')!.getBoundingClientRect();
      expect(percent.left + percent.width/2).toBeCloseTo(bar.left + bar.width/2, 0);
      expect(actions.getBoundingClientRect().left).toBeGreaterThanOrEqual(percent.right);
      expect(settings.right).toBeLessThanOrEqual(bar.right);
      expect(actions.children[0].tagName).toBe('EPUB-SPEECH');
      expect(actions.children[1].id).toBe('options-toggle');
      expect(toolbar.scrollWidth).toBeLessThanOrEqual(toolbar.clientWidth);
    });
  }

  it('disables browser anchoring on the EPUB scroller before the first display', async () => {
    const viewer = fixture.nativeElement.querySelector('#viewer') as HTMLElement;
    const handlers = new Map<string, (...args: any[]) => void>();
    const outside = document.createElement('div');
    outside.className = 'epub-container';
    fixture.nativeElement.appendChild(outside);
    const rendition = {
      hooks: {content: {register: jasmine.createSpy()}, unloaded: {register: jasmine.createSpy()}},
      on: (event: string, handler: (...args: any[]) => void) => handlers.set(event, handler),
      themes: {register: jasmine.createSpy(), select: jasmine.createSpy(), fontSize: jasmine.createSpy()},
      display: jasmine.createSpy().and.callFake(async () => {
        const scroller = document.createElement('div');
        scroller.className = 'epub-container';
        viewer.appendChild(scroller);
        handlers.get('attached')!();
        expect(scroller.style.overflowAnchor).toBe('none');
        expect(outside.style.overflowAnchor).toBe('');
      })
    };
    component['book'] = {renderTo: jasmine.createSpy().and.returnValue(rendition)};

    await component['createAndDisplayRendition'](viewer);

    expect(rendition.display).toHaveBeenCalledTimes(1);
    expect(component['book'].renderTo).toHaveBeenCalledWith(viewer, jasmine.objectContaining({
      manager: 'continuous', flow: 'scrolled'
    }));
  });
  it('observes iframe activity and detaches on unload/close without changing rendition navigation', async () => {
    const content = jasmine.createSpy(), unloaded = jasmine.createSpy(), detach = jasmine.createSpy();
    const observe = spyOn(TestBed.inject(SessionActivityService), 'observe').and.returnValue(detach);
    const rendition = {
      manager:{layout:{name:'reflowable'}},
      hooks:{content:{register:content},unloaded:{register:unloaded}}, on:jasmine.createSpy(),
      themes:{register:jasmine.createSpy(),select:jasmine.createSpy(),fontSize:jasmine.createSpy()},
      display:jasmine.createSpy().and.resolveTo()
    };
    component['book']={renderTo:()=>rendition};
    await component['createAndDisplayRendition'](fixture.nativeElement.querySelector('#viewer'));
    const doc = document.implementation.createHTMLDocument('reader');
    doc.body.innerHTML='<p>Selected EPUB text</p>';
    const range=doc.createRange();range.selectNodeContents(doc.body.firstChild!);
    const contents={document:doc,cfiFromRange:(range:Range)=>new EpubCFI(range,'/6/2[chapter]').toString()};
    component.speechContext={archiveId:1,path:'/books/test.epub',book:{getRange:async()=>range,spine:{get:()=>({href:'chapter.xhtml'})}}};
    content.calls.mostRecent().args[0](contents);
    expect(doc.head.querySelector('#libretorio-mobile-margins')).not.toBeNull();
    expect(observe).toHaveBeenCalledOnceWith(doc);
    const stringify=jasmine.createSpy('no full selection string');
    const selection = spyOn(doc,'getSelection').and.returnValue({isCollapsed:false,rangeCount:1,getRangeAt:()=>range,toString:stringify} as unknown as Selection);
    doc.dispatchEvent(new Event('selectionchange'));
    expect(component.speechSelection?.preview).toBe('Selected EPUB text');
    expect(stringify).not.toHaveBeenCalled();
    unloaded.calls.mostRecent().args[0]({document:doc}); expect(detach).toHaveBeenCalledTimes(1);
    selection.calls.reset(); doc.dispatchEvent(new Event('selectionchange'));
    expect(selection).not.toHaveBeenCalled();
    content.calls.mostRecent().args[0]({document:doc});
    component.ngOnDestroy(); expect(detach).toHaveBeenCalledTimes(2);
    content.calls.mostRecent().args[0]({document:doc}); expect(observe).toHaveBeenCalledTimes(2);
    expect(rendition.display).toHaveBeenCalledTimes(1);
  });
});
