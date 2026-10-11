import {ParamMap} from '@angular/router';

export type ActivityView = 'original' | 'pdf-preparado';
export interface ActivityTarget {id: number; view?: ActivityView;}

export interface ActivityPage {mode:'recent'|'continue';kind:string;before?:string;after?:string;explicit?:boolean;}
export const firstActivityPage:ActivityPage={mode:'recent',kind:''};
export function activityPage(params:ParamMap,fallback:ActivityPage=firstActivityPage):ActivityPage {
  const keys=['mode','kind','before','after'];
  if(!keys.some(key=>params.has(key)))return {...fallback,before:undefined,after:undefined};
  if(keys.some(key=>params.getAll(key).length>1))throw new Error('INVALID_HISTORY_PAGE');
  const mode=params.get('mode')??'recent',kind=params.get('kind')??'';
  const before=params.get('before')??undefined,after=params.get('after')??undefined;
  if(!['recent','continue'].includes(mode)||!['','FILE','EPUB','AUDIOBOOK','COMIC-MANGA','NONE'].includes(kind)||
    (before!==undefined&&after!==undefined)||[before,after].some(value=>value!==undefined&&(!/^[A-Za-z0-9_-]+$/.test(value)||value.length>512)))throw new Error('INVALID_HISTORY_PAGE');
  return {mode:mode as ActivityPage['mode'],kind,before,after,explicit:true};
}
export function activityPageQuery(page:ActivityPage):Record<string,string> {
  if(!page.explicit&&page.mode==='recent'&&!page.kind&&!page.before&&!page.after)return {};
  return {mode:page.mode,...(page.kind?{kind:page.kind}:{}),...(page.before?{before:page.before}:{}),...(page.after?{after:page.after}:{})};
}

export function activityTarget(params: ParamMap): ActivityTarget | undefined {
  const id = params.get('archivo'), view = params.get('vista');
  if (id === null && view === null) return undefined;
  if (params.getAll('archivo').length !== 1 || !id || !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)) ||
    params.getAll('vista').length > 1 || (view !== null && view !== 'original' && view !== 'pdf-preparado')) {
    throw new Error('INVALID_ACTIVITY_LINK');
  }
  return {id: Number(id), ...(view ? {view} : {})} as ActivityTarget;
}
