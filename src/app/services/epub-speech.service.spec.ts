import {signal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController,provideHttpClientTesting} from '@angular/common/http/testing';
import {EpubCFI} from 'epubjs';
import {EPUB_SPEECH_STORE,EpubSpeechService} from './epub-speech.service';
import {ReaderSpeechService} from './reader-speech.service';
import {SessionActivityService} from './session-activity.service';
import {StopPlayingService} from './stop-playing.service';
import {openStore,ReadingStore} from '../core/recoverable-speech/store.mjs';
import {EpubSelection,EpubSpeechContext,textAnchoredRange} from '../core/epub-speech-source';

describe('EPUB recoverable speech integration',()=>{
  const voice={voiceURI:'es',name:'Spanish',lang:'es_ES',localService:true} as SpeechSynthesisVoice;
  let service:EpubSpeechService,http:HttpTestingController,store:ReadingStore,name:string;
  let spoken:SpeechSynthesisUtterance[],renew:jasmine.Spy,synth:SpeechSynthesis;
  let context:EpubSpeechContext,selection:EpubSelection;
  const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
  async function takeHead() {
    for(let i=0;i<100;i++) {const requests=http.match(context.path);if(requests.length){expect(requests.length).toBe(1);return requests[0];}await tick();}
    throw new Error('HEAD not requested: '+service.error+' / '+service.reader?.error);
  }
  async function bind(user='user-a') {
    const run=service.bind(context);http.expectOne('/api/me?passive=1').flush({authenticated:true,userId:user});await run;
  }
  async function start(selected:EpubSelection|undefined) {
    const run=service.start(selected,voice,1,false,!!selected);
    http.expectOne('/api/me?passive=1').flush({authenticated:true,userId:'user-a'});
    const head=await takeHead();expect(head.request.method).toBe('HEAD');
    head.flush(null,{headers:{ETag:'"v1"'}});await run;
  }
  beforeEach(async()=>{
    name=`epub-speech-test-${crypto.randomUUID()}`;store=await openStore(name);spoken=[];renew=jasmine.createSpy();
    synth={paused:false,speak:(u:SpeechSynthesisUtterance)=>spoken.push(u),cancel:jasmine.createSpy(),resume:jasmine.createSpy()} as unknown as SpeechSynthesis;
    TestBed.configureTestingModule({providers:[EpubSpeechService,provideHttpClient(),provideHttpClientTesting(),
      {provide:EPUB_SPEECH_STORE,useValue:async()=>store},
      {provide:ReaderSpeechService,useValue:{voices:signal([voice]),platform:{synth,utterance:class {constructor(public text:string){}}}}},
      {provide:SessionActivityService,useValue:{renew}}]});
    service=TestBed.inject(EpubSpeechService);http=TestBed.inject(HttpTestingController);
    const doc=new DOMParser().parseFromString('<html xmlns="http://www.w3.org/1999/xhtml"><head/><body><p>Primera frase. Segunda frase.</p></body></html>','application/xhtml+xml');
    const range=doc.createRange();range.selectNodeContents(doc.getElementsByTagName('p')[0]);
    const cfi=new EpubCFI(textAnchoredRange(range),'/6/2[chapter]').toString();
    context={archiveId:17,path:'/books/test.epub',book:{getRange:async cfi=>new EpubCFI(cfi).toRange(doc),spine:{get:()=>({href:'chapter.xhtml'})}}};
    selection={cfi,sectionHref:'chapter.xhtml',preview:'Primera frase.'};
  });
  afterEach(async()=>{
    service.pause();await tick();TestBed.resetTestingModule();store.db.close();http.verify();
    await new Promise<void>((resolve,reject)=>{const request=indexedDB.deleteDatabase(name);request.onsuccess=()=>resolve();request.onerror=()=>reject(request.error);});
  });
  it('persists before emission, confirms only natural completion and renews only genuine progress',async()=>{
    await bind();await start(selection);
    expect(spoken.length).toBe(1);expect(service.reader!.session!.pending!.text).toBe(spoken[0].text);
    expect(renew).not.toHaveBeenCalled();
    const first=spoken[0];first.onstart!({} as SpeechSynthesisEvent);
    first.onboundary!({charIndex:4} as SpeechSynthesisEvent);
    expect(renew).toHaveBeenCalledOnceWith('audio');
    service.pause();first.onend!({} as SpeechSynthesisEvent);
    expect(service.reader!.session!.cursor).toBe(0);expect(renew).toHaveBeenCalledTimes(1);
    await start(undefined);expect(spoken[1].text).toBe(first.text);
  });
  it('restores on reopening the same book without autoplay and separates authenticated users',async()=>{
    await bind();await start(selection);const pending=service.reader!.session!.pending!.text;
    service.pause();await tick();await bind();
    expect(service.reader!.session!.pending!.text).toBe(pending);expect(spoken.length).toBe(1);
    await bind('user-b');expect(service.reader!.session).toBeNull();expect(spoken.length).toBe(1);
  });
  it('refuses a changed authenticated user before touching the book or synthesizer',async()=>{
    await bind();const run=service.start(selection,voice,1,false);
    http.expectOne('/api/me?passive=1').flush({authenticated:true,userId:'user-b'});await run;
    expect(spoken.length).toBe(0);expect(service.reader).toBeUndefined();expect(service.error).toContain('sesion');
  });
  it('closing or pausing during HEAD prevents late source work and audio',async()=>{
    await bind();const getRange=spyOn(context.book,'getRange').and.callThrough();
    const run=service.start(selection,voice,1,false);
    http.expectOne('/api/me?passive=1').flush({authenticated:true,userId:'user-a'});await tick();
    const head=http.expectOne(context.path);service.clearContext();head.flush(null);await run;
    expect(getRange).not.toHaveBeenCalled();expect(spoken.length).toBe(0);expect(service.context).toBeUndefined();
  });
  it('global stop cancels speech and preserves the unconfirmed sentence',async()=>{
    await bind();await start(selection);TestBed.inject(StopPlayingService).stopPlayingAudio();
    expect(synth.cancel).toHaveBeenCalled();expect(service.reader!.session!.cursor).toBe(0);
    expect(service.reader!.session!.pending).not.toBeNull();
  });
  it('rejects source validator changes while retaining the cursor and pending fragment',async()=>{
    await bind();await start(selection);service.pause();const old=service.reader!.session!.pending!.text;
    const run=service.start(undefined,voice,1,false);
    http.expectOne('/api/me?passive=1').flush({authenticated:true,userId:'user-a'});await tick();
    (await takeHead()).flush(null,{headers:{ETag:'"v2"'}});await run;
    expect(service.reader!.error).toBe('source-changed');expect(spoken.length).toBe(1);
    expect(service.reader!.session!.pending!.text).toBe(old);
  });
  it('keeps HTTP failures diagnosable without exporting the book path or selected text',async()=>{
    await bind();await start(selection);service.pause();
    const run=service.start(undefined,voice,1,false);
    http.expectOne('/api/me?passive=1').flush({authenticated:true,userId:'user-a'});
    (await takeHead()).flush('private response',{status:503,statusText:'Unavailable'});await run;
    const report=JSON.stringify(service.reader!.report());
    expect(service.reader!.error).toBe('http-503');expect(report).not.toContain('/books/');expect(report).not.toContain('Primera frase');
    expect(service.reader!.session!.cursor).toBe(0);
  });
});
