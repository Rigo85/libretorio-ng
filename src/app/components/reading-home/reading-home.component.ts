import {AfterViewInit,ChangeDetectionStrategy,ChangeDetectorRef,Component,DestroyRef,ElementRef,OnDestroy,OnInit,ViewChild,inject} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {filter,take} from 'rxjs';
import {DatePipe,Location} from '@angular/common';
import {ActivatedRoute,Router,ParamMap,convertToParamMap} from '@angular/router';
import {FormsModule} from '@angular/forms';
import {ReadingService,ReadingFormat,ReadingIdentity} from '../../services/reading.service';
import {BookDetailsPanelComponent} from '../book-details-panel/book-details-panel.component';
import {TitlePipe} from '../../pipes/title.pipe';
import {AuthorPipe} from '../../pipes/author.pipe';
import {File,getExtension} from '../../core/headers';
import {BooksService} from '../../services/books.service';
import {LeftPanelUpdateService} from '../../services/left-panel-update.service';
import {CollapseStateService} from '../../services/collapse-state.service';
import {RoutedModal} from '../helpers/routed-modal';
import {ActivityTarget,ActivityView,activityTarget,ActivityPage,activityPage,activityPageQuery,firstActivityPage} from './activity-route';

@Component({selector:'reading-home',imports:[DatePipe,FormsModule,TitlePipe,AuthorPipe,BookDetailsPanelComponent],
  changeDetection:ChangeDetectionStrategy.Eager,
  templateUrl:'./reading-home.component.html',styleUrl:'./reading-home.component.scss'})
