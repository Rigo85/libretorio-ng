export class PdfSearchChannel {
  private sequence=0;
  private pending?:{id:string;resolve:(data:any)=>void;reject:(error:Error)=>void;cleanup:()=>void};
  constructor(private worker:Pick<Worker,'postMessage'>){}
  request(data:Record<string,unknown>,signal:AbortSignal):Promise<any>{
    if(this.pending||signal.aborted)return Promise.reject(new Error('search-busy'));
    return new Promise((resolve,reject)=>{
      const id=`search-${++this.sequence}`;
      // An aborted native call still occupies the worker until it responds: never build a queue of cancelled searches.
      const abort=()=>reject(new DOMException('Cancelled','AbortError'));
      const timer=setTimeout(()=>reject(new Error('search-timeout')),30000);
      const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);};
      this.pending={id,resolve,reject,cleanup};signal.addEventListener('abort',abort,{once:true});
      try{this.worker.postMessage({...data,id,channel:'search'});}
      catch(error){cleanup();this.pending=undefined;reject(error);}
    });
  }
  receive(data:any):boolean{
    if(data.channel!=='search')return false;
    if(this.pending&&this.pending.id===data.id){const pending=this.pending;this.pending=undefined;pending.cleanup();
      if(data.type==='error')pending.reject(new Error(data.error));else pending.resolve(data);}
    return true;
  }
  close(){this.pending?.cleanup();this.pending?.reject(new Error('closed'));this.pending=undefined;}
}
