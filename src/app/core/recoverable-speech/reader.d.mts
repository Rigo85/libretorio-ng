import type {BlockSource, Fragment, TextDocument} from './source.mjs';
import type {ReadingStore} from './store.mjs';
import type {ReadingMetrics} from './diagnostics.mjs';
export interface ReadingSession {
  schema:number; algorithm:string; documentId:string; documentRevision:string; title:string;
  start:number; end:number; cursor:number; pending:(Fragment & {attempts:number}) | null;
  locale:string; revision:number; settings:{voice:string;rate:number} | null;
}
export class RecoverableReader {
  constructor(options:{store:ReadingStore;synth:SpeechSynthesis;Utterance:new(text:string)=>SpeechSynthesisUtterance;owner:string;slot:string;
    changed?:()=>void;progress?:()=>void;sourceFactory?:(document:TextDocument)=>Promise<BlockSource>});
  state:string; error:string; session:ReadingSession | null; source:BlockSource | null;
  metrics:ReadingMetrics;
  restore():Promise<ReadingSession | null>;
  replace(document:TextDocument, options?:{confirmed?:boolean;locale?:string}):Promise<void>;
  restart(confirmed:boolean):Promise<void>;
  resume(voice:SpeechSynthesisVoice,rate:number,remoteAllowed:boolean):Promise<void>;
  pause():void;
  suspend():Promise<void>;
  report(environment?:Record<string,unknown>):Record<string,unknown>;
  record(type:string,detail?:Record<string,unknown>):void;
}
