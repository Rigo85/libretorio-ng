export const BLOCK_SIZE: number;
export const ALGORITHM: string;
export interface TextDocument {id:string; revision:string; title:string; length:number; algorithm:string; kind?:string; [key:string]:unknown;}
export interface Fragment {start:number; end:number; text:string; attempts?:number;}
export function normalizeText(text:string):string;
export class BlockSource {
  constructor(document:TextDocument, getBlock:(id:string,index:number)=>Promise<string | undefined>);
  document:TextDocument;
  cache:Map<number,string>;
  reads:number;
  peakCharacters:number;
  read(start:number,end:number):Promise<string>;
  clear():void;
}
