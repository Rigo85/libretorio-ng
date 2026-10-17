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
});
