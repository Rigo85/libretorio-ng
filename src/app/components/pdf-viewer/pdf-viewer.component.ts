import { AfterViewInit, HostListener, Input, OnChanges, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, OnDestroy, QueryList, ViewChild, ViewChildren } from '@angular/core';
import { ContinuousPages } from './continuous-pages';
import {pdfSelection, renderPdfTextLayer} from './pdf-text-layer';
import {RecoverableSpeechComponent} from '../recoverable-speech/recoverable-speech.component';
import {PdfSpeechContext,PdfSpeechSelection} from '../../core/pdf-speech-source';
import {capturePdfSpeechSelection} from './pdf-speech-selection';
import {PdfSpeechChannel} from './pdf-speech-channel';
import {ReadingService,ReadingTracker} from '../../services/reading.service';
import {ReadingStatusComponent} from '../reading-status/reading-status.component';
import {DocumentSearch,DocumentHit} from '../../core/document-search';
import {DocumentSearchComponent} from '../document-search/document-search.component';
import {PdfSearchChannel} from './pdf-search-channel';
import {domSearchWindow} from '../../core/dom-search';
import {NgTemplateOutlet} from '@angular/common';

type PageView = {page: number; top: number; height: number; width: number; contentHeight: number;
  sliceTop: number; sliceHeight: number; ready: boolean; text: string; error: string;links?:{uri:string;page:number;box:number[]}[]};
const PREFERENCES = 'libretorio:pdf:preferences:v1';

@Component({selector: 'pdf-viewer', imports: [RecoverableSpeechComponent,ReadingStatusComponent,DocumentSearchComponent,NgTemplateOutlet],
  templateUrl: './pdf-viewer.component.html', styleUrl: './pdf-viewer.component.scss', changeDetection: ChangeDetectionStrategy.Eager})