export class ReadingHomeComponent implements OnInit,AfterViewInit,OnDestroy {
  private api=inject(ReadingService);
  private cdr=inject(ChangeDetectorRef);
  private destroyRef=inject(DestroyRef);
  private host:ElementRef<HTMLElement>=inject(ElementRef);
  private books=inject(BooksService);
  private left=inject(LeftPanelUpdateService);
  private collapse=inject(CollapseStateService);
  private router=inject(Router);
  private route=inject(ActivatedRoute);
  private locationService=inject(Location);
  private generation=0;
  private closed=false;
  private modal?:RoutedModal;
  private identity?:ReadingIdentity;
  private modalElement?:HTMLElement;
  private openGeneration=0;
  private modalWork:Promise<void>=Promise.resolve();
  private applying=false;
  private activeView?:ActivityView;
  private target?:ActivityTarget;
  private navigationOwner=crypto.randomUUID();
  private visitedId?:number;
  private opener?:HTMLElement;
  private defaults:ActivityPage={...firstActivityPage};
  private page:ActivityPage={...firstActivityPage};
  private committedPage?:ActivityPage;
  private requestedPageKey?:string;
  private lastTargetKey?:string;
  private initialized=false;
  private pageRequest?:AbortController;
  private latestParams?:ParamMap;
  private onModalHidden=(event:Event)=>{
    if(event.target!==this.modalElement)return;
    if(!this.closed&&!this.applying){
      this.closeTarget();
      if(this.opener?.isConnected)this.opener.focus();
    }
  };
  readonly failedCovers=new Set<string>();
  readonly versions:Record<string,string>={};
  @ViewChild(BookDetailsPanelComponent) details?:BookDetailsPanelComponent;
  items:any[]=[];
  onlyProgress=false;
  kind='';
  next?:string;
  previous?:string;
  paged=false;
  loading=false;
  opening=false;
  error='';
  openingError='';
  selected?:File;
  ngOnInit(){
    this.books.incomingMessage$.pipe(filter(message=>message.event==='list'),take(1),takeUntilDestroyed(this.destroyRef)).subscribe(message=>{
      if(message.data?.directories){this.collapse.initializeCollapseStates(message.data.directories);this.left.setDirectories(message.data.directories);}
    });
    this.books.connectionStatus$.pipe(filter(Boolean),take(1),takeUntilDestroyed(this.destroyRef)).subscribe(()=>this.books.onBooksList(undefined,true));
    this.api.progressUpdates.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(update=>{
      if(update.userId!==this.identity?.userId||update.epoch!==this.identity.epoch)return;
      const item=this.items.find(row=>row.archiveId===update.id);if(!item)return;
      const progress={representation:update.format,position:update.saved.position,updatedAt:update.saved.updated_at};
      item.progress=[progress,...item.progress.filter((p:any)=>p.representation!==update.format)];
      item.lastVisitedAt=update.saved.updated_at;
      this.versions[item.id]=update.format;this.cdr.markForCheck();
    });
    this.books.ensureConnected();void this.initialize();
  }
  ngAfterViewInit(){
    this.modalElement=this.host.nativeElement.querySelector<HTMLElement>('#historyBookDetailsModal')??undefined;
    if(this.modalElement){
      this.modal=new RoutedModal(this.modalElement);
      this.modalElement.addEventListener('hidden.bs.modal',this.onModalHidden);
    }
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params=>{
      this.latestParams=params;
      if(this.initialized)void this.syncPage(params);
      let target:ActivityTarget|undefined,invalid='';
      try{target=activityTarget(params);}catch{invalid='El enlace del material no es valido.';}
      const key=JSON.stringify([target,invalid]);
      if(key===this.lastTargetKey)return;
      this.lastTargetKey=key;
      const generation=++this.openGeneration;
      // Query-only navigation reuses this component; wait until its view is initialized.
      void Promise.resolve().then(()=>{
        if(this.closed||generation!==this.openGeneration)return;
        this.target=target;void this.applyTarget(target,generation,invalid);
      });
    });
  }
  private async initialize(){
    try {
      this.identity=await this.api.identity();if(this.closed)return;
      if(this.identity){
        try {
          const prefs=JSON.parse(localStorage.getItem(this.filterKey())??'null');
          this.onlyProgress=prefs?.onlyProgress===true;
          if(['','FILE','EPUB','AUDIOBOOK','COMIC-MANGA','NONE'].includes(prefs?.kind))this.kind=prefs.kind;
        }catch{}
      }
      this.defaults={mode:this.onlyProgress?'continue':'recent',kind:this.kind};
      this.initialized=true;
      await this.syncPage(this.latestParams??this.route.snapshot?.queryParamMap??convertToParamMap({}));
    }catch{this.error='No se pudo consultar el historial. Vuelve a intentar.';this.cdr.markForCheck();}
  }
  private filterKey(){return `libretorio:history:filters:${this.identity?.userId}`;}
  changeFilters(){
    if(this.identity)try{localStorage.setItem(this.filterKey(),JSON.stringify({onlyProgress:this.onlyProgress,kind:this.kind}));}catch{}
    void this.navigatePage({mode:this.onlyProgress?'continue':'recent',kind:this.kind,explicit:true});
  }
  refresh(){void this.navigatePage({...this.page,before:undefined,after:undefined,explicit:true},true);}
  turnPage(direction:'before'|'after'){
    const cursor=direction==='before'?this.next:this.previous;
    if(!cursor||this.loading)return;
    void this.navigatePage({...this.page,before:undefined,after:undefined,[direction]:cursor,explicit:true});
  }
  private pageKey(page:ActivityPage){return JSON.stringify([page.mode,page.kind,page.before,page.after]);}
  private async navigatePage(page:ActivityPage,force=false){
    const url=this.url(this.target,page);
    if(force)this.requestedPageKey=undefined;
    if(this.router.serializeUrl(url)===this.router.url){if(force)await this.load(page);return;}
    await this.router.navigateByUrl(url);
  }
  private async syncPage(params:ParamMap){
    let page:ActivityPage;
    try{page=activityPage(params,this.defaults);}catch{
      ++this.generation;this.pageRequest?.abort();this.loading=false;
      this.requestedPageKey=undefined;
      this.error='El enlace de actividad no es valido.';this.cdr.markForCheck();return;
    }
    const key=this.pageKey(page);
    if(key===this.requestedPageKey){this.page=page;return;}
    this.requestedPageKey=key;await this.load(page,true);
  }
  ngOnDestroy(){
    this.closed=true;++this.generation;++this.openGeneration;
    this.pageRequest?.abort();
    this.modalElement?.removeEventListener('hidden.bs.modal',this.onModalHidden);
    const modal=this.modal;
    void (this.details?.hideManagedReader()??Promise.resolve()).finally(()=>modal?.dispose(true));
  }
  async load(page:ActivityPage={mode:this.onlyProgress?'continue':'recent',kind:this.kind},scroll=false){
    this.requestedPageKey=this.pageKey(page);
    const generation=++this.generation;this.pageRequest?.abort();
    const request=this.pageRequest=new AbortController();
    this.loading=true;this.error='';this.page=page;
    this.onlyProgress=page.mode==='continue';this.kind=page.kind;this.paged=!!(page.before||page.after);
    try {
      const query=new URLSearchParams({mode:page.mode});if(page.kind)query.set('kind',page.kind);
      if(page.before)query.set('before',page.before);if(page.after)query.set('after',page.after);
      const data=await this.api.request<any>('GET','/history?'+query,undefined,undefined,request.signal);
      if(generation!==this.generation)return;
      if(page.after&&data.paginationVersion!==2)throw new Error('HISTORY_PAGING_UNAVAILABLE');
      // Retain only one page and its UI state, never an accumulated history cache.
      this.items=data.items.slice(0,20);
      const ids=new Set(this.items.map(item=>item.id));
      for(const id of this.failedCovers)if(!ids.has(id))this.failedCovers.delete(id);
      for(const id of Object.keys(this.versions))if(!ids.has(id))delete this.versions[id];
      this.next=data.next;
      this.previous=data.previous;
      this.committedPage=page;
      if(scroll&&!this.target){this.host.nativeElement.scrollTop=0;this.host.nativeElement.querySelector<HTMLElement>('h1')?.focus({preventScroll:true});}
    }catch(error:any){
      if(generation!==this.generation)return;
      this.error=error.status===404?'El historial no esta habilitado en este backend.':error.message==='HISTORY_PAGING_UNAVAILABLE'?'La navegacion anterior requiere actualizar el backend.':'No se pudo consultar el historial. Vuelve a intentar.';
      if(this.committedPage){
        this.page=this.committedPage;this.requestedPageKey=this.pageKey(this.page);
        this.onlyProgress=this.page.mode==='continue';this.kind=this.page.kind;this.paged=!!(this.page.before||this.page.after);
        const url=this.url(this.target,this.page);
        if(this.router.serializeUrl(url)!==this.router.url)void this.router.navigateByUrl(url,{replaceUrl:true});
      }
    }
    finally{if(generation===this.generation){this.loading=false;this.cdr.markForCheck();}}
  }
  async open(item:any,format?:ReadingFormat){
    this.opener=document.activeElement as HTMLElement;
    const target:ActivityTarget={id:item.archiveId,...(format?{view:format==='converted-pdf'?'pdf-preparado' as const:'original' as const}:{})};
    await this.navigateTarget(target);
  }
  requestReader(view:ActivityView){if(this.selected)void this.navigateTarget({id:this.selected.id,view});}
  readerClosed(){
    if(!this.closed&&!this.applying&&this.target?.view)this.closeTarget({id:this.target.id});
  }
  private url(target?:ActivityTarget,page=this.page){
    return this.router.createUrlTree(['/inicio'],{queryParams:{...activityPageQuery(page),...(target?{archivo:target.id,...(target.view?{vista:target.view}:{})}:{})}});
  }
  private async navigateTarget(target:ActivityTarget){
    const url=this.url(target);
    if(this.router.serializeUrl(url)===this.router.url){this.target=target;await this.applyTarget(target,++this.openGeneration);return;}
    await this.router.navigateByUrl(url,{state:{activityOwner:this.navigationOwner,activityParent:this.router.url}});
  }
  private closeTarget(target?:ActivityTarget){
    const url=this.url(target),state=this.locationService.getState() as any;
    if(state?.activityOwner===this.navigationOwner&&state.activityParent===this.router.serializeUrl(url))this.locationService.back();
    else void this.router.navigateByUrl(url,{replaceUrl:true});
  }
  private modalTask(work:()=>Promise<void>){
    const result=this.modalWork.then(async()=>{this.applying=true;try{await work();}finally{this.applying=false;}});
    this.modalWork=result.catch(()=>{});return result;
  }
  private async applyTarget(target:ActivityTarget|undefined,generation:number,invalidMessage=''){
    const current=()=>!this.closed&&generation===this.openGeneration;
    this.opening=!!target;this.openingError=invalidMessage;
    try {
      await this.modalTask(async()=>{
        if(!current())return;
        if(!target||target.id!==this.selected?.id||target.view!==this.activeView){
          await this.details?.hideManagedReader();this.activeView=undefined;
        }
        if(!target||target.id!==this.selected?.id){
          await this.modal?.visible(false);
          if(!current())return;
          this.selected=undefined;this.visitedId=undefined;this.cdr.detectChanges();
        }
      });
      if(!current()||!target)return;
      const file=this.selected?.id===target.id?this.selected:await this.api.request<File>('GET',`/items/${target.id}`);
      if(!current())return;
      let path:string|undefined;
      if(target.view){
        const ext=file.fileKind==='FILE'?getExtension(file).toUpperCase():file.fileKind;
        const format=target.view==='pdf-preparado'?'converted-pdf':ext==='PDF'?'pdf':ext==='EPUB'?'epub':
          ext==='AUDIOBOOK'||['MP3','WAV','M4A','M4B','OGG','FLAC'].includes(ext)?'audio':
          ['COMIC-MANGA','CBR','CBZ','CB7','CBT'].includes(ext)?'comic':undefined;
        if(format){
          const prepared=await this.api.request<any>('GET',`/items/${target.id}/progress/${format}?fresh=1`);
          path=prepared.sourcePath;
        }
      }
      if(!current())return;
      await this.modalTask(async()=>{
        if(!current())return;
        if(this.selected!==file){this.selected=file;this.cdr.detectChanges();}
        if(target.view){
          await this.modal?.visible(false);
          if(!current())return;
          if(this.activeView!==target.view)await this.details?.showManagedReader(target.view,path);
          this.activeView=target.view;
        }else await this.modal?.visible(true);
        if(current()&&this.visitedId!==target.id){this.visitedId=target.id;void this.api.visit(target.id).catch(()=>{});}
      });
    }catch(error:any){
      if(!current())return;
      this.openingError=error.error?.code==='PDF_NOT_READY'||error.message==='PDF_NOT_READY'?'El PDF preparado no esta disponible. El original conserva su historial.'
        :error.status===404?'El material ya no esta en la ruta anterior: se movio, renombro o elimino.'
        :'No se pudo abrir el material. Comprueba su disponibilidad y vuelve a intentar.';
    }finally{if(current()){this.opening=false;this.cdr.markForCheck();}}
  }
  label(format:string){return ({'converted-pdf':'PDF preparado',pdf:'PDF',epub:'EPUB',audio:'Audio',comic:'Comic / manga'} as any)[format]??format;}
  chosen(item:any){return item.progress.find((p:any)=>p.representation===this.versions[item.id])??item.progress[0];}
  material(item:any){return ({FILE:'Archivo',EPUB:'EPUB',AUDIOBOOK:'Audiolibro','COMIC-MANGA':'Comic / manga'} as any)[item.snapshot.fileKind]??'Sin clasificar';}
  cover(item:any){
    const file=item.snapshot,id=file.customDetails?file.webDetails?.cover_i:file.coverId;
    return id&&!this.failedCovers.has(item.id)?`/covers/${encodeURIComponent(id)}.webp`:'';
  }
  track(progress:any){return progress.position.track?.split('/').pop()??'';}
  location(progress:any){
    const p=progress.position;
    if(p.page!==undefined)return `Pagina ${p.page+1}`;
    if(p.percent!==undefined)return `${Math.round(p.percent)}%`;
    const seconds=Math.floor(p.seconds??0);
    return `${Math.floor(seconds/3600)}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  }
}
