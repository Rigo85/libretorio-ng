import {inject, Injectable, signal} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {firstValueFrom, Subject, timeout, takeUntil, fromEvent, NEVER} from 'rxjs';

export type ReadingFormat='pdf'|'converted-pdf'|'epub'|'audio'|'comic';
export interface ReadingIdentity {version:number;userId:string;epoch:string;}
export interface ReadingPosition {version:1;page?:number;chunk?:number;ratio?:number;mode?:string;layout?:string;cfi?:string;section?:string;percent?:number;track?:string;seconds?:number;}
export interface ReadingContext {sourceRevision:string;sourcePath:string;changed:boolean;saved:any;}
const positionKey=(value?:ReadingPosition)=>JSON.stringify(value??null,Object.keys(value??{}).sort());

@Injectable({providedIn:'root'})
export class ReadingService {
  private http=inject(HttpClient);
  private capability?:Promise<ReadingIdentity|undefined>;
  private generation=0;
  private trackers=new Set<ReadingTracker>();
  private preferences:any={revision:0,values:{}};
  private preferenceWork:Promise<void>=Promise.resolve();
  readonly preferenceWarning=signal('');
  readonly progressUpdates=new Subject<{id:number;format:ReadingFormat;saved:any;userId:string;epoch:string}>();
  async identity():Promise<ReadingIdentity|undefined> {
    const generation=this.generation;
    return this.capability??=this.request<ReadingIdentity>('GET','/capabilities').then(value=>value?.version===1?value:undefined).catch(error=>{
      if(error.status===404)return undefined;
      if(generation===this.generation)this.capability=undefined;throw error;
    });
  }
  async request<T>(method:string,path:string,body?:unknown,identity?:ReadingIdentity,signal?:AbortSignal):Promise<T> {
    if(path!=='/capabilities'&&!identity)identity=await this.identity();
    if(signal?.aborted)throw new DOMException('Request aborted','AbortError');
    if(path!=='/capabilities'&&!identity)throw {status:404};
    return firstValueFrom(this.http.request<T>(method,'/api/reading'+path,{body,withCredentials:true,
      headers:identity?{'X-Reading-Session':identity.epoch}:{}}).pipe(timeout(10000),takeUntil(signal?fromEvent(signal,'abort'):NEVER)));
  }
  async begin(id:number|string|undefined,format:ReadingFormat):Promise<ReadingTracker|undefined> {
    if(id===undefined)return undefined;
    const generation=this.generation,identity=await this.identity();
    if(!identity||generation!==this.generation)return undefined;
    const tracker=new ReadingTracker(this,Number(id),format,identity,()=>this.trackers.delete(tracker));
    this.trackers.add(tracker);await tracker.load();
    if(generation!==this.generation){tracker.dispose(false);return undefined;}
    return tracker;
  }
  async visit(id:number|string):Promise<void> {
    const generation=this.generation,identity=await this.identity();
    if(identity&&generation===this.generation)await this.request('POST',`/items/${id}/visit`,{operationId:crypto.randomUUID()},identity);
  }
  async settings(group:string):Promise<any> {
    const generation=this.generation,identity=await this.identity();if(!identity)return undefined;
    let preferences:any;
    try {preferences=await this.request('GET','/preferences',undefined,identity);}
    catch(error:any){
      if([401,403,409].includes(error.status))throw error;
      try {preferences=JSON.parse(localStorage.getItem(`libretorio:reading:prefs:${identity.userId}`)??'null');}catch{}
      if(!preferences)throw error;
      this.preferenceWarning.set('Preferencias locales; no se pudieron consultar las del servidor.');
    }
    if(generation!==this.generation)return undefined;
    this.preferences=preferences;
    try {localStorage.setItem(`libretorio:reading:prefs:${identity.userId}`,JSON.stringify(this.preferences));}catch{}
    return this.preferences.values[group]??{};
  }
  changeSettings(group:string,patch:any):void {
    const generation=this.generation;
    this.preferenceWork=this.preferenceWork.then(async()=>{
      const identity=await this.identity();if(!identity||generation!==this.generation)return;
      const preferences=await this.request('PATCH','/preferences',{expectedRevision:this.preferences.revision,patch:{[group]:patch}},identity);
      if(generation!==this.generation)return;
      this.preferences=preferences;
      this.preferenceWarning.set('');
      try {localStorage.setItem(`libretorio:reading:prefs:${identity.userId}`,JSON.stringify(this.preferences));}catch{}
    }).catch(()=>{if(generation===this.generation)this.preferenceWarning.set('Preferencias sin sincronizar. Vuelve a abrir el lector antes de cambiarlas.');});
  }
  stop():void {
    ++this.generation;for(const tracker of this.trackers)tracker.dispose(false);
    this.trackers.clear();this.capability=undefined;this.preferences={revision:0,values:{}};this.preferenceWarning.set('');
  }
}

