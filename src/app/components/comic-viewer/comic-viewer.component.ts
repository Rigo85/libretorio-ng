import {Component, ElementRef, HostListener, Input, OnChanges, OnDestroy, ChangeDetectionStrategy} from '@angular/core';
import {Subscription} from 'rxjs';
import {NgxSpinnerModule, NgxSpinnerService} from 'ngx-spinner';
import {ErrorMessageComponent} from '../error-message/error-message.component';
import {onClose} from '../helpers/utils';
import {BooksService} from '../../services/books.service';
import {ReadingService, ReadingTracker} from '../../services/reading.service';
import {ReadingStatusComponent} from '../reading-status/reading-status.component';

interface ComicFrame {token:number;src:string;page:number;chunk:number;capture:boolean;}

@Component({
  selector:'comic-viewer',imports:[ErrorMessageComponent,NgxSpinnerModule,ReadingStatusComponent],
  templateUrl:'./comic-viewer.component.html',styleUrl:'./comic-viewer.component.scss',
  changeDetection:ChangeDetectionStrategy.Eager
})
export class ComicViewerComponent implements OnChanges, OnDestroy {
  @Input() comicSrc='';
  @Input() id='';
  @Input() archiveId?:number|string;
  pages:string[]=[];
  frames:ComicFrame[]=[];
  currentPage=1;
  totalPages=0;
  busy=false;
  warning='';
  onClose=onClose;
  progress?:ReadingTracker;
  private active=false;
  private generation=0;
  private token=0;
  private index=0;
  private firstPage=1;
  private cacheRevision?:string;
  private request?:Subscription;
  private retryWork?:()=>void;

  constructor(private elementRef:ElementRef<HTMLElement>,private spinner:NgxSpinnerService,
    private books:BooksService,private reading:ReadingService) {}

