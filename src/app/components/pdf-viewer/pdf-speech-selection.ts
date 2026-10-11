import {PdfSpeechLayout,PdfSpeechPage,PdfSpeechSelection} from '../../core/pdf-speech-source';

function layerOf(node:Node,root:HTMLElement):HTMLElement|null {
  const el=node.nodeType===Node.ELEMENT_NODE?node as Element:node.parentElement;
  const layer=el?.closest<HTMLElement>('.pdf-text-layer');return layer&&root.contains(layer)?layer:null;
}
function offsetAt(layer:HTMLElement,node:Node,offset:number):number {
  const before=layer.ownerDocument.createRange();before.setStart(layer,0);before.setEnd(node,offset);
  const walker=layer.ownerDocument.createTreeWalker(layer,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);
  let current:Node|null,total=0;
  while((current=walker.nextNode())) {
    if(current.nodeType===Node.TEXT_NODE) {
      const text=current as Text;if(before.comparePoint(text,0)>0)break;
      total+=text===node?offset:before.comparePoint(text,text.length)<=0?text.length:0;
    } else if((current as Element).tagName==='BR' && before.intersectsNode(current))total++;
  }
  return total;
}
export function capturePdfSpeechSelection(root:HTMLElement,layout:PdfSpeechLayout,selected=root.ownerDocument.getSelection()):PdfSpeechSelection|undefined {
  if(!selected || selected.isCollapsed || selected.rangeCount!==1)return undefined;
  const range=selected.getRangeAt(0),first=layerOf(range.startContainer,root),last=layerOf(range.endContainer,root);
  if(!first||!last)return undefined;
  try {if(first.dataset['speechLayout'])layout=JSON.parse(first.dataset['speechLayout']);}catch{return undefined;}
  layout={reading:layout.reading,layoutWidth:layout.layoutWidth,fontSize:layout.fontSize,fontFamily:layout.fontFamily,pageMargin:layout.pageMargin,lineHeight:layout.lineHeight};
  const layers=[...root.querySelectorAll<HTMLElement>('.pdf-text-layer')].filter(el=>range.intersectsNode(el));
  const pages:PdfSpeechPage[]=[];let preview='';
  for(const layer of layers) {
    const page=Number(layer.dataset['page']),length=Number(layer.dataset['speechLength']),revision=layer.dataset['speechRevision'];
    if(layer.dataset['speechLayout'] && layer.dataset['speechLayout']!==first.dataset['speechLayout'])return undefined;
    if(!Number.isSafeInteger(page)||!Number.isSafeInteger(length)||length<0||!revision || (pages.length&&page!==pages.at(-1)!.page+1))return undefined;
    const start=layer===first?offsetAt(layer,range.startContainer,range.startOffset):0;
    const end=layer===last?offsetAt(layer,range.endContainer,range.endOffset):length;
    if(start>end||end>length)return undefined;
    pages.push({page,start,end,length,revision});
    if(preview.length<140) {
      const walker=layer.ownerDocument.createTreeWalker(layer,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);
      let node:Node|null,index=0;
      while(preview.length<140&&(node=walker.nextNode())) {
        const size=node.nodeType===Node.TEXT_NODE?(node as Text).length:(node as Element).tagName==='BR'?1:0;
        const from=Math.max(0,start-index),to=Math.min(size,end-index);
        if(to>from)preview+=(node.nodeType===Node.TEXT_NODE?(node as Text).data.slice(from,Math.min(to,from+140-preview.length)):'\n');
        index+=size;if(index>=end)break;
      }
    }
  }
  return pages.length&&preview.trim()?{format:'pdf',pages,layout:{...layout},preview:preview.slice(0,140)}:undefined;
}