export class ReadingTracker {
  readonly status=signal('');
  context?:ReadingContext;
  restored?:ReadingPosition;
  ready=false;
  blocked=false;
  private stopped=false;
  private saveOnClose=false;
  private sending=false;
  private sequence=0;
  private draft?:ReadingPosition;
  private operation?:any;
  private target='';
  private committed='';
  private lastPersist=0;
  private timer:ReturnType<typeof setInterval>;
  private hidden=()=>{if(document.hidden)void this.flush();};
  private leaving=()=>void this.flush();
  private get endpoint(){return `/items/${this.id}/progress/${this.format}`;}
  private get key(){return `libretorio:reading:position:${this.identity.userId}:${this.id}:${this.format}`;}
  constructor(private api:ReadingService,readonly id:number,readonly format:ReadingFormat,private identity:ReadingIdentity,private removed:()=>void) {
    this.timer=setInterval(()=>void this.flush(),30000);
    document.addEventListener('visibilitychange',this.hidden);window.addEventListener('pagehide',this.leaving);
  }
  async load():Promise<void> {
    try {
      const context=await this.api.request<ReadingContext>('GET',this.endpoint,undefined,this.identity);if(this.stopped)return;
      this.context=context;this.target=this.targetOf(context.saved?.position);
      if(context.changed){this.blocked=true;this.status.set('El archivo cambio. El marcador anterior se conserva.');return;}
      this.restored=context.saved?.position;this.committed=positionKey(this.restored);
      let cached:any;
      try {cached=JSON.parse(localStorage.getItem(this.key)??'null');}catch{this.status.set('La copia local del progreso no esta disponible.');}
      if(cached?.epoch===this.identity.epoch && cached.operation &&
        cached.operation.expectedRevision===(context.saved?.revision??0) && cached.operation.sourceRevision===context.sourceRevision) {
        this.operation=cached.operation;this.draft=this.operation.position;this.restored=this.draft;this.status.set('Posicion local pendiente de sincronizar.');
      } else if(cached?.epoch===this.identity.epoch && cached.draft && cached.revision===(context.saved?.revision??0) &&
        cached.sourceRevision===context.sourceRevision && this.targetOf(cached.draft)===this.target) {
        this.draft=cached.draft;this.restored=cached.draft;
      }
    }catch(error){this.blocked=true;this.status.set('No se pudo recuperar el progreso. El marcador no se reinicio.');}
  }
  private targetOf(value?:ReadingPosition){return value?.track?`?track=${encodeURIComponent(value.track)}`:value?.section?`?section=${encodeURIComponent(value.section)}`:'';}
  async useCurrentPosition():Promise<void> {
    if(this.stopped||this.sending||!window.confirm('El marcador anterior se reemplazara al guardar tu nueva posicion. Continuar?'))return;
    try {
      const context=await this.api.request<ReadingContext>('GET',this.endpoint+'?fresh=1',undefined,this.identity);
      if(this.stopped)return;
      this.context=context;this.target='';this.operation=undefined;this.draft=undefined;this.committed='';
      this.blocked=false;this.ready=true;this.persist();this.status.set('Se guardara tu posicion al continuar la lectura.');
    }catch{this.status.set('No se pudo habilitar el marcador. Comprueba la sesion y el archivo.');}
  }
  capture(position:ReadingPosition,immediate=false):void {
    if(!this.ready||this.stopped)return;
    this.draft={...position};++this.sequence;
    if(!this.blocked)this.status.set(positionKey(position)===this.committed?'':'Posicion pendiente de sincronizar.');
    if(immediate||Date.now()-this.lastPersist>2000)this.persist();if(immediate)void this.flush();
  }
  private persist():void {
    this.lastPersist=Date.now();
    try {localStorage.setItem(this.key,JSON.stringify({epoch:this.identity.epoch,operation:this.operation,draft:this.draft,
      revision:this.context?.saved?.revision??0,sourceRevision:this.context?.sourceRevision}));}
    catch {this.status.set('No se pudo guardar la copia local del progreso.');}
  }
  async flush():Promise<void> {
    if(!this.ready||this.blocked||this.sending||!this.context||!this.draft)return;
    if(!this.operation&&positionKey(this.draft)===this.committed)return;
    this.sending=true;
    try {
      const draft={...this.draft},sequence=this.sequence;
      if(!this.operation) {
        const target=this.targetOf(draft);
        if(target!==this.target) {
          const next=await this.api.request<ReadingContext>('GET',this.endpoint+target,undefined,this.identity);
          if((next.saved?.revision??0)!==(this.context.saved?.revision??0))throw {status:409};
          this.context=next;this.target=target;
        }
        if(this.blocked)return;
        this.operation={operationId:crypto.randomUUID(),expectedRevision:this.context.saved?.revision??0,
          sourceRevision:this.context.sourceRevision,position:draft};this.persist();
      }
      const operation=this.operation;
      if(this.blocked)return;
      const saved=await this.api.request<any>('PUT',this.endpoint,operation,this.identity);
      this.context.saved=saved;this.committed=positionKey(operation.position);this.operation=undefined;
      this.api.progressUpdates?.next({id:this.id,format:this.format,saved,userId:this.identity.userId,epoch:this.identity.epoch});
      if(sequence===this.sequence)this.status.set('');this.persist();
    }catch(error:any){
      if([401,403,409].includes(error.status)){this.blocked=true;this.status.set('Progreso sin sincronizar: la sesion, el archivo o el marcador cambiaron. Vuelve a abrir el lector.');}
      else this.status.set('Sin conexion con el historial. La posicion queda pendiente en este navegador.');
    }finally{
      this.sending=false;
      if(this.saveOnClose&&!this.blocked&&!this.operation&&this.draft&&positionKey(this.draft)!==this.committed){
        this.saveOnClose=false;void this.flush();
      }
    }
  }
  dispose(save=true):void {
    if(this.stopped)return;
    this.saveOnClose=save;
    if(save){this.persist();void this.flush();}else {this.blocked=true;this.ready=false;}
    this.stopped=true;clearInterval(this.timer);document.removeEventListener('visibilitychange',this.hidden);window.removeEventListener('pagehide',this.leaving);this.removed();
  }
}
