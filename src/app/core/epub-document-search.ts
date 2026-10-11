import {EpubCFI} from 'epubjs';
import {DocumentSearchSource,SearchBatch} from './document-search';
import {domSearchWindow} from './dom-search';
export class EpubDocumentSearch implements DocumentSearchSource {
  private loading?:Promise<Document>;
  constructor(private book:any){}
  async search(query:string,cursor:any,signal:AbortSignal):Promise<SearchBatch>{
    if(this.loading)throw new Error('search-busy');
    const index=cursor?.index??0,offset=cursor?.offset??0,section=this.book.spine.spineItems[index];
    if(!section)return {hits:[],cursor,done:true};
    // book.load creates a detached section; section.load/unload would mutate the continuous reader's shared section.
    const loading=this.loading=this.book.load(section.url) as Promise<Document>;
    let doc:Document;
    try{doc=await loading;}finally{if(this.loading===loading)this.loading=undefined;}
    if(signal.aborted)throw new DOMException('Cancelled','AbortError');
    const root=doc.querySelector('body')??doc.documentElement;
    const result=domSearchWindow(root,query,offset);
    return {hits:result.hits.filter(hit=>hit.range).map(hit=>({label:`Seccion ${index+1}`,excerpt:hit.excerpt,
      cfi:new EpubCFI(hit.range!,section.cfiBase).toString()})),
      cursor:result.done?{index:index+1,offset:0}:{index,offset:result.next},
      done:result.done&&index+1>=this.book.spine.spineItems.length,examined:result.examined};
  }
}
