import {PdfSpeechLayout,PdfSpeechPage} from '../../core/pdf-speech-source';

export class PdfSpeechChannel {
  private sequence=0;
  private closed=false;
  private pending=new Map<string,{resolve:(text:string)=>void;reject:(error:Error)=>void;cleanup:()=>void}>();
  constructor(private worker:Pick<Worker,'postMessage'>) {}
  read(page:PdfSpeechPage,layout:PdfSpeechLayout,start:number,end:number,signal:AbortSignal):Promise<string> {
    if(this.closed || signal.aborted)return Promise.reject(new Error('source-unavailable'));
    return new Promise((resolve,reject)=>{
      const id=`speech-${++this.sequence}`;
      const finish=(error:Error)=>{this.pending.get(id)?.cleanup();this.pending.delete(id);reject(error);};
      const abort=()=>finish(new DOMException('Cancelled','AbortError'));
      const timer=setTimeout(()=>finish(new Error('source-timeout')),30000);
      const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);};
      this.pending.set(id,{resolve,reject,cleanup});signal.addEventListener('abort',abort,{once:true});
      try{this.worker.postMessage({id,type:'speech-text',channel:'speech',page:page.page,start,end,
        revision:page.revision,length:page.length,options:layout});}catch{finish(new Error('source-unavailable'));}
    });
  }
  receive(data:{channel?:string;id?:string;type:string;text?:string;error?:string}):boolean {
    if(data.channel!=='speech')return false;
    const pending=this.pending.get(data.id!);if(!pending)return true;
    pending.cleanup();this.pending.delete(data.id!);
    if(data.type==='speech-text' && typeof data.text==='string' && data.text.length<=8192)pending.resolve(data.text);
    else pending.reject(new Error(data.error==='source-changed'?'source-changed':'source-unavailable'));
    return true;
  }
  close():void {
    this.closed=true;
    for(const pending of this.pending.values()){pending.cleanup();pending.reject(new Error('source-unavailable'));}
    this.pending.clear();
  }
}
