import {findWindow,WINDOW} from '../../../public/assets/pdf-reader/text-search.mjs';

// Read only a text window. Keep node references for that window to construct a Range without replacing reader DOM.
export function domSearchWindow(root:Element,query:string,start=0){
  const doc=root.ownerDocument,walker=doc.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
  const pieces:{node:Text;offset:number;start:number;end:number}[]=[];
  let text='',offset=0,node:Node|null,complete=true;
  while((node=walker.nextNode())){
    let value='';
    if(node.nodeType===Node.TEXT_NODE){if(node.parentElement?.closest('script,style,head,noscript,[hidden]'))continue;value=(node as Text).data;}
    else if(/^(p|div|br|li|h[1-6]|section|tr)$/i.test((node as Element).localName))value='\n';
    if(!value)continue;
    const end=offset+value.length;
    if(end>start){
      const skip=Math.max(0,start-offset),part=value.slice(skip,skip+WINDOW+256-text.length),position=text.length;
      text+=part;
      if(node.nodeType===Node.TEXT_NODE)pieces.push({node:node as Text,offset:skip,start:position,end:text.length});
      if(text.length>=WINDOW+256){complete=false;break;}
    }
    offset=end;
  }
  const result=findWindow(text,query,0,50);
  function range(from:number,to:number){
    const first=pieces.find(p=>p.end>from),last=[...pieces].reverse().find(p=>p.start<to);
    if(!first||!last)return undefined;
    const range=doc.createRange();range.setStart(first.node,first.offset+Math.max(0,from-first.start));
    range.setEnd(last.node,last.offset+Math.min(last.end-last.start,to-last.start));return range;
  }
  return {hits:result.hits.map(hit=>({...hit,range:range(hit.start,hit.end)})),next:start+result.next,done:complete&&result.done,examined:result.examined};
}
