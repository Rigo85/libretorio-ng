import {AfterViewInit,ChangeDetectionStrategy,ChangeDetectorRef,Component,DestroyRef,ElementRef,OnDestroy,OnInit,ViewChild,inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute,Router} from '@angular/router';
import {HttpClient} from '@angular/common/http';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {Subscription,timeout,filter,take} from 'rxjs';
import {ReadingService} from '../../services/reading.service';
import {BookDetailsPanelComponent} from '../book-details-panel/book-details-panel.component';
import {RoutedModal} from '../helpers/routed-modal';
import {ActivityTarget,ActivityView,activityTarget} from '../reading-home/activity-route';
import {File} from '../../core/headers';
import {BooksService} from '../../services/books.service';
import {LeftPanelUpdateService} from '../../services/left-panel-update.service';
import {CollapseStateService} from '../../services/collapse-state.service';
import {getTitle} from '../../core/headers';
import {AuthorPipe} from '../../pipes/author.pipe';

const defaults={q:'',title:'',author:'',isbn:'',description:'',language:'',folder:'',kind:'',sort:'relevance',subfolders:'1'};
@Component({selector:'catalogue-search',imports:[FormsModule,BookDetailsPanelComponent],changeDetection:ChangeDetectionStrategy.Eager,
  templateUrl:'./catalogue-search.component.html',styleUrl:'./catalogue-search.component.scss'})
