import {EpubCFI} from 'epubjs';
import CryptoJS from 'crypto-js';
import {ALGORITHM, BLOCK_SIZE, BlockSource, TextDocument} from './recoverable-speech/source.mjs';

export interface EpubSelection {cfi:string; sectionHref:string; preview:string;}
export interface EpubSpeechContext {
  archiveId:number|string; path:string; resourceRoot?:string;
  book:{getRange(cfi:string):Promise<Range>; spine:{get(index:number):{href:string} | undefined}};
}
export interface EpubTextDocument extends TextDocument {
  kind:'epub-selection'; cfi:string; sectionHref:string; path:string; archiveId:number|string;
  textVersion:'epub-selection-v1-utf16le'; httpRevision:string;
}

const SKIP = new Set(['script','style','noscript','template','head']);
const BLOCK = new Set(['p','div','section','article','blockquote','pre','li','dt','dd','tr','td','th','h1','h2','h3','h4','h5','h6','body']);
function blockOf(node:Node):Element | null {
  let element=node.parentElement;
  while(element && !BLOCK.has(element.localName.toLowerCase())) element=element.parentElement;
  return element;
}

// EPUB.js CFI serialization expects text endpoints, including for Select All.
export function textAnchoredRange(range:Range):Range {
  if(range.startContainer.nodeType===Node.TEXT_NODE && range.endContainer.nodeType===Node.TEXT_NODE)return range;
  const root=range.commonAncestorContainer,doc=root.nodeType===Node.DOCUMENT_NODE?root as Document:root.ownerDocument!;
  const walker=doc.createTreeWalker(root,NodeFilter.SHOW_TEXT,{
    acceptNode(node) {
      const text=node as Text;
      return text.length && range.comparePoint(text,text.length)>=0 && range.comparePoint(text,0)<=0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });
  const first=walker.nextNode();walker.currentNode=root;const last=walker.lastChild();
  if(!first || !last)return range;
  const result=range.cloneRange();
  result.setStart(first,first===range.startContainer?range.startOffset:0);
  result.setEnd(last,last===range.endContainer?range.endOffset:(last as Text).length);
  return result;
}

// Walk only the selected range. No Range.toString(), cloneContents(), textContent
// of a chapter, retained text-node array, or renderer/display calls.
export function* selectedTextPieces(range:Range):Generator<string> {
  const root=range.commonAncestorContainer, doc=root.nodeType===Node.DOCUMENT_NODE ? root as Document : root.ownerDocument!;
  for(let ancestor=root.nodeType===Node.ELEMENT_NODE ? root as Element : root.parentElement;ancestor;ancestor=ancestor.parentElement) {
    if(SKIP.has(ancestor.localName.toLowerCase()) || ancestor.hasAttribute('hidden') || ancestor.getAttribute('aria-hidden')==='true') return;
  }
  const walker=doc.createTreeWalker(root,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT,{
    acceptNode(node) {
      if(node.nodeType===Node.ELEMENT_NODE) {
        const el=node as Element;
        if(SKIP.has(el.localName.toLowerCase()) || el.hasAttribute('hidden') || el.getAttribute('aria-hidden')==='true') return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let node:Node|null=root, previous:Element|null=null, emitted=false;
  while(node) {
    if(node.nodeType===Node.TEXT_NODE) {
      const text=node as Text;
      if(range.comparePoint(text,0)>0) break;
      if(range.comparePoint(text,text.length)>=0) {
        const start=text===range.startContainer?range.startOffset:0;
        const end=text===range.endContainer?range.endOffset:text.length;
        if(end>start) {
          const block=blockOf(text);
          if(emitted && block!==previous) yield '\n';
          for(let offset=start;offset<end;offset+=BLOCK_SIZE) yield text.data.slice(offset,Math.min(end,offset+BLOCK_SIZE));
          emitted=true; previous=block;
        }
      }
    } else if(node.nodeType===Node.ELEMENT_NODE && (node as Element).localName.toLowerCase()==='br' && range.intersectsNode(node)) {
      yield '\n';
    }
    node=walker.nextNode();
  }
}

export function* selectedBlocks(range:Range):Generator<string> {
  let pending='';
  for(const piece of selectedTextPieces(range)) {
    for(let offset=0;offset<piece.length;) {
      const count=Math.min(BLOCK_SIZE-pending.length,piece.length-offset);
      pending+=piece.slice(offset,offset+count); offset+=count;
      if(pending.length===BLOCK_SIZE) {yield pending;pending='';}
    }
  }
  if(pending) yield pending;
}

export function captureEpubSelection(contents:{document:Document;cfiFromRange(range:Range):string}, context:EpubSpeechContext):EpubSelection|undefined {
  const selected=contents.document.getSelection();
  if(!selected || selected.isCollapsed || selected.rangeCount!==1) return undefined;
  const range=textAnchoredRange(selected.getRangeAt(0)), cfi=contents.cfiFromRange(range);
  const section=context.book.spine.get(new EpubCFI(cfi).spinePos);
  if(!section) return undefined;
  let preview='';
  for(const piece of selectedTextPieces(range)) {preview+=piece.slice(0,140-preview.length);if(preview.length>=140)break;}
  return preview.trim()?{cfi,sectionHref:section.href,preview}:undefined;
}

function check(signal:AbortSignal):void {if(signal.aborted) throw new DOMException('Cancelled','AbortError');}

export async function inspectEpubSelection(context:EpubSpeechContext, anchor:Pick<EpubSelection,'cfi'|'sectionHref'>,
  httpRevision:string,signal:AbortSignal):Promise<{document:EpubTextDocument;range:Range}> {
  check(signal);
  const section=context.book.spine.get(new EpubCFI(anchor.cfi).spinePos);
  if(!section || section.href!==anchor.sectionHref) throw new Error('source-changed');
  const range=await context.book.getRange(anchor.cfi); check(signal);
  if(!range || range.collapsed) throw new Error('source-changed');
  const hash=CryptoJS.algo.SHA256.create(); let length=0, visible=false, yieldedAt=performance.now();
  // An incremental fingerprint is needed because the backend has no content hash.
  // It scans the selection once, yielding to the UI, but never accumulates the text.
  for(const block of selectedBlocks(range)) {
    check(signal); hash.update(CryptoJS.enc.Utf16LE.parse(block)); length+=block.length;
    visible ||= /\S/u.test(block);
    if(performance.now()-yieldedAt>8) {await new Promise(resolve=>setTimeout(resolve,0));yieldedAt=performance.now();}
  }
  check(signal);
  if(!visible) throw new Error('empty-source');
  const revision=hash.finalize().toString();
  return {range,document:{id:crypto.randomUUID(),revision,title:'Seleccion EPUB',length,algorithm:ALGORITHM,
    kind:'epub-selection',textVersion:'epub-selection-v1-utf16le',cfi:anchor.cfi,sectionHref:anchor.sectionHref,
    path:context.path,archiveId:context.archiveId,httpRevision}};
}

export async function restoreEpubSource(context:EpubSpeechContext, saved:TextDocument,httpRevision:string,signal:AbortSignal):Promise<BlockSource> {
  if(saved.kind!=='epub-selection' || saved['textVersion']!=='epub-selection-v1-utf16le' || saved['archiveId']!==context.archiveId ||
    saved['path']!==context.path || typeof saved['cfi']!=='string' || typeof saved['sectionHref']!=='string' ||
    (saved['httpRevision'] && saved['httpRevision']!==httpRevision)) throw new Error('source-changed');
  const {range,document}=await inspectEpubSelection(context,{cfi:saved['cfi'],sectionHref:saved['sectionHref']},httpRevision,signal);
  if(document.revision!==saved.revision || document.length!==saved.length) throw new Error('source-changed');
  return epubRangeSource(saved,range,signal);
}

export function epubRangeSource(saved:TextDocument,range:Range,signal:AbortSignal):BlockSource {
  let blocks=selectedBlocks(range), index=0;
  const source=new BlockSource(saved,async(_id,wanted)=>{
    check(signal);
    if(wanted<index) {blocks=selectedBlocks(range);index=0;}
    let value:IteratorResult<string>; let yieldedAt=performance.now();
    do {
      value=blocks.next(); if(value.done) return undefined;
      index++;
      if(performance.now()-yieldedAt>8) {await new Promise(resolve=>setTimeout(resolve,0));check(signal);yieldedAt=performance.now();}
    } while(index<=wanted);
    return value.value;
  });
  return source;
}
