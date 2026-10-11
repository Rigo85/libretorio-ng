import CryptoJS from 'crypto-js';
import {ALGORITHM, BLOCK_SIZE, BlockSource, TextDocument} from './recoverable-speech/source.mjs';

export interface PdfSpeechLayout {
  reading:boolean; layoutWidth:number; fontSize:number; fontFamily:string; pageMargin:number; lineHeight:number;
}
export interface PdfSpeechPage {page:number;start:number;end:number;length:number;revision:string;}
export interface PdfSpeechSelection {format:'pdf';pages:PdfSpeechPage[];layout:PdfSpeechLayout;preview:string;}
export interface PdfSpeechContext {
  format:'pdf';archiveId:number|string;path:string;pages:number;
  readText(page:PdfSpeechPage,layout:PdfSpeechLayout,start:number,end:number,signal:AbortSignal):Promise<string>;
}
export function pdfSelectionKey(selection:Pick<PdfSpeechSelection,'pages'|'layout'>):string {
  return JSON.stringify([selection.pages,selection.layout]);
}
function check(signal:AbortSignal):void {if(signal.aborted)throw new DOMException('Cancelled','AbortError');}
function validLayout(layout:PdfSpeechLayout):boolean {
  return !!layout && typeof layout.reading==='boolean' && Number.isFinite(layout.layoutWidth) && layout.layoutWidth>=120 &&
    layout.layoutWidth<=100000 && Number.isFinite(layout.fontSize) && layout.fontSize>=12 && layout.fontSize<=36 &&
    ['publisher','serif','sans-serif','monospace'].includes(layout.fontFamily) && [6,12,24].includes(layout.pageMargin) && [1.3,1.5,1.8].includes(layout.lineHeight);
}
function selectionLength(context:PdfSpeechContext,selection:PdfSpeechSelection):number {
  if(!validLayout(selection.layout) || !Array.isArray(selection.pages) || !selection.pages.length || selection.pages.length>context.pages)throw new Error('source-changed');
  let length=0,previous=-1;
  for(const item of selection.pages) {
    if(![item.page,item.start,item.end,item.length].every(Number.isSafeInteger) || item.page<0 || item.page>=context.pages ||
      item.start<0 || item.end<item.start || item.end>item.length || !/^[a-f0-9]{64}$/.test(item.revision) ||
      (previous>=0 && item.page!==previous+1))throw new Error('source-changed');
    length+=item.end-item.start+(previous>=0?1:0);previous=item.page;
  }
  if(!Number.isSafeInteger(length) || length<=0)throw new Error('empty-source');
  return length;
}
export function describePdfSelection(context:PdfSpeechContext,selection:PdfSpeechSelection,httpRevision:string):TextDocument {
  const length=selectionLength(context,selection),key=pdfSelectionKey(selection);
  return {id:crypto.randomUUID(),revision:CryptoJS.SHA256(key).toString(),title:'Seleccion PDF',length,algorithm:ALGORITHM,
    kind:'pdf-selection',textVersion:'pdf-lines-v1',archiveId:context.archiveId,path:context.path,httpRevision,
    pages:structuredClone(selection.pages),layout:{...selection.layout},selectionKey:key};
}

// The descriptor retains page offsets/hashes, never the text of all selected pages.
// Page extraction remains in the existing worker; each response is <= BLOCK_SIZE.
export class PdfSpeechSource extends BlockSource {
  readonly validateRange:(start:number,end:number)=>Promise<void>;
  constructor(context:PdfSpeechContext,saved:TextDocument,httpRevision:string,signal:AbortSignal) {
    const selection={format:'pdf',pages:saved['pages'],layout:saved['layout'],preview:''} as PdfSpeechSelection;
    if(saved.kind!=='pdf-selection' || saved['textVersion']!=='pdf-lines-v1' || saved['archiveId']!==context.archiveId ||
      saved['path']!==context.path || saved['httpRevision']!==httpRevision || selectionLength(context,selection)!==saved.length ||
      CryptoJS.SHA256(pdfSelectionKey(selection)).toString()!==saved.revision)throw new Error('source-changed');
    let cursor=0;
    const entries=selection.pages.map((page,index)=>{
      const start=cursor;cursor+=page.end-page.start;
      const end=cursor;if(index<selection.pages.length-1)cursor++;
      return {page,start,end};
    });
    async function read(start:number,end:number):Promise<string> {
      check(signal);let text='';
      for(const entry of entries) {
        if(entry.start>=end)break;
        if(entry.end<start)continue;
        const from=Math.max(start,entry.start),to=Math.min(end,entry.end);
        if(to>from) {
          const part=await context.readText(entry.page,selection.layout,entry.page.start+from-entry.start,entry.page.start+to-entry.start,signal);
          check(signal);if(part.length!==to-from)throw new Error('source-changed');text+=part;
        } else if(entry.end>=start && entry.end<end) {
          await context.readText(entry.page,selection.layout,entry.page.start,entry.page.start,signal);check(signal);
        }
        if(entry.end>=start && entry.end<end && entry.end<saved.length)text+='\n';
      }
      return text;
    }
    super(saved,async(_id,index)=>read(index*BLOCK_SIZE,Math.min(saved.length,(index+1)*BLOCK_SIZE)));
    this.validateRange=async(start,end)=>{
      check(signal);
      // A pending phrase is persisted already, but its backing pages must still be valid.
      for(const entry of entries)if(entry.start<end && entry.end>=start) {
        await context.readText(entry.page,selection.layout,entry.page.start,entry.page.start,signal);check(signal);
      }
    };
  }
}