  ngOnChanges(){
    this.close();
    if(!this.comicSrc||!this.id||!this.archiveId)return;
    this.active=true;this.busy=true;this.spinner.show();
    void this.open(this.generation);
  }
  ngOnDestroy(){this.close();}
  private close(){
    ++this.generation;this.active=false;this.request?.unsubscribe();this.request=undefined;
    this.progress?.dispose();this.progress=undefined;
    this.pages=[];this.frames=[];this.totalPages=0;this.currentPage=1;
    this.index=0;this.firstPage=1;this.cacheRevision=undefined;this.retryWork=undefined;this.warning='';
    if(this.busy)this.spinner.hide();this.busy=false;
  }
  private async open(generation:number){
    let progress:ReadingTracker|undefined;
    try {progress=await this.reading.begin(this.archiveId,'comic');}
    catch {if(generation===this.generation)this.warning='No se pudo consultar el historial. El comic sigue disponible.';}
    if(!this.active||generation!==this.generation){progress?.dispose(false);return;}
    this.progress=progress;
    const saved=!progress?.blocked?progress?.restored:undefined;
    this.cacheRevision=progress?.context?.sourceRevision;
    this.loadBlock(saved?.chunk??0,(saved?.page??0)+1,false);
  }
  private loadBlock(index:number,page:number,capture:boolean){
    const generation=this.generation;
    this.busy=true;this.warning='';this.spinner.show();
    this.retryWork=()=>this.loadBlock(index,page,capture);
    this.request?.unsubscribe();
    this.request=this.books.getComicPages(Number(this.archiveId),this.id,index,this.cacheRevision).subscribe({
      next:reply=>{
        if(!this.active||generation!==this.generation)return;
        if(reply.success!=='OK'){this.fail(reply.code);return;}
        const block=reply.pages;
        if(!block||block.index!==index||!Number.isSafeInteger(block.pageIndex)||block.pageIndex<1||
          !Number.isSafeInteger(block.totalPages)||block.totalPages<1||!Array.isArray(block.pages)||!block.pages.length||
          block.currentPagesLength!==block.pages.length||block.pageIndex+block.pages.length-1>block.totalPages||
          typeof reply.sourceRevision!=='string'||!/^[a-f0-9]{64}$/.test(reply.sourceRevision)||
          (this.cacheRevision&&reply.sourceRevision!==this.cacheRevision)) {this.fail('COMIC_CACHE_INVALID');return;}
        if(page<block.pageIndex||page>=block.pageIndex+block.pages.length){this.fail('COMIC_POSITION_MISSING');return;}
        this.cacheRevision=reply.sourceRevision;this.pages=block.pages;
        this.index=index;this.firstPage=block.pageIndex;this.totalPages=block.totalPages;
        this.showPage(page,capture);
      },error:()=>{if(this.active&&generation===this.generation)this.fail('COMIC_UNAVAILABLE');}
    });
  }
  private showPage(page:number,capture:boolean){
    this.busy=true;this.warning='';
    this.frames=[{token:++this.token,src:this.pages[page-this.firstPage],page,chunk:this.index,capture}];
    this.retryWork=()=>this.showPage(page,capture);
  }
  imageLoaded(frame:ComicFrame){
    if(!this.active||this.frames[0]!==frame)return;
    this.currentPage=frame.page;this.busy=false;this.spinner.hide();this.retryWork=undefined;
    if(this.progress){
      this.progress.ready=true;
      if(frame.capture){
        if(this.progress.context?.sourceRevision!==this.cacheRevision){this.fail('SOURCE_CHANGED');return;}
        this.progress.capture({version:1,page:frame.page-1,chunk:frame.chunk});
      }
    }
    const scroll=this.elementRef.nativeElement.closest<HTMLElement>('.modal-body');
    if(scroll)scroll.scrollTop=0;
  }
  imageFailed(frame:ComicFrame){if(this.active&&this.frames[0]===frame)this.fail('COMIC_IMAGE_FAILED');}
  retry(){if(this.active&&!this.busy)this.retryWork?.();}
  private fail(code:string){
    this.busy=false;this.spinner.hide();
    const changed=['SOURCE_CHANGED','COMIC_POSITION_MISSING','COMIC_CACHE_INVALID'].includes(code);
    this.warning=changed?'La cache o la pagina guardada cambiaron. Cierra y vuelve a abrir el comic; el marcador se conserva.'
      :code==='COMIC_IMAGE_FAILED'?'No se pudo cargar la imagen. La ultima posicion se conserva.'
      :code==='COMIC_CACHE_MISSING'?'La cache del comic no esta disponible. El marcador se conserva.'
      :'No se pudo cargar el bloque. Comprueba la conexion y vuelve a intentar.';
    if(changed){this.retryWork=undefined;if(this.progress){this.progress.blocked=true;this.progress.status.set(this.warning);}}
  }
  get canRetry(){return !!this.retryWork&&!this.busy;}
  get position(){return `${this.currentPage} / ${this.totalPages}`;}
  private move(delta:number){
    if(!this.active||this.busy||!this.totalPages)return;
    const page=this.currentPage+delta;
    if(page<1||page>this.totalPages)return;
    if(page>=this.firstPage&&page<this.firstPage+this.pages.length)this.showPage(page,true);
    else this.loadBlock(this.index+(page<this.firstPage?-1:1),page,true);
  }
  @HostListener('document:keyup',['$event'])
  handleKeyUp(event:KeyboardEvent){
    if(!this.active||!event.isTrusted||event.defaultPrevented||event.ctrlKey||event.altKey||event.metaKey)return;
    if((event.target as HTMLElement)?.closest?.('input,textarea,select,[contenteditable="true"]'))return;
    if(event.key==='ArrowLeft')this.move(-1);
    else if(event.key==='ArrowRight')this.move(1);
  }
  @HostListener('document:click',['$event'])
  onDocumentClick(event:MouseEvent){
    if(!this.active||!event.isTrusted)return;
    const container=this.elementRef.nativeElement.querySelector<HTMLElement>('#image-container');
    if(container&&event.target instanceof Node&&container.contains(event.target)){
      const rect=container.getBoundingClientRect();
      this.move(event.clientX-rect.left<rect.width/2?-1:1);
    }
  }
}
