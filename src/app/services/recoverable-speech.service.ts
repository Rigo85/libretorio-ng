import {inject, Injectable, InjectionToken, NgZone, OnDestroy, signal} from '@angular/core';
import {HttpClient, HttpErrorResponse, HttpResponse} from '@angular/common/http';
import {firstValueFrom, Subscription, timeout} from 'rxjs';
import {ReaderSpeechService} from './reader-speech.service';
import {SessionActivityService} from './session-activity.service';
import {StopPlayingService} from './stop-playing.service';
import {epubRangeSource, EpubSelection, EpubSpeechContext, inspectEpubSelection, restoreEpubSource} from '../core/epub-speech-source';
import {RecoverableReader} from '../core/recoverable-speech/reader.mjs';
import {openStore, ReadingStore} from '../core/recoverable-speech/store.mjs';
import {BlockSource, TextDocument} from '../core/recoverable-speech/source.mjs';
import {DiagnosticStore,openDiagnostics} from '../core/recoverable-speech/diagnostics.mjs';
import {describePdfSelection,PdfSpeechContext,PdfSpeechSelection,PdfSpeechSource} from '../core/pdf-speech-source';

export type SpeechContext=EpubSpeechContext|PdfSpeechContext;
export type SpeechSelection=EpubSelection|PdfSpeechSelection;

export const RECOVERABLE_SPEECH_STORE = new InjectionToken<(format:string)=>Promise<ReadingStore>>('Recoverable speech store', {
  providedIn:'root',factory:()=>format=>openStore(`libretorio-${format}-speech-v1`)
});

@Injectable()
export class RecoverableSpeechService implements OnDestroy {
  readonly revision=signal(0);
  reader?:RecoverableReader;
  context?:SpeechContext;
  saved?:TextDocument;
  busy=false;
  error='';
  private store?:ReadingStore;
  private storeFormat?:'epub'|'pdf';
  private open=inject(RECOVERABLE_SPEECH_STORE);
  private prepared?:{id:string;source:BlockSource};
  private diagnostics?:Promise<DiagnosticStore>;
  private diagnosticId=crypto.randomUUID();
  private diagnosticTimer:ReturnType<typeof setInterval>;
  private savingDiagnostic?:Promise<void>;
  diagnosticFailures=0;
  private userId='';
  private generation=0;
  private operation=new AbortController();
  private destroyed=false;
  private subscription:Subscription;
  private visibility=()=>{if(document.hidden) this.pause();};
  private leaving=()=>this.pause();

