import {ComponentFixture,TestBed} from '@angular/core/testing';
import {signal} from '@angular/core';
import {Subject} from 'rxjs';
import {NgxSpinnerService} from 'ngx-spinner';
import {ComicViewerComponent} from './comic-viewer.component';
import {BooksService} from '../../services/books.service';
import {ReadingService} from '../../services/reading.service';

describe('Comic reading progress',()=>{
  let fixture:ComponentFixture<ComicViewerComponent>,component:ComicViewerComponent,books:any,reading:any,tracker:any,requests:Subject<any>[];
  const revision='a'.repeat(64),image='data:image/png;base64,eA==';
  beforeEach(async()=>{
    requests=[];tracker={context:{sourceRevision:revision},status:signal(''),ready:false,blocked:false,capture:jasmine.createSpy('capture'),dispose:jasmine.createSpy('dispose')};
    reading={begin:jasmine.createSpy('begin').and.callFake(async()=>tracker)};
    books={getComicPages:jasmine.createSpy('getComicPages').and.callFake(()=>{const s=new Subject();requests.push(s);return s.asObservable();})};
    await TestBed.configureTestingModule({imports:[ComicViewerComponent],providers:[
      {provide:ReadingService,useValue:reading},{provide:BooksService,useValue:books},
      {provide:NgxSpinnerService,useValue:{show:()=>{},hide:()=>{}}}
    ]}).compileComponents();
    fixture=TestBed.createComponent(ComicViewerComponent);component=fixture.componentInstance;
    component.id='cover';component.archiveId=1;component.comicSrc='/book.cbz';
  });
  afterEach(()=>fixture.destroy());
  async function open(){component.ngOnChanges();await Promise.resolve();}
  function block(index:number,first:number,length:number,total=6){requests.at(-1)!.next({success:'OK',sourceRevision:revision,
    pages:{index,pageIndex:first,currentPagesLength:length,totalPages:total,pages:Array(length).fill(image)}});}
  function loaded(){component.imageLoaded(component.frames[0]);}
  function move(n:number){(component as any).move(n);}
  it('reports the header position only for the current loaded image, never failed or stale images',async()=>{
    const changed=spyOn(component.pageChanged,'emit');
    await open();block(0,1,2);expect(changed).not.toHaveBeenCalled();
    loaded();expect(changed).toHaveBeenCalledOnceWith({current:1,total:6});
    move(1);const failed=component.frames[0];component.imageFailed(failed);
    expect(changed).toHaveBeenCalledTimes(1);
    component.retry();component.imageLoaded(failed);expect(changed).toHaveBeenCalledTimes(1);
    loaded();expect(changed).toHaveBeenCalledWith({current:2,total:6});
    const previous=component.frames[0];component.comicSrc='';component.ngOnChanges();component.imageLoaded(previous);
    expect(changed).toHaveBeenCalledTimes(2);
  });
  it('does not record progress for opening alone, and commits only loaded user navigation',async()=>{
    await open();block(0,1,2);loaded();expect(tracker.capture).not.toHaveBeenCalled();
    move(1);expect(component.currentPage).toBe(1);expect(tracker.capture).not.toHaveBeenCalled();
    loaded();expect(component.currentPage).toBe(2);expect(tracker.capture).toHaveBeenCalledOnceWith({version:1,page:1,chunk:0});
  });
  it('restores the saved block directly, without walking previous blocks or overwriting the bookmark',async()=>{
    tracker.restored={version:1,page:4,chunk:2};await open();
    expect(books.getComicPages).toHaveBeenCalledOnceWith(1,'cover',2,revision);
    block(2,4,3);loaded();expect(component.currentPage).toBe(5);expect(tracker.capture).not.toHaveBeenCalled();
  });
  it('crosses variable-sized blocks both ways and permits only one pending navigation',async()=>{
    await open();block(0,1,2);loaded();move(1);loaded();move(1);move(1);
    expect(books.getComicPages).toHaveBeenCalledTimes(2);expect(component.currentPage).toBe(2);
    block(1,3,1);loaded();expect(component.currentPage).toBe(3);
    move(1);block(2,4,3);loaded();move(-1);block(1,3,1);loaded();
    expect(component.currentPage).toBe(3);expect(component.pages.length).toBe(1);
  });
  it('failed image or block never commits a requested page; retry commits only on load',async()=>{
    await open();block(0,1,2);loaded();move(1);component.imageFailed(component.frames[0]);
    expect(tracker.capture).not.toHaveBeenCalled();expect(component.currentPage).toBe(1);
    component.retry();loaded();expect(component.currentPage).toBe(2);
    tracker.capture.calls.reset();move(1);requests.at(-1)!.error(new Error('offline'));
    expect(component.currentPage).toBe(2);expect(tracker.capture).not.toHaveBeenCalled();
    component.retry();block(1,3,1);loaded();expect(tracker.capture).toHaveBeenCalledOnceWith({version:1,page:2,chunk:1});
  });
  it('ignores stale image events and late block replies after closing without destruction',async()=>{
    await open();block(0,1,2);loaded();move(1);const frame=component.frames[0];
    component.comicSrc='';component.ngOnChanges();component.imageLoaded(frame);block(0,1,2);
    expect(tracker.capture).not.toHaveBeenCalled();expect(tracker.dispose).toHaveBeenCalledTimes(1);
    expect(component.frames.length).toBe(0);expect(component.pages.length).toBe(0);move(1);expect(books.getComicPages).toHaveBeenCalledTimes(1);
  });
  it('does not apply a restored marker to regenerated cache or a different page range',async()=>{
    tracker.blocked=true;tracker.restored={version:1,page:4,chunk:2};await open();
    expect(books.getComicPages).toHaveBeenCalledOnceWith(1,'cover',0,revision);block(0,1,2);loaded();
    tracker.blocked=false;move(1);loaded();move(1);
    requests.at(-1)!.next({success:'ERROR',code:'SOURCE_CHANGED'});
    expect(tracker.blocked).toBeTrue();expect(component.canRetry).toBeFalse();expect(component.currentPage).toBe(2);
  });
  it('disposes an async tracker arriving after close without a request or save',async()=>{
    let resolve!:(t:any)=>void;reading.begin.and.returnValue(new Promise(r=>resolve=r));
    component.ngOnChanges();component.comicSrc='';component.ngOnChanges();resolve(tracker);await Promise.resolve();
    expect(tracker.dispose).toHaveBeenCalledOnceWith(false);expect(books.getComicPages).not.toHaveBeenCalled();
  });
});
