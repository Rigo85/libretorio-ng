import {TestBed} from '@angular/core/testing';
import {EMPTY,Subject} from 'rxjs';
import {ReadingHomeComponent} from './reading-home.component';
import {ReadingService} from '../../services/reading.service';
import {BooksService} from '../../services/books.service';
import {LeftPanelUpdateService} from '../../services/left-panel-update.service';
import {CollapseStateService} from '../../services/collapse-state.service';
import {ChangeDetectorRef,ElementRef} from '@angular/core';
import {ActivatedRoute,Router,DefaultUrlSerializer,convertToParamMap} from '@angular/router';
import {Location} from '@angular/common';
import {activityTarget,activityPage,activityPageQuery} from './activity-route';

describe('Activity home',()=>{
  let component:ReadingHomeComponent,api:any,router:any,location:any,modal:any,details:any;
  const key='libretorio:history:filters:unit-home';
  const row=()=>({id:'row',archiveId:1,snapshot:{name:'test',fileKind:'EPUB'},progress:[
    {representation:'epub',position:{percent:20},updatedAt:'2026-01-02'},
    {representation:'converted-pdf',position:{page:3},updatedAt:'2026-01-01'}]});
  beforeEach(()=>{
    localStorage.removeItem(key);
    api={identity:()=>Promise.resolve({userId:'unit-home',epoch:'a',version:1}),progressUpdates:new Subject(),
      visit:jasmine.createSpy('visit').and.resolveTo(),
      request:jasmine.createSpy('request').and.resolveTo({items:[],next:null})};
    const serializer=new DefaultUrlSerializer();
    router={url:'/inicio',createUrlTree:(_commands:any,options:any)=>serializer.parse('/inicio'+(Object.keys(options.queryParams).length?'?'+new URLSearchParams(options.queryParams):'')),
      serializeUrl:(url:any)=>serializer.serialize(url),navigateByUrl:jasmine.createSpy('navigateByUrl').and.resolveTo(true)};
    location={getState:()=>({}),back:jasmine.createSpy('back')};
    modal={visible:jasmine.createSpy('visible').and.resolveTo(),dispose:jasmine.createSpy('dispose').and.resolveTo()};
    details={hideManagedReader:jasmine.createSpy('hideManagedReader').and.resolveTo(),showManagedReader:jasmine.createSpy('showManagedReader').and.resolveTo()};
    TestBed.configureTestingModule({providers:[
      {provide:ElementRef,useValue:new ElementRef(document.createElement('reading-home'))},
      {provide:Router,useValue:router},{provide:ActivatedRoute,useValue:{queryParamMap:EMPTY}},{provide:Location,useValue:location},
      {provide:ReadingService,useValue:api},{provide:ChangeDetectorRef,useValue:{markForCheck(){},detectChanges(){component.details=component.selected?details:undefined;}}},
      {provide:BooksService,useValue:{incomingMessage$:EMPTY,connectionStatus$:EMPTY,ensureConnected(){}}},
      {provide:LeftPanelUpdateService,useValue:{}},{provide:CollapseStateService,useValue:{}}
    ]});
    component=TestBed.runInInjectionContext(()=>new ReadingHomeComponent());
    (component as any).modal=modal;
  });
  afterEach(()=>{component.ngOnDestroy();localStorage.removeItem(key);});
  it('loads visits by default; classification does not require progress',async()=>{
    component.kind='EPUB';await component.load();
    expect(api.request).toHaveBeenCalledWith('GET','/history?mode=recent&kind=EPUB',undefined,undefined,jasmine.any(AbortSignal));
    component.onlyProgress=true;await component.load();
    expect(api.request).toHaveBeenCalledWith('GET','/history?mode=continue&kind=EPUB',undefined,undefined,jasmine.any(AbortSignal));
  });
  it('restores per-user filters without importing anonymous preferences',async()=>{
    localStorage.setItem(key,JSON.stringify({onlyProgress:true,kind:'AUDIOBOOK'}));
    component.ngOnInit();await Promise.resolve();await Promise.resolve();
    expect(component.onlyProgress).toBeTrue();expect(component.kind).toBe('AUDIOBOOK');
  });
  it('ignores late responses from superseded filters',async()=>{
    let resolve!:(data:any)=>void;api.request.and.returnValue(new Promise(done=>resolve=done));
    const old=component.load();api.request.and.resolveTo({items:[row()],next:null});
    await component.load();resolve({items:[],next:'old'});await old;
    expect(component.items.length).toBe(1);expect(component.next).toBeNull();
  });
  it('updates saved positions in place without reordering the list',async()=>{
    component.ngOnInit();await Promise.resolve();await Promise.resolve();await Promise.resolve();
    component.items=[{...row(),id:'other',archiveId:2},row()];
    api.progressUpdates.next({id:1,format:'epub',userId:'unit-home',epoch:'a',saved:{position:{percent:42},updated_at:'2026-02-01'}});
    expect(component.items.map(item=>item.archiveId)).toEqual([2,1]);
    expect(component.chosen(component.items[1]).position.percent).toBe(42);
    api.progressUpdates.next({id:1,format:'epub',userId:'another',epoch:'b',saved:{position:{percent:99}}});
    expect(component.chosen(component.items[1]).position.percent).toBe(42);
  });
  it('defaults to the latest representation and keeps explicit choice',()=>{
    const item=row();expect(component.chosen(item).representation).toBe('epub');
    component.versions[item.id]='converted-pdf';expect(component.chosen(item).position.page).toBe(3);
  });
  it('identifies audio tracks without exposing their absolute catalogue path',()=>{
    expect(component.track({position:{track:'disc 1/chapter.m4b'}})).toBe('chapter.m4b');
  });
  it('encodes the archive ID and representation in Router navigation, not a disk path or cover ID',async()=>{
    await component.open(row(),'epub');
    expect(router.serializeUrl(router.navigateByUrl.calls.mostRecent().args[0])).toBe('/inicio?archivo=1&vista=original');
    await component.open(row(),'converted-pdf');
    expect(router.serializeUrl(router.navigateByUrl.calls.mostRecent().args[0])).toBe('/inicio?archivo=1&vista=pdf-preparado');
    expect(api.request).not.toHaveBeenCalled();
  });
  function apply(target:any){const c=component as any;c.target=target;return c.applyTarget(target,++c.openGeneration);}
  it('continues a comic on the existing original route and validates its representation',async()=>{
    api.request.and.callFake((_method:string,url:string)=>Promise.resolve(url==='/items/1'?{id:1,name:'book.cbz',fileKind:'FILE'}:{sourcePath:'/books/book.cbz'}));
    await component.open(row(),'comic');expect(router.serializeUrl(router.navigateByUrl.calls.mostRecent().args[0])).toBe('/inicio?archivo=1&vista=original');
    await apply({id:1,view:'original'});
    expect(api.request).toHaveBeenCalledWith('GET','/items/1/progress/comic?fresh=1');
    expect(details.showManagedReader).toHaveBeenCalledWith('original','/books/book.cbz');
    expect(component.location({position:{page:4,chunk:2}})).toBe('Pagina 5');
  });
  it('opens a direct link independently of history pagination and ignores late archive responses',async()=>{
    let finish!:(value:any)=>void;
    api.request.and.callFake((_method:string,url:string)=>url==='/items/1'?new Promise(done=>finish=done):Promise.resolve({id:2}));
    const first=apply({id:1});
    await new Promise(done=>setTimeout(done,0));
    await apply({id:2});finish({id:1});await first;
    expect(component.selected?.id).toBe(2);expect(component.items).toEqual([]);
    expect(api.visit).toHaveBeenCalledOnceWith(2);
  });
  it('opens only the reader for a direct reader link, and returns to details without a duplicate visit',async()=>{
    api.request.and.callFake((_method:string,url:string)=>Promise.resolve(url==='/items/1'?{id:1,name:'book.pdf',fileKind:'FILE'}:{sourcePath:'/books/book.pdf'}));
    await apply({id:1,view:'original'});
    expect(api.request).toHaveBeenCalledWith('GET','/items/1/progress/pdf?fresh=1');
    expect(details.showManagedReader).toHaveBeenCalledOnceWith('original','/books/book.pdf');
    expect(modal.visible).not.toHaveBeenCalledWith(true);
    await apply({id:1});expect(details.hideManagedReader).toHaveBeenCalled();expect(modal.visible).toHaveBeenCalledWith(true);
    expect(api.visit).toHaveBeenCalledTimes(1);
  });
  it('does not redirect out of the site when closing a direct link',()=>{
    (component as any).closeTarget();
    expect(location.back).not.toHaveBeenCalled();
    expect(router.navigateByUrl.calls.mostRecent().args[1]).toEqual({replaceUrl:true});
  });
  it('uses Back only when this component created the matching parent entry',()=>{
    location.getState=()=>({activityOwner:(component as any).navigationOwner,activityParent:'/inicio'});
    (component as any).closeTarget();expect(location.back).toHaveBeenCalledTimes(1);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });
  it('validates duplicate parameters, IDs and views before making any requests',()=>{
    expect(activityTarget(convertToParamMap({}))).toBeUndefined();
    expect(activityTarget(convertToParamMap({archivo:'123',vista:'original'}))).toEqual({id:123,view:'original'});
    for(const query of [{archivo:['1','2']},{archivo:'0'},{archivo:'-1'},{archivo:'1e2'},{archivo:'9007199254740992'},{vista:'original'},
      {archivo:'1',vista:'https://example.com'},{archivo:'1',vista:['original','original']}])expect(()=>activityTarget(convertToParamMap(query))).toThrow();
  });
  it('retains one page and bounded auxiliary state after traversing many pages',async()=>{
    for(let page=0;page<100;page++){
      component.failedCovers.add('previous');component.versions['previous']='pdf';
      const rows=Array.from({length:20},(_,i)=>({...row(),id:`${page}:${i}`,archiveId:page*20+i+1}));
      api.request.and.resolveTo({items:rows,next:'older',previous:'newer',paginationVersion:2});
      await component.load({mode:'recent',kind:'',before:String(page)});
      expect(component.items.length).toBe(20);expect(component.items[0].id).toBe(`${page}:0`);
      expect(component.failedCovers.size).toBe(0);expect(Object.keys(component.versions).length).toBe(0);
    }
  });
  it('retains the displayed page and rolls back the URL on failed navigation',async()=>{
    api.request.and.resolveTo({items:[row()],next:'older',previous:null,paginationVersion:2});
    await component.load();router.url='/inicio?mode=recent&before=older';
    api.request.and.rejectWith({status:503});await component.load({mode:'recent',kind:'',before:'older',explicit:true});
    expect(component.items[0].id).toBe('row');expect(component.next).toBe('older');
    expect(router.serializeUrl(router.navigateByUrl.calls.mostRecent().args[0])).toBe('/inicio');
    expect(component.error).toContain('No se pudo');
  });
  it('aborts superseded history requests and disposal without aborting readers',async()=>{
    await component.load();const signal=api.request.calls.mostRecent().args[4] as AbortSignal;
    await component.load();expect(signal.aborted).toBeTrue();
    const last=api.request.calls.mostRecent().args[4] as AbortSignal;component.ngOnDestroy();expect(last.aborted).toBeTrue();
  });
  it('preserves filters and cursor when opening and closing a reader',async()=>{
    const page={mode:'continue' as const,kind:'FILE',before:'opaque',explicit:true};
    (component as any).page=page;await component.open(row(),'pdf');
    const params=router.navigateByUrl.calls.mostRecent().args[0].queryParams;
    expect(params).toEqual({mode:'continue',kind:'FILE',before:'opaque',archivo:'1',vista:'original'});
    (component as any).closeTarget();
    expect(router.navigateByUrl.calls.mostRecent().args[0].queryParams).toEqual(activityPageQuery(page));
  });
  it('does not reopen the reader when only pagination parameters change',async()=>{
    const params=new Subject<any>();(TestBed.inject(ActivatedRoute) as any).queryParamMap=params;
    const apply=spyOn<any>(component,'applyTarget').and.resolveTo();
    component.ngAfterViewInit();params.next(convertToParamMap({archivo:'1',vista:'original'}));await Promise.resolve();
    params.next(convertToParamMap({archivo:'1',vista:'original',before:'opaque',mode:'recent'}));await Promise.resolve();
    expect(apply).toHaveBeenCalledTimes(1);
  });
  it('gives explicit URL filters precedence and rejects malformed page descriptors',()=>{
    expect(activityPage(convertToParamMap({mode:'recent'}),{mode:'continue',kind:'EPUB'})).toEqual({mode:'recent',kind:'',before:undefined,after:undefined,explicit:true});
    for(const query of [{before:'a',after:'b'},{mode:['recent','continue']},{kind:'wrong'},{before:''},{after:'a'.repeat(513)}])expect(()=>activityPage(convertToParamMap(query))).toThrow();
  });
});