  constructor(public voices:ReaderSpeechService, private http:HttpClient, private zone:NgZone,
    private activity:SessionActivityService, private stopPlaying:StopPlayingService) {
    this.subscription=stopPlaying.stopPlaying$.subscribe(stop=>{if(stop)this.pause();});
    document.addEventListener('visibilitychange',this.visibility);
    window.addEventListener('pagehide',this.leaving);
    this.diagnosticTimer=zone.runOutsideAngular(()=>setInterval(()=>{
      if(this.running)void this.persistDiagnostic();
    },30000));
  }
  get running():boolean {return !!this.reader && ['loading','speaking','committing','retrying'].includes(this.reader.state);}
  get format():'epub'|'pdf' {return this.context && 'format' in this.context && this.context.format==='pdf'?'pdf':'epub';}
  private notify():void {this.zone.run(()=>this.revision.update(value=>value+1));}
  private async identity():Promise<string> {
    const result=await firstValueFrom(this.http.get<{authenticated:boolean;userId:string}>('/api/me?passive=1',{withCredentials:true}).pipe(timeout(10000)));
    if(!result.authenticated || !result.userId) throw new Error('session-invalid');
    return String(result.userId);
  }
  async bind(context:SpeechContext):Promise<void> {
    this.pause(); const generation=this.generation;
    this.context=context; this.reader=undefined; this.saved=undefined; this.error=''; this.busy=true; this.notify();
    const format=this.format;
    if(this.storeFormat && this.storeFormat!==format) {
      this.store?.db.close();this.store=undefined;this.storeFormat=undefined;
      const diagnostics=this.diagnostics;
      void (this.savingDiagnostic??Promise.resolve()).then(()=>diagnostics).then(store=>store?.close()).catch(()=>{});
      this.diagnostics=undefined;
    }
    this.diagnosticId=crypto.randomUUID();
    try {
      const user=await this.identity();
      if(generation!==this.generation || this.destroyed)return;
      const store=this.store ?? await this.open(format);
      if(generation!==this.generation || this.destroyed) {if(store!==this.store)store.db.close();return;}
      this.store=store; this.storeFormat=format; this.userId=user;
      const platform=this.voices.platform;
      if(!platform) {this.error='Este navegador no ofrece sintesis de voz.';return;}
      const slot=JSON.stringify([user,context.archiveId,context.path]);
      this.reader=this.zone.runOutsideAngular(()=>new RecoverableReader({store,synth:platform.synth,
        Utterance:platform.utterance,owner:crypto.randomUUID(),slot,changed:()=>this.notify(),
        progress:()=>this.activity.renew('audio'),sourceFactory:async document=>{
          if(this.prepared?.id===document.id) {
            const source=this.prepared.source;this.prepared=undefined;return source;
          }
          const signal=this.operation.signal;
          try {
            const revision=await this.resourceRevision(document['sectionHref'] as string);
            if('format' in context && context.format==='pdf') {
              const source=new PdfSpeechSource(context,document,revision,signal);
              const session=this.reader?.session;
              if(session && session.cursor<session.end)await source.validateRange(session.cursor,session.pending?.end??session.cursor+1);
              return source;
            }
            return await restoreEpubSource(context as EpubSpeechContext,document,revision,signal);
          } catch(error) {throw new Error(this.failureCode(error));}
        }}));
      await this.reader.restore();
      if(generation!==this.generation) return;
      if(this.reader.session) this.saved=await store.getDocument(this.reader.session.documentId);
    } catch(error) {if(generation===this.generation)this.setError(error);}
    finally {if(generation===this.generation){this.busy=false;this.notify();}}
  }
  private async resourceRevision(sectionHref?:string):Promise<string> {
    if(!this.context || (this.format==='epub' && typeof sectionHref!=='string')) throw new Error('source-changed');
    const source=new URL(this.context.path,location.origin);
    // Folder EPUBs have individually served sections; ZIP EPUBs have a single resource.
    const root='resourceRoot' in this.context?this.context.resourceRoot:undefined;
    const resource=root ? new URL(sectionHref!,new URL(root,location.origin)) : source;
    if(resource.origin!==location.origin || !/^\/(books|cache)\//.test(resource.pathname)) throw new Error('source-path');
    const response:HttpResponse<unknown>=await firstValueFrom(this.http.head(resource.pathname,{observe:'response',withCredentials:true}).pipe(timeout(10000)));
    return JSON.stringify([response.headers.get('etag'),response.headers.get('last-modified'),response.headers.get('content-length')]);
  }
  private async authorize(generation:number):Promise<void> {
    const user=await this.identity();
    if(generation!==this.generation)throw new DOMException('Cancelled','AbortError');
    if(user!==this.userId) {
      this.reader=undefined; this.saved=undefined;
      throw new Error('session-changed');
    }
  }
  async start(selection:SpeechSelection|undefined,voice:SpeechSynthesisVoice,rate:number,remote:boolean,confirmed=false):Promise<void> {
    if(this.busy || !this.reader || !this.store || !this.context) return;
    if(!voice || (!voice.localService&&!remote)) {this.error='La voz no esta autorizada.';return;}
    if(selection && this.reader.session && !confirmed) {this.error='Confirma el cambio de seleccion.';return;}
    this.stopPlaying.stopPlayingAudio();
    const generation=this.generation; this.operation=new AbortController();
    this.busy=true; this.error=''; this.notify();
    try {
      await this.authorize(generation); if(generation!==this.generation)return;
      const reader=this.reader!;
      if(selection) {
        const revision=await this.resourceRevision('sectionHref' in selection?selection.sectionHref:undefined);
        if(generation!==this.generation)return;
        let source:TextDocument,prepared:BlockSource;
        if('format' in this.context && this.context.format==='pdf' && 'format' in selection && selection.format==='pdf') {
          source=describePdfSelection(this.context,selection,revision);
          const pdf=new PdfSpeechSource(this.context,source,revision,this.operation.signal);
          await pdf.validateRange(0,1);prepared=pdf;
        } else if(this.format==='epub' && !('format' in selection)) {
          const inspected=await this.zone.runOutsideAngular(()=>inspectEpubSelection(this.context as EpubSpeechContext,selection,revision,this.operation.signal));
          source=inspected.document;prepared=epubRangeSource(source,inspected.range,this.operation.signal);
        } else throw new Error('source-changed');
        if(generation!==this.generation)return;
        await this.store.putDocument(source);
        if(generation!==this.generation){await this.store.removeDocument(source.id);return;}
        const previous=reader.session?.documentId;
        await reader.replace(source,{confirmed:true,locale:voice.lang.replaceAll('_','-')});
        if(reader.session?.documentId!==source.id){await this.store.removeDocument(source.id);return;}
        if(generation!==this.generation)return;
        this.saved=source;
        this.prepared={id:source.id,source:prepared};
        if(previous && previous!==source.id) await this.store.removeDocument(previous);
      }
      if(generation!==this.generation)return;
      await this.zone.runOutsideAngular(()=>reader.resume(voice,rate,remote));
      if(generation===this.generation && reader.session) {
        const saved=await this.store.getDocument(reader.session.documentId);
        if(generation===this.generation)this.saved=saved;
      }
    } catch(error) {if(generation===this.generation)this.setError(error);}
    finally {if(generation===this.generation){this.busy=false;this.notify();}}
  }
  async restart():Promise<void> {
    if(!this.reader || this.busy) return;
    this.pause(); const generation=this.generation; this.busy=true;
    try {await this.authorize(generation);if(generation===this.generation)await this.reader!.restart(true);}
    catch(error){if(generation===this.generation)this.setError(error);}
    finally{if(generation===this.generation){this.busy=false;this.notify();}}
  }
  pause():void {
    this.generation++; this.operation.abort(); this.busy=false;
    this.prepared?.source.clear();this.prepared=undefined;
    void this.reader?.suspend(); this.notify();
    void this.persistDiagnostic();
  }
  private persistDiagnostic():Promise<void> {
    if(!this.reader?.session || this.savingDiagnostic)return this.savingDiagnostic??Promise.resolve();
    const heap=(performance as Performance & {memory?:{usedJSHeapSize:number}}).memory?.usedJSHeapSize;
    this.reader.metrics.sample({visible:!document.hidden,state:this.reader.state,cursor:this.reader.session.cursor,heapBytes:heap});
    const id=this.diagnosticId,report=this.reader.report({at:new Date().toISOString(),browser:navigator.userAgent,format:this.format});
    this.diagnostics??=openDiagnostics(`libretorio-${this.format}-speech-diagnostics-v1`);
    this.savingDiagnostic=this.diagnostics.then(store=>store.save(id,report)).then(()=>{}).catch(()=>{
      this.diagnosticFailures++;this.diagnostics=undefined;
    }).finally(()=>{this.savingDiagnostic=undefined;});
    return this.savingDiagnostic;
  }
  async diagnosticReport():Promise<Record<string,unknown>> {
    await this.persistDiagnostic();
    let previous:unknown[]=[];
    try{previous=await (await this.diagnostics)?.previous(this.diagnosticId)??[];}catch{this.diagnosticFailures++;}
    return {...this.reader?.report({at:new Date().toISOString(),browser:navigator.userAgent,format:this.format}),previous,diagnosticFailures:this.diagnosticFailures};
  }
  clearContext():void {
    this.pause(); this.context=undefined; this.reader=undefined; this.saved=undefined; this.error='';
  }
  private setError(error:unknown):void {
    const code=this.failureCode(error);
    this.reader?.record('source-error',{code});
    this.error=code==='source-changed'?'El archivo o el texto seleccionado cambio. El marcador anterior se conserva.':
      code==='session-changed'||code==='session-invalid'?'La sesion cambio. Cierra y vuelve a abrir el lector.':
      'No se pudo preparar la lectura. El marcador no se reinicio.';
  }
  private failureCode(error:unknown):string {
    if(error instanceof HttpErrorResponse)return `http-${error.status}`;
    if(error instanceof DOMException && error.name==='AbortError')return 'cancelled';
    const code=error instanceof Error?error.message:'';
    return ['source-changed','source-path','source-missing','source-unavailable','source-range','source-timeout','empty-source','session-changed','session-invalid',
      'storage-unavailable','storage-write-failed','reading-in-another-tab','lease-lost','checkpoint-conflict'].includes(code)?code:'prepare-failed';
  }
  ngOnDestroy():void {
    this.destroyed=true; this.pause(); this.subscription.unsubscribe();
    clearInterval(this.diagnosticTimer);
    void (this.savingDiagnostic??Promise.resolve()).then(()=>this.diagnostics).then(store=>store?.close()).catch(()=>{});
    document.removeEventListener('visibilitychange',this.visibility);window.removeEventListener('pagehide',this.leaving);
    this.context=undefined;
    this.store?.db.close();
  }
}
