import {TestBed, ComponentFixture} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {provideRouter, Router} from '@angular/router';
import {CatalogueSearchComponent} from './catalogue-search.component';
import {BooksService} from '../../services/books.service';
import {ReadingService} from '../../services/reading.service';
import {LeftPanelUpdateService} from '../../services/left-panel-update.service';
import {CollapseStateService} from '../../services/collapse-state.service';
import {bookFixture} from '../../testing/book-fixture';

describe('CatalogueSearchComponent material filters',()=>{
  let fixture:ComponentFixture<CatalogueSearchComponent>,component:CatalogueSearchComponent,http:HttpTestingController;
  beforeAll(()=>{
    // Angular caches lifecycle hooks from the prototype when compiling the view.
    spyOn(CatalogueSearchComponent.prototype,'ngOnInit');
    spyOn(CatalogueSearchComponent.prototype,'ngAfterViewInit');
  });
  beforeEach(async()=>{
    await TestBed.configureTestingModule({imports:[CatalogueSearchComponent],providers:[
      provideRouter([]),provideHttpClient(),provideHttpClientTesting(),
      ...[BooksService,ReadingService,LeftPanelUpdateService,CollapseStateService].map(provide=>({provide,useValue:{}}))
    ]}).compileComponents();
    fixture=TestBed.createComponent(CatalogueSearchComponent);component=fixture.componentInstance;
    http=TestBed.inject(HttpTestingController);fixture.detectChanges();
  });
  afterEach(()=>{http.verify();fixture.destroy();});
  it('renders the same public path as details without mutating the result',()=>{
    const item={...bookFixture(),parentPath:'/home/rigo/Libretorio-Scanner/dist/public/books/Fantasía',title:'Sample'};
    component.items=[item];fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.path').textContent).toBe('/books/Fantasía/sample.pdf');
    expect(item.parentPath).toBe('/home/rigo/Libretorio-Scanner/dist/public/books/Fantasía');
    const navigate=spyOn(TestBed.inject(Router),'navigate').and.resolveTo(true);
    fixture.nativeElement.querySelector('h2 button').click();
    expect(navigate).toHaveBeenCalledWith([],jasmine.objectContaining({queryParams:{archivo:item.id,vista:null},queryParamsHandling:'merge'}));
  });
  it('offers all materials and keeps an old kind filter visible until replaced',async()=>{
    component.advanced=true;component.draft.kind='EPUB';fixture.detectChanges();
    await fixture.whenStable();fixture.detectChanges();
    const select:HTMLSelectElement=fixture.nativeElement.querySelector('[name=material]');
    expect([...select.options].map(option=>option.text)).toEqual(['Todos','PDF','EPUB','Audiolibros','Comics/manga']);
    expect(fixture.nativeElement.querySelector('[name=kind]')).not.toBeNull();
    select.value='audio';select.dispatchEvent(new Event('change'));fixture.detectChanges();
    expect(component.draft.material).toBe('audio');expect(component.draft.kind).toBe('');
    expect(fixture.nativeElement.querySelector('[name=kind]')).toBeNull();
  });
  it('submits the new filter without old pagination or modal query parameters',()=>{
    const navigate=spyOn(TestBed.inject(Router),'navigate').and.resolveTo(true);
    Object.assign(component.draft,{kind:'FILE',after:'stale',archivo:'3',vista:'original'});
    component.selectMaterial('epub');component.submit();
    expect(navigate).toHaveBeenCalledOnceWith(['/buscar'],{queryParams:{sort:'relevance',subfolders:'1',material:'epub'}});
    component.draft.kind='FILE';component.selectMaterial('');expect(component.draft.kind).toBe('');
  });
  it('sends a material-only search to the backend and preserves it across pages',()=>{
    component.committed={material:'audio'};expect(component.hasQuery).toBeTrue();component.load();
    const request=http.expectOne(req=>req.url==='/api/catalogue/search'&&req.params.get('material')==='audio');
    expect(request.request.withCredentials).toBeTrue();
    request.flush({version:1,items:[bookFixture()],next:'next-page',previous:'previous-page'});
    expect(component.items.length).toBe(1);
    const navigate=spyOn(TestBed.inject(Router),'navigate').and.resolveTo(true);
    component.turn();expect(navigate).toHaveBeenCalledWith(['/buscar'],{queryParams:{material:'audio',before:null,after:'next-page'}});
    component.turn(true);expect(navigate).toHaveBeenCalledWith(['/buscar'],{queryParams:{material:'audio',before:'previous-page',after:null}});
  });

  for(const [status,code,text,retry] of [
    [400,'INVALID_FOLDER','segmentos',false],[400,'UNFINISHED_PHRASE','comilla',false],
    [400,'INVALID_ISBN','ISBN',false],[503,'SEARCH_TIMEOUT','Acota',false],
    [503,'SEARCH_UNAVAILABLE','Vuelve a intentar',true],[429,'SEARCH_BUSY','Espera',true],
    [401,'UNAUTHENTICATED','sesion',false]
  ] as const)it(`shows a specific ${code} message and only retries temporary failures`,()=>{
    component.committed={folder:'Biblioteca Ebooks Español 2026 (epub)',author:'Barbara Hambly'};component.load();
    const request=http.expectOne(req=>req.url==='/api/catalogue/search');
    expect(request.request.params.get('folder')).toBe(component.committed['folder']);
    request.flush({code},{status,statusText:'Test failure'});fixture.detectChanges();
    expect(component.error).toContain(text);expect(component.retryable).toBe(retry);
    expect(fixture.nativeElement.querySelector('.status button')?.textContent?.trim()).toBe(retry?'Reintentar':undefined);
  });
  it('offers a first page for an obsolete cursor without clearing filters or reader parameters',()=>{
    component.committed={folder:'Biblioteca',author:'Barbara',after:'old'};component.load();
    http.expectOne(req=>req.url==='/api/catalogue/search').flush({code:'INVALID_CURSOR'},{status:400,statusText:'Bad Request'});
    fixture.detectChanges();expect(component.invalidCursor).toBeTrue();expect(component.retryable).toBeFalse();
    const navigate=spyOn(TestBed.inject(Router),'navigate').and.resolveTo(true);
    fixture.nativeElement.querySelector('.status button').click();
    expect(navigate).toHaveBeenCalledWith([],jasmine.objectContaining({queryParams:{before:null,after:null},queryParamsHandling:'merge',replaceUrl:true}));
  });
  function opening(){
    const state=component as any,file=bookFixture(),path=`/cache/${file.coverId}/${file.coverId}.pdf`;
    const request=jasmine.createSpy('request').and.resolveTo({sourcePath:path}),visit=jasmine.createSpy('visit').and.resolveTo();
    Object.assign(TestBed.inject(ReadingService),{request,visit});
    const show=jasmine.createSpy('showManagedReader').and.resolveTo(),hide=jasmine.createSpy('hideManagedReader').and.resolveTo();
    state.details={showManagedReader:show,hideManagedReader:hide};
    const visible=jasmine.createSpy('visible').and.resolveTo();state.modal={visible,dispose:async()=>{}};
    spyOn(state.cdr,'detectChanges');component.selected=file;
    const navigate=spyOn(TestBed.inject(Router),'navigate').and.resolveTo(true);
    const apply=(view='pdf-preparado')=>state.applyTarget(file.id,view,++state.openingGeneration);
    return {state,file,path,request,visit,show,hide,visible,navigate,apply};
  }
  it('validates a prepared PDF before hiding details and passes the checked source path',async()=>{
    const t=opening();let resolve!:(value:any)=>void;
    t.request.and.returnValue(new Promise(done=>resolve=done));
    const done=t.apply();await Promise.resolve();await Promise.resolve();await Promise.resolve();
    expect(t.visible).not.toHaveBeenCalledWith(false);expect(t.show).not.toHaveBeenCalled();
    resolve({sourcePath:t.path});await done;
    expect(t.request).toHaveBeenCalledOnceWith('GET',`/items/${t.file.id}/progress/converted-pdf?fresh=1`);
    expect(t.show).toHaveBeenCalledOnceWith('pdf-preparado',t.path);expect(t.state.activeView).toBe('pdf-preparado');
    expect(t.visit).toHaveBeenCalledOnceWith(t.file.id);
  });
  it('loads the item and prepared source for a direct reader link',async()=>{
    const t=opening();component.selected=undefined;
    t.request.and.callFake(async(_method:string,path:string)=>path.endsWith('?fresh=1')?{sourcePath:t.path}:t.file);
    await t.apply();expect(t.request).toHaveBeenCalledWith('GET',`/items/${t.file.id}`);
    expect(t.show).toHaveBeenCalledOnceWith('pdf-preparado',t.path);
  });
  for(const failure of [
    {error:{status:409,error:{code:'PDF_NOT_READY'}},text:'El PDF no esta disponible'},
    {error:{status:409,error:{code:'SOURCE_UNAVAILABLE'}},text:'ruta registrada'},
    {error:{status:404},text:'ruta registrada'},
    {error:{status:401},text:'La sesion vencio'},
    {error:{status:403},text:'No tienes permiso'},
    {error:{status:0},text:'Revisa la conexion'},
    {error:{name:'TimeoutError'},text:'Revisa la conexion'},
    {error:{status:500},text:'vuelve a intentar'}
  ])it(`keeps details and permits retry after ${JSON.stringify(failure.error)}`,async()=>{
    const t=opening();t.request.and.rejectWith(failure.error);await t.apply();
    expect(t.show).not.toHaveBeenCalled();expect(t.visible).not.toHaveBeenCalledWith(false);
    expect(t.visible).toHaveBeenCalledWith(true);expect(component.openingError).toContain(failure.text);
    expect(t.visit).not.toHaveBeenCalled();
    expect(t.navigate).toHaveBeenCalledWith([],jasmine.objectContaining({queryParams:{vista:null},queryParamsHandling:'merge',replaceUrl:true}));
    expect(t.state.targetKey).toBe(JSON.stringify({id:t.file.id}));
    t.request.and.resolveTo({sourcePath:t.path});await t.apply();
    expect(t.show).toHaveBeenCalledOnceWith('pdf-preparado',t.path);expect(component.openingError).toBe('');
  });
  it('does not accept an absent or unexpected prepared path',async()=>{
    const t=opening();
    for(const sourcePath of [undefined,'/books/other.pdf','/cache/other/other.pdf']){
      t.request.and.resolveTo({sourcePath});await t.apply();
      expect(t.show).not.toHaveBeenCalled();expect(component.openingError).toContain('El PDF no esta disponible');
    }
  });
  it('restores details if the reader itself cannot open',async()=>{
    const t=opening();t.show.and.rejectWith(new Error('READER_NOT_READY'));await t.apply();
    expect(t.visible.calls.allArgs()).toEqual([[false],[true]]);
    expect(t.state.activeView).toBeUndefined();expect(t.navigate).toHaveBeenCalled();
  });
  it('leaves original readers on their existing path without querying conversions',async()=>{
    const t=opening();await t.apply('original');
    expect(t.request).not.toHaveBeenCalled();expect(t.show).toHaveBeenCalledOnceWith('original',undefined);
  });
  for(const reject of [false,true])it(`ignores a stale prepared lookup (reject=${reject})`,async()=>{
    const t=opening();let finish!:(value:any)=>void;
    t.request.and.returnValue(new Promise((resolve,rejectPromise)=>finish=reject?rejectPromise:resolve));
    const done=t.apply();await Promise.resolve();await Promise.resolve();await Promise.resolve();
    ++t.state.openingGeneration;finish(reject?{status:409,error:{code:'PDF_NOT_READY'}}:{sourcePath:t.path});await done;
    expect(t.show).not.toHaveBeenCalled();expect(t.visible).not.toHaveBeenCalled();expect(t.navigate).not.toHaveBeenCalled();expect(component.openingError).toBe('');
  });
  it('releases focused details controls before aria-hidden and restores the initiating button',()=>{
    const t=opening(),element:HTMLElement=fixture.nativeElement.querySelector('.search-details');
    t.state.modalElement=element;
    const opener=document.createElement('button');document.body.append(opener);opener.focus();t.state.showing();
    const button:HTMLButtonElement=element.querySelector('button')!;element.style.display='block';button.focus();
    expect(element.contains(document.activeElement)).toBeTrue();t.state.hiding();expect(element.contains(document.activeElement)).toBeFalse();
    t.state.hidden();expect(document.activeElement).toBe(opener);opener.remove();
  });
});