export class PdfViewerComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() pdfSrc = '';
  @Input() archiveId?: number|string;
  speechContext?: PdfSpeechContext;
  speechSelection?: PdfSpeechSelection;
  progress?:ReadingTracker;
  historyWarning='';
  search?:DocumentSearch;
  searchHighlight?:{page:number;rects:{left:number;top:number;width:number;height:number}[]};
  private hitToFocus?:DocumentHit;
  private searchChannel?:PdfSearchChannel;
  private returnPositions:{page:number;ratio:number;reading:boolean}[]=[];
  get canReturn(){return this.returnPositions.length>0;}
  get pageLinks(){return this.views.find(view=>view.page===this.page)?.links??[];}
  private bookmarkInteraction=false;
  @ViewChild('stage') stage?: ElementRef<HTMLElement>;
  @ViewChild('paperStage') paperStage?: ElementRef<HTMLElement>;
  @ViewChild('settingsDialog') settingsDialog?: ElementRef<HTMLDialogElement>;
  @ViewChildren('pageCanvas') canvases?: QueryList<ElementRef<HTMLCanvasElement>>;
  @ViewChildren('pageTextLayer') textLayers?: QueryList<ElementRef<HTMLElement>>;
  selectedText = '';
  documentUrl = '';
  opened = false;
  busy = false;
  error = '';
  dark = false;
  fontSize = 20;
  reading = true;
  lineHeight = 1.5;
  fontFamily = 'serif';
  pageMargin = 12;
  fullWidth = false;
  expanded = false;
  zoom = 1;
  page = 0;
  pages = 0;
  panel: 'settings' | 'outline' | 'text' | 'links' = 'settings';
  outline: {title: string; page: number; depth: number}[] = [];
  views: PageView[] = [];
  surfaceWidth = 0;
  model = new ContinuousPages();
  metrics = {openMs: 0, firstPageMs: 0, renderMs: 0, bytes: 0, size: 0, requests: 0, cachedPages: 0, cachedBlocks: 0};
  private worker?: Worker;
  private speechChannel?: PdfSpeechChannel;
  private request = 0;
  private generation = 0;
  private job?: {page: number; generation: number};
  private started = 0;
  private closed = false;
  private resizeObserver?: ResizeObserver;
  private resizeTimer?: ReturnType<typeof setTimeout>;
  private scrollFrame?: number;
  private dimensions = '';
  private pendingAnchor?: {page: number; ratio: number};
  private viewReady = false;
  private openFrame?: number;

  constructor(private cdr: ChangeDetectorRef,public readingStore:ReadingService) {
    this.loadPreferences();
  }
  ngOnChanges() {
    this.close();
    if (this.viewReady && this.pdfSrc) this.scheduleOpen();
  }
  private scheduleOpen() {
    if (this.openFrame !== undefined) cancelAnimationFrame(this.openFrame);
    this.openFrame = requestAnimationFrame(() => {
      this.openFrame = undefined;
      if (!this.closed && this.pdfSrc) { this.open(); this.cdr.markForCheck(); }
    });
  }
  ngAfterViewInit() {
    this.resizeObserver = new ResizeObserver(() => {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => this.resize(), 140);
    });
    if (this.stage) this.resizeObserver.observe(this.stage.nativeElement);
    this.viewReady = true;
    if (this.pdfSrc) this.scheduleOpen();
  }
  private resize() {
    if (this.worker && this.opened && !this.busy && this.dimensionKey() !== this.dimensions) this.refresh(true);
  }
  open() {
    this.close();
    if (!this.pdfSrc) return;
    this.error = '';
    try {
      const url = new URL(this.pdfSrc, window.location.origin);
      if (url.origin !== window.location.origin || url.username || url.password || !/^\/(books|cache)\//.test(url.pathname))
        throw new Error('La ruta del PDF no pertenece a la biblioteca.');
      this.documentUrl = url.href;
    } catch {
      this.error = 'La ruta del PDF no pertenece a la biblioteca.'; return;
    }
    this.opened = true;
    this.reading = window.matchMedia('(max-width: 600px), (max-height: 500px) and (pointer: coarse)').matches;
    this.zoom = 1;
    this.page = 0; this.pages = 0; this.outline = []; this.error = '';
    this.metrics = {openMs: 0, firstPageMs: 0, renderMs: 0, bytes: 0, size: 0, requests: 0, cachedPages: 0, cachedBlocks: 0};
    this.busy = true; this.started = performance.now();
    let worker: Worker;
    try { worker = new Worker('/assets/pdf-reader/mupdf-worker.mjs', {type: 'module'}); }
    catch { this.error = 'No se pudo iniciar el motor PDF.'; this.busy = false; return; }
    this.worker = worker;
    this.speechChannel = new PdfSpeechChannel(worker);
    this.searchChannel = new PdfSearchChannel(worker);
    worker.onerror = event => {
      if (this.worker !== worker) return;
      this.error = 'Worker MuPDF: ' + (event.message || 'No se pudo iniciar.'); this.busy = false;
      this.speechChannel?.close(); this.speechContext = undefined;
      this.searchChannel?.close(); this.search?.close(); this.search = undefined;
      this.job = undefined; worker.terminate(); this.worker = undefined; this.cdr.markForCheck();
    };
    worker.onmessage = ({data}) => {
      if (this.worker !== worker) return;
      if (this.speechChannel?.receive(data)) return;
      if (this.searchChannel?.receive(data)) {if(data.bytes!==undefined){this.metrics.bytes=data.bytes;this.metrics.requests=data.requests;}this.cdr.markForCheck();return;}
      if (data.type === 'ready') {
        this.dimensions = this.dimensionKey();
        worker.postMessage({id: ++this.request, type: 'open', url: this.documentUrl, format: 'pdf', options: this.options()});
        return;
      }
      if (data.id !== this.request) return;
      const job = this.job; this.job = undefined;
      if (job && job.generation !== this.generation) { this.pump(); return; }
      if (data.type === 'error') {
        if (job) {
          const view = this.views.find(view => view.page === job.page);
          if (view) view.error = data.error;
          if (this.pendingAnchor?.page === job.page) this.pendingAnchor = undefined;
        } else { this.error = data.error; this.busy = false; }
      } else {
        this.metrics.bytes = data.bytes; this.metrics.size = data.size; this.metrics.requests = data.requests;
        if (data.outline) this.outline = data.outline.filter((item: {page: number}) => Number.isInteger(item.page) && item.page >= 0 && item.page < data.pages);
        if (data.type === 'open') {
          this.busy = false; this.pages = data.pages; this.metrics.openMs = performance.now() - this.started;
          const channel=this.searchChannel!;
          this.search=new DocumentSearch({search:async(query,cursor:any,signal)=>{
            while(this.job){await new Promise(resolve=>setTimeout(resolve,30));if(signal.aborted||this.worker!==worker)throw new Error('cancelled');}
            const page=cursor?.page??0,offset=cursor?.offset??0;
            const result=await channel.request({type:'search-page',query,page,offset},signal);
            return {hits:result.hits.map((hit:any)=>({...hit,page,label:`Pagina ${page+1}`})),
              cursor:result.done?{page:page+1,offset:0}:{page,offset:result.next},done:result.done&&page+1>=this.pages};
          }},()=>this.cdr.markForCheck());
          if (this.archiveId !== undefined) {
            const channel = this.speechChannel!;
            this.speechContext = {format:'pdf',archiveId:this.archiveId,path:new URL(this.documentUrl).pathname,pages:this.pages,
              readText:(page,layout,start,end,signal)=>channel.read(page,layout,start,end,signal)};
          }
          this.model.reset(this.pages, this.options().layoutHeight); this.dimensions = this.dimensionKey(); this.syncWindow();
          void this.restoreProgress(worker);
        } else if (data.type === 'render') this.receivePage(data);
      }
      this.cdr.markForCheck(); this.pump();
    };
  }
  private options() {
    const width = this.paperStage?.nativeElement.clientWidth ?? this.stage?.nativeElement.clientWidth ?? window.innerWidth;
    const compact = window.matchMedia('(max-width: 600px), (max-height: 500px)').matches;
    const maxWidth = this.reading ? 780 : 1100;
    const layoutWidth = Math.max(120, compact || this.fullWidth ? width : Math.min(maxWidth, width - 24));
    const layoutHeight = Math.max(160, this.paperStage?.nativeElement.clientHeight ?? this.stage?.nativeElement.clientHeight ?? 800);
    return {dark: this.dark, fontSize: this.fontSize, fontFamily: this.fontFamily, pageMargin: this.pageMargin,
      reading: this.reading, lineHeight: this.lineHeight, banded: true,
      layoutWidth, layoutHeight, renderWidth: layoutWidth * Math.min(window.devicePixelRatio || 1, 2), zoom: this.zoom};
  }
  private dimensionKey() { const o = this.options(); return `${o.layoutWidth}:${o.layoutHeight}:${o.renderWidth}`; }
  private syncWindow() {
    if (!this.opened || !this.model.count) return;
    const top = this.paperStage?.nativeElement.scrollTop ?? 0, options = this.options();
    this.surfaceWidth = Math.max(options.layoutWidth * (this.reading ? 1 : this.zoom), this.paperStage?.nativeElement.clientWidth ?? 0);
    const previous = new Map(this.views.map(view => [view.page, view]));
    const selectedPages = this.paperStage ? pdfSelection(this.paperStage.nativeElement, undefined, false).pages : [];
    const pages = [...new Set([...this.model.window(top, options.layoutHeight), ...selectedPages])].sort((a, b) => a - b);
    this.views = pages.map(page => {
      const view = previous.get(page) ?? {page, top: 0, height: 0, width: 0, contentHeight: 0,
        sliceTop: 0, sliceHeight: 0, ready: false, text: '', error: ''};
      view.top = this.model.top(page); view.height = this.model.height(page);
      view.width = options.layoutWidth * (this.reading ? 1 : this.zoom);
      return view;
    });
    this.page = this.model.locate(top + Math.min(40, options.layoutHeight / 10));
    this.cdr.detectChanges();
  }
  private pump() {
    if (!this.worker || this.busy || this.job || !this.model.count) return;
    const top = this.paperStage?.nativeElement.scrollTop ?? 0, options = this.options();
    const priority = this.pendingAnchor?.page ?? this.model.locate(top);
    const view = [...this.views].sort((a, b) => Math.abs(a.page - priority) - Math.abs(b.page - priority)).find(view => {
      if (view.error) return false;
      if (!view.ready) return true;
      if (view.top >= top + options.layoutHeight || view.top + view.height <= top) return false;
      const start = Math.max(0, Math.min(view.contentHeight, top - view.top));
      const end = Math.max(0, Math.min(view.contentHeight, top + options.layoutHeight - view.top));
      return start < view.sliceTop - 1 || end > view.sliceTop + view.sliceHeight + 1;
    });
    if (!view) return;
    this.job = {page: view.page, generation: this.generation};
    this.worker.postMessage({id: ++this.request, type: 'render', page: view.page, options,
      scrollTop: Math.max(0, top - view.top)});
  }
  private receivePage(data: any) {
    const viewport = this.paperStage?.nativeElement;
    if (data.pages !== this.pages) {
      this.pages = data.pages; this.model.reset(this.pages, this.options().layoutHeight);
      if (this.pendingAnchor) this.pendingAnchor.page = Math.min(this.pages - 1, this.pendingAnchor.page);
    }
    let top = this.model.measure(data.page, data.contentHeight, viewport?.scrollTop ?? 0);
    if (this.pendingAnchor && this.pendingAnchor.page === data.page) {
      top = this.model.top(data.page) + this.pendingAnchor.ratio * this.model.height(data.page);
      this.pendingAnchor = undefined;
    }
    // Resize the virtual surface before restoring the anchor, so the browser cannot clamp it to the old height.
    this.cdr.detectChanges();
    if (viewport) viewport.scrollTop = top;
    this.syncWindow();
    const view = this.views.find(view => view.page === data.page);
    if (view) {
      const needsTextLayer = !view.ready;
      view.contentHeight = data.contentHeight; view.sliceTop = data.sliceTop; view.sliceHeight = data.displayHeight;
      view.width = data.displayWidth; view.text = data.text; view.ready = true; view.error = '';
      view.links=data.links??[];
      this.cdr.detectChanges();
      const canvas = this.canvases?.find(canvas => Number(canvas.nativeElement.dataset['page']) === data.page)?.nativeElement;
      if (canvas) {
        canvas.width = data.width; canvas.height = data.height;
        canvas.getContext('2d')?.putImageData(new ImageData(data.pixels, data.width, data.height), 0, 0);
      }
      if (needsTextLayer) {
        const layer = this.textLayers?.find(layer => Number(layer.nativeElement.dataset['page']) === data.page)?.nativeElement;
        if (layer) {
          renderPdfTextLayer(layer, data.lines ?? []);
          if (data.speech) {
            layer.dataset['speechLength'] = String(data.speech.length);
            layer.dataset['speechRevision'] = data.speech.revision;
            layer.dataset['speechLayout'] = JSON.stringify(data.speech.layout);
          }
        }
      }
    }
    this.metrics.renderMs = data.elapsed; this.metrics.cachedPages = data.cachedPages ?? 0; this.metrics.cachedBlocks = data.cachedBlocks ?? 0;
    if(this.hitToFocus&&this.hitToFocus.page===data.page){const hit=this.hitToFocus;this.hitToFocus=undefined;void this.focusSearchHit(hit);}
    if (!this.metrics.firstPageMs) this.metrics.firstPageMs = performance.now() - this.started;
  }
  onPaperScroll() {
    if (this.scrollFrame !== undefined) return;
    this.scrollFrame = requestAnimationFrame(() => { this.scrollFrame = undefined; this.syncWindow(); this.pump(); this.captureProgress(); });
  }
  private async restoreProgress(worker:Worker) {
    try {
      const progress=await this.readingStore.begin(this.archiveId,this.documentUrl.includes('/cache/')?'converted-pdf':'pdf');
      if(this.worker!==worker){progress?.dispose(false);return;}
      this.progress=progress;
      if(!progress)return;
      const prefs=await this.readingStore.settings('pdf').catch(()=>undefined);if(this.worker!==worker)return;
      Object.assign(this,{dark:false,fontSize:20,fontFamily:'serif',pageMargin:12,lineHeight:1.5},prefs??{});this.refresh(true);
      const saved=progress.restored;
      if(saved?.page!==undefined && saved.page<this.pages) {
        this.render(saved.page,false);
        const exact=saved.layout===this.bookmarkLayout();
        this.pendingAnchor={page:saved.page,ratio:exact?(saved.ratio??0):0};
        if(!exact)progress.status.set('Pagina recuperada. La ubicacion dentro de ella puede variar con la maquetacion.');
      } else if(saved){progress.blocked=true;progress.status.set('No se pudo localizar la pagina guardada.');}
      progress.ready=true;this.cdr.markForCheck();
    }catch{if(this.worker===worker){this.historyWarning='No se pudo consultar el historial. El PDF sigue disponible.';this.cdr.markForCheck();}}
  }
  private captureProgress() {
    const viewport=this.paperStage?.nativeElement;
    if(!this.bookmarkInteraction||!viewport||!this.progress?.ready||this.pendingAnchor||this.busy)return;
    const page=this.model.locate(viewport.scrollTop),view=this.views.find(value=>value.page===page);
    if(!view?.ready)return;
    this.progress.capture({version:1,page,ratio:Math.max(0,Math.min(1,(viewport.scrollTop-this.model.top(page))/this.model.height(page))),mode:this.reading?'reading':'original',layout:this.bookmarkLayout()});
  }
  private bookmarkLayout(){return `${this.reading?'reading':'original'}:${this.dimensionKey()}:${this.fontSize}:${this.fontFamily}:${this.pageMargin}:${this.lineHeight}`;}
  allowBookmarkCapture(event:Event){if(event.isTrusted)this.bookmarkInteraction=true;}
  private refresh(layout: boolean) {
    this.clearSearchHighlight();
    this.savePreferences();
    if (!this.worker || !this.pages || this.busy) return;
    this.clearSelection();
    const viewport = this.paperStage?.nativeElement, top = viewport?.scrollTop ?? 0;
    const page = this.model.locate(top), ratio = Math.max(0, Math.min(1, (top - this.model.top(page)) / Math.max(1, this.model.height(page))));
    ++this.generation; this.views = [];
    if (layout) {
      this.pendingAnchor = {page, ratio}; this.model.reset(this.pages, this.options().layoutHeight);
      this.cdr.detectChanges();
      if (viewport) viewport.scrollTop = this.model.top(page) + ratio * this.model.height(page);
    }
    this.dimensions = this.dimensionKey(); this.syncWindow(); this.pump();
  }
  render(page = this.page,userNavigation=true) {
    if (!this.pages || this.busy) return;
    if(userNavigation)this.bookmarkInteraction=true;
    page = Math.max(0, Math.min(this.pages - 1, page)); this.pendingAnchor = undefined;
    if (this.paperStage) this.paperStage.nativeElement.scrollTop = this.model.top(page);
    this.page = page; this.syncWindow(); this.pump();
  }
  setReading(reading: boolean) { if (!this.busy && this.reading !== reading) { this.reading = reading; this.zoom = 1; this.refresh(true); } }
  goPage(event: Event) { const page = Number((event.target as HTMLInputElement).value); if (Number.isInteger(page) && page >= 1 && page <= this.pages) this.render(page - 1); }
  setFont(size: number) { if (Number.isFinite(size) && size >= 12 && size <= 36 && this.fontSize !== size) { this.fontSize = size; this.refresh(true); } }
  changeFont(event: Event) { this.setFont(Number((event.target as HTMLInputElement).value)); }
  changeLineHeight(event: Event) { const value = Number((event.target as HTMLSelectElement).value); if ([1.3, 1.5, 1.8].includes(value)) { this.lineHeight = value; this.refresh(true); } }
  changeZoom(event: Event) { const value = Number((event.target as HTMLSelectElement).value); if ([0.75, 1, 1.25, 1.5, 2].includes(value)) { this.zoom = value; this.refresh(true); } }
  changeFamily(event: Event) { const value = (event.target as HTMLSelectElement).value; if (['publisher', 'serif', 'sans-serif', 'monospace'].includes(value)) { this.fontFamily = value; this.refresh(true); } }
  changeMargin(event: Event) { const value = Number((event.target as HTMLSelectElement).value); if ([6, 12, 24].includes(value)) { this.pageMargin = value; this.refresh(true); } }
  changeWidth(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    if (!['column', 'full'].includes(value)) return;
    this.fullWidth = value === 'full'; this.zoom = 1; this.refresh(true);
  }
  toggleDark() { this.dark = !this.dark; this.refresh(false); }
  openPanel(panel: 'settings' | 'outline' | 'text' | 'links' = 'settings') { this.panel = panel; this.cdr.detectChanges(); if (!this.settingsDialog?.nativeElement.open) this.settingsDialog?.nativeElement.showModal(); }
  searchResult(hit:DocumentHit){
    if(hit.page===undefined)return;this.cdr.detectChanges();this.dimensions=this.dimensionKey();this.searchHighlight=undefined;this.hitToFocus=hit;this.render(hit.page);
    if(this.views.find(view=>view.page===hit.page)?.ready){this.hitToFocus=undefined;void this.focusSearchHit(hit);}
  }
  clearSearchHighlight(){this.hitToFocus=undefined;this.searchHighlight=undefined;}
  private async focusSearchHit(hit:DocumentHit){
    const layer=this.textLayers?.find(value=>Number(value.nativeElement.dataset['page'])===hit.page)?.nativeElement;
    if(!layer||!this.search?.query)return;
    const query=this.search.query,generation=this.generation;let offset=0,ordinal=hit.occurrence??0;
    for(let windows=0;windows<100;windows++){
      if(generation!==this.generation||query!==this.search?.query||!layer.isConnected)return;
      const batch=domSearchWindow(layer,query,offset);
      if(ordinal<batch.hits.length){const range=batch.hits[ordinal].range;if(!range)return;
        const box=layer.getBoundingClientRect();const rects=Array.from(range.getClientRects()).filter(r=>r.width>0&&r.height>0).slice(0,128)
          .map(r=>({left:r.left-box.left,top:r.top-box.top,width:r.width,height:r.height}));
        this.searchHighlight={page:hit.page!,rects};
        if(rects.length&&this.paperStage)this.paperStage.nativeElement.scrollTop=this.model.top(hit.page!)+Math.max(0,rects[0].top-40);
        this.syncWindow();this.pump();this.cdr.markForCheck();return;
      }
      if(batch.done)break;ordinal-=batch.hits.length;offset=batch.next;
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    this.historyWarning='La coincidencia esta en esta pagina, pero no se pudo ubicar en esta maquetacion.';
  }
  async followLink(uri:string,event?:Event){
    if(event && document.getSelection()?.toString())return;
    const worker=this.worker;
    try{const destination=await this.searchChannel?.request({type:'link-destination',uri},new AbortController().signal);
      if(!destination||worker!==this.worker)return;
      const top=this.paperStage?.nativeElement.scrollTop??0;
      this.returnPositions.push({page:this.page,ratio:Math.max(0,(top-this.model.top(this.page))/this.model.height(this.page)),reading:this.reading});
      if(this.returnPositions.length>20)this.returnPositions.shift();
      this.closePanel();this.setReading(false);this.render(destination.page);this.pendingAnchor={page:destination.page,ratio:destination.ratio};
      const view=this.views.find(view=>view.page===destination.page);if(view)view.ready=false;this.pump();
    }catch{this.historyWarning='No se pudo abrir el enlace interno. Vuelve a intentar.';}
    this.cdr.markForCheck();
  }
  returnFromLink(){const previous=this.returnPositions.pop();if(!previous)return;
    this.setReading(previous.reading);this.render(previous.page);this.pendingAnchor={page:previous.page,ratio:previous.ratio};
    const view=this.views.find(view=>view.page===previous.page);if(view)view.ready=false;this.pump();}
  closePanel() { this.settingsDialog?.nativeElement.close(); }
  onBackdrop(event: MouseEvent) {
    const dialog = this.settingsDialog?.nativeElement;
    if (event.target !== dialog || !dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) this.closePanel();
  }
  outlinePage(page: number) { this.render(page); this.closePanel(); }
  get pageText() { return this.views.find(view => view.page === this.page)?.text ?? ''; }
  @HostListener('document:selectionchange')
  onSelectionChange() {
    const root = this.paperStage?.nativeElement;
    this.speechSelection = root ? capturePdfSpeechSelection(root, this.options()) : undefined;
    this.selectedText = this.speechSelection?.preview ?? '';
  }
  get selectedCharacters():number {return this.speechSelection?.pages.reduce((sum,page,index)=>sum+page.end-page.start+(index?1:0),0)??0;}
  @HostListener('document:copy', ['$event'])
  copySelection(event: ClipboardEvent) {
    const text = this.paperStage ? pdfSelection(this.paperStage.nativeElement).text : '';
    if (text && event.clipboardData) {
      event.clipboardData.setData('text/plain', text);
      event.preventDefault();
    }
  }
  private clearSelection() {
    if (this.paperStage && pdfSelection(this.paperStage.nativeElement, undefined, false).pages.length) document.getSelection()?.removeAllRanges();
    this.selectedText = '';
    this.speechSelection = undefined;
  }
  private loadPreferences() {
    try {
      const p = JSON.parse(localStorage.getItem(PREFERENCES) ?? '{}');
      this.dark = typeof p.dark === 'boolean' ? p.dark : localStorage.getItem('libretorio:pdf:night:v1') === '1';
      if (typeof p.fullWidth === 'boolean') this.fullWidth = p.fullWidth;
      if (Number.isFinite(p.fontSize) && p.fontSize >= 12 && p.fontSize <= 36) this.fontSize = p.fontSize;
      if (['publisher', 'serif', 'sans-serif', 'monospace'].includes(p.fontFamily)) this.fontFamily = p.fontFamily;
      if ([6, 12, 24].includes(p.pageMargin)) this.pageMargin = p.pageMargin;
      if ([1.3, 1.5, 1.8].includes(p.lineHeight)) this.lineHeight = p.lineHeight;
    } catch { /* Reading remains available when browser storage is disabled. */ }
  }
  private savePreferences() {
    if(this.progress?.ready)this.readingStore.changeSettings('pdf',{dark:this.dark,fontSize:this.fontSize,fontFamily:this.fontFamily,pageMargin:this.pageMargin,lineHeight:this.lineHeight});
    try { localStorage.setItem(PREFERENCES, JSON.stringify({dark: this.dark, fullWidth: this.fullWidth, fontSize: this.fontSize, fontFamily: this.fontFamily, pageMargin: this.pageMargin, lineHeight: this.lineHeight})); } catch { /* Optional local preferences. */ }
  }
  close() {
    this.clearSearchHighlight();
    this.search?.close();this.search=undefined;this.searchChannel?.close();this.searchChannel=undefined;this.returnPositions=[];
    this.captureProgress();this.progress?.dispose();this.progress=undefined;this.bookmarkInteraction=false;this.historyWarning='';
    this.speechContext = undefined; this.speechChannel?.close(); this.speechChannel = undefined;
    this.clearSelection();
    if (this.openFrame !== undefined) cancelAnimationFrame(this.openFrame);
    this.openFrame = undefined;
    this.closePanel(); this.worker?.terminate(); this.worker = undefined; this.job = undefined; ++this.request; ++this.generation;
    if (this.scrollFrame !== undefined) cancelAnimationFrame(this.scrollFrame);
    this.scrollFrame = undefined; clearTimeout(this.resizeTimer);
    this.opened = false; this.busy = false; this.error = ''; this.expanded = false; this.views = []; this.pendingAnchor = undefined;
    this.documentUrl = ''; this.pages = 0; this.outline = []; this.surfaceWidth = 0; this.model.reset(0, 0);
  }
  ngOnDestroy() { this.closed = true; this.resizeObserver?.disconnect(); this.close(); }
  mb(bytes: number) { return (bytes / 1048576).toFixed(2); }
  round(ms: number) { return Math.round(ms); }
}
