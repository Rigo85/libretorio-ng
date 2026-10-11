export const WINDOW:number;
export function searchFold(text:string):string;
export function findWindow(text:string,query:string,start?:number,limit?:number):{hits:{start:number;end:number;excerpt:string}[];next:number;done:boolean;examined:number};