export class CatalogueSearchComponent implements OnInit,AfterViewInit,OnDestroy {
  private books=inject(BooksService);private left=inject(LeftPanelUpdateService);private collapse=inject(CollapseStateService);
  private route=inject(ActivatedRoute);private router=inject(Router);private http=inject(HttpClient);
  private reading=inject(ReadingService);private destroy=inject(DestroyRef);private cdr=inject(ChangeDetectorRef);
  private host:ElementRef<HTMLElement>=inject(ElementRef);private subscription?:Subscription;private generation=0;private key='';
  private closed=false;private modal?:RoutedModal;private modalElement?:HTMLElement;private modalWork=Promise.resolve();
  private openingGeneration=0;private targetKey='';private applying=false;private activeView?:ActivityView;
  @ViewChild(BookDetailsPanelComponent) details?:BookDetailsPanelComponent;
  draft={...defaults};committed:Record<string,string>={};advanced=false;loading=false;error='';openingError='';
  items:any[]=[];next?:string;previous?:string;selected?:File;elapsed=0;failedCovers=new Set<number>();
  private hidden=()=>{if(!this.applying&&!this.closed)void this.closeDetails();};
  get hasQuery(){return Object.keys(defaults).some(key=>!['sort','subfolders'].includes(key)&&!!this.committed[key]);}
  ngOnInit(){
    this.books.incomingMessage$.pipe(filter(message=>message.event==='list'&&!!message.data?.directories),take(1),takeUntilDestroyed(this.destroy)).subscribe(message=>{
      this.collapse.initializeCollapseStates(message.data.directories);this.left.setDirectories(message.data.directories);
    });
    this.books.connectionStatus$.pipe(filter(Boolean),take(1),takeUntilDestroyed(this.destroy)).subscribe(()=>this.books.onBooksList(undefined,true));
    this.books.ensureConnected();
  }
  ngAfterViewInit(){
    const modalElement=this.host.nativeElement.querySelector<HTMLElement>('.search-details')!;
    this.modalElement=modalElement;this.modal=new RoutedModal(modalElement);modalElement.addEventListener('hidden.bs.modal',this.hidden);
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroy)).subscribe(params=>{void Promise.resolve().then(()=>{
      if(this.closed)return;
      const query:Record<string,string>={};for(const name of [...Object.keys(defaults),'before','after']){
        if(params.has(name))query[name]=params.get(name)!;
      }
      const key=JSON.stringify(query);
      if(key!==this.key){this.key=key;this.committed=query;this.draft={...defaults,...query};this.advanced=params.get('advanced')==='1'||Object.keys(defaults).some(k=>!['q','sort','subfolders'].includes(k)&&!!query[k]);this.load();}
      else if(params.get('advanced')==='1')this.advanced=true;
      let target:ActivityTarget|undefined;try{target=activityTarget(params);}catch{this.openingError='Enlace de material no valido.';}
      const targetKey=JSON.stringify(target)??'';
      if(this.targetKey!==targetKey){this.targetKey=targetKey;const generation=++this.openingGeneration;
        void Promise.resolve().then(()=>this.applyTarget(target?.id,target?.view,generation));}
      this.cdr.markForCheck();
    });});
  }
  submit(){
    const query=Object.fromEntries(Object.entries(this.draft).filter(([key,value])=>Object.hasOwn(defaults,key)&&value.trim()).map(([key,value])=>[key,value.trim()]));
    void this.router.navigate(['/buscar'],{queryParams:query});
  }
  turn(previous=false){const cursor=previous?this.previous:this.next;if(!cursor||this.loading)return;
    void this.router.navigate(['/buscar'],{queryParams:{...this.committed,before:previous?cursor:null,after:previous?null:cursor}});
  }
  load(){
    this.subscription?.unsubscribe();const generation=++this.generation;this.items=[];this.failedCovers.clear();this.next=this.previous=undefined;this.error='';
    if(!this.hasQuery){this.loading=false;return;}
    this.loading=true;
    this.subscription=this.http.get<any>('/api/catalogue/search',{params:this.committed,withCredentials:true}).pipe(timeout(12000)).subscribe({
      next:data=>{if(generation!==this.generation)return;
        if(data?.version!==1||!Array.isArray(data.items)){this.error='Este backend aun no dispone de la nueva busqueda.';this.loading=false;return;}
        this.items=data.items.slice(0,50).map((item:File)=>({...item,title:getTitle(item),author:new AuthorPipe().transform(item)}));this.next=data.next;this.previous=data.previous;this.elapsed=data.elapsedMs;this.loading=false;this.cdr.markForCheck();},
      error:error=>{if(generation!==this.generation)return;this.loading=false;
        this.error=error.status===400?'Revisa los filtros y las comillas de la consulta.':error.status===429?'Hay una busqueda en curso. Espera un momento y vuelve a intentar.':
          error.error?.code==='SEARCH_TIMEOUT'?'La consulta excedio el tiempo permitido. Acota los filtros.':'No se pudo consultar el catalogo. Vuelve a intentar.';this.cdr.markForCheck();}
    });
  }
  open(id:number,view?:ActivityView){return this.router.navigate([],{relativeTo:this.route,queryParams:{archivo:id,vista:view??null},queryParamsHandling:'merge'});}
  closeDetails(){return this.router.navigate([],{relativeTo:this.route,queryParams:{archivo:null,vista:null},queryParamsHandling:'merge',replaceUrl:true});}
  requestReader(view:ActivityView){if(this.selected)void this.open(this.selected.id,view);}
  readerClosed(){if(!this.applying&&!this.closed&&this.selected)void this.open(this.selected.id);}
  private async applyTarget(id:number|undefined,view:ActivityView|undefined,generation:number){
    const current=()=>!this.closed&&generation===this.openingGeneration;
    this.modalWork=this.modalWork.catch(()=>{}).then(async()=>{
      if(!current())return;this.applying=true;this.openingError='';
      try{
        if(this.selected?.id!==id||this.activeView!==view){await this.details?.hideManagedReader();this.activeView=undefined;}
        if(this.selected?.id!==id||!id){await this.modal?.visible(false);this.selected=undefined;this.cdr.detectChanges();}
        if(!id||!current())return;
        const file=this.selected??await this.reading.request<File>('GET',`/items/${id}`);
        if(!current())return;this.selected=file;this.cdr.detectChanges();
        if(view){await this.modal?.visible(false);if(current()){await this.details?.showManagedReader(view);this.activeView=view;}}
        else await this.modal?.visible(true);
        if(current())void this.reading.visit(id).catch(()=>{});
      }catch{if(current())this.openingError='No se pudo abrir el material. Comprueba su disponibilidad.';}
      finally{this.applying=false;this.cdr.markForCheck();}
    });await this.modalWork;
  }
  cover(item:any){return item.cover&&!this.failedCovers.has(item.id)?`/covers/${encodeURIComponent(item.cover)}.webp`:'';}
  ngOnDestroy(){this.closed=true;++this.generation;++this.openingGeneration;this.subscription?.unsubscribe();
    this.modalElement?.removeEventListener('hidden.bs.modal',this.hidden);const modal=this.modal;
    void this.modalWork.finally(()=>this.details?.hideManagedReader()).finally(()=>modal?.dispose(true));}
}
