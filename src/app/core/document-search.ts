export type DocumentHit={label:string;excerpt:string;page?:number;start?:number;end?:number;cfi?:string;occurrence?:number};
export interface SearchBatch {hits:DocumentHit[];cursor:unknown;done:boolean;examined?:number;}
export interface DocumentSearchSource {search(query:string,cursor:unknown,signal:AbortSignal):Promise<SearchBatch>;release?():void;}
export class DocumentSearch {
  query='';hits:DocumentHit[]=[];cursor:unknown;done=false;busy=false;error='';units=0;peakResults=0;
  private generation=0;private request?:AbortController;
  constructor(private source:DocumentSearchSource,private changed:()=>void){}
  async start(query:string){this.cancel();this.query=query.trim();this.hits=[];this.cursor=undefined;this.done=false;this.units=0;this.error='';
    if(!this.query||this.query.length>128){this.error='Escribe entre 1 y 128 caracteres.';this.changed();return;}await this.more();}
  async more(){
    if(this.busy||this.done||!this.query)return;
    const generation=++this.generation,request=this.request=new AbortController();this.busy=true;this.error='';this.hits=[];
    const started=performance.now();
    try{
      // At most one unit is in flight. Yield between units so readers/TTS can use the worker.
      do{
        await new Promise(resolve=>setTimeout(resolve,25));if(generation!==this.generation)return;
        const result=await this.source.search(this.query,this.cursor,request.signal);
        if(generation!==this.generation)return;
        if(result.hits.length>50)throw new Error('invalid-search-batch');
        this.cursor=result.cursor;this.done=result.done;this.hits.push(...result.hits);++this.units;
        this.peakResults=Math.max(this.peakResults,this.hits.length);this.changed();
      }while(!this.done&&this.hits.length===0&&performance.now()-started<2000);
    }catch(error:any){if(generation===this.generation)this.error='Busqueda incompleta. No se pudo examinar el siguiente tramo; puedes reintentar.';}
    finally{if(generation===this.generation){this.busy=false;this.source.release?.();this.changed();}}
  }
  cancel(notify=true){++this.generation;this.request?.abort();this.busy=false;this.source.release?.();if(notify)this.changed();}
  close(){this.cancel(false);this.hits=[];this.cursor=undefined;this.query='';this.done=false;}
}
