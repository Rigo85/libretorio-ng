export interface DiagnosticStore {
  save(id:string,report:Record<string,unknown>):Promise<unknown>;
  previous(id:string):Promise<unknown[]>;
  close():void;
}
export function openDiagnostics(name?:string):Promise<DiagnosticStore>;
export class ReadingMetrics {
  measure<T>(name:string,operation:()=>Promise<T>):Promise<T>;
  sample(value:{visible:boolean;state:string;cursor:number;heapBytes?:number}):void;
}
