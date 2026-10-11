import {signal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController,provideHttpClientTesting} from '@angular/common/http/testing';
import {RECOVERABLE_SPEECH_STORE,RecoverableSpeechService} from './recoverable-speech.service';
import {ReaderSpeechService} from './reader-speech.service';
import {SessionActivityService} from './session-activity.service';
import {openStore,ReadingStore} from '../core/recoverable-speech/store.mjs';
import {PdfSpeechContext,PdfSpeechSelection} from '../core/pdf-speech-source';
import {EpubSpeechContext} from '../core/epub-speech-source';

describe('PDF recoverable speech integration',()=>{
  const voice={voiceURI:'es',name:'Spanish',lang:'es_ES',localService:true} as SpeechSynthesisVoice;
  const text='Primera frase. Segunda frase.\n';
  let service:RecoverableSpeechService,http:HttpTestingController,store:ReadingStore,name:string;
  let spoken:SpeechSynthesisUtterance[],context:PdfSpeechContext,selection:PdfSpeechSelection;
  let read:jasmine.Spy,open:jasmine.Spy;
  const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
  async function bind(value:PdfSpeechContext|EpubSpeechContext=context) {
    const run=service.bind(value);http.expectOne('/api/me?passive=1').flush({authenticated:true,userId:'user-a'});await run;
  }
  async function head() {
    for(let i=0;i<100;i++) {const requests=http.match(context.path);if(requests.length){requests[0].flush(null,{headers:{ETag:'"v1"'}});return;}await tick();}
    throw new Error('HEAD not requested');
  }
  async function start(selected:PdfSpeechSelection|undefined) {
    const run=service.start(selected,voice,1,false,!!selected);
    http.expectOne('/api/me?passive=1').flush({authenticated:true,userId:'user-a'});await head();await run;
  }
  beforeEach(async()=>{
    name=`pdf-speech-test-${crypto.randomUUID()}`;store=await openStore(name);spoken=[];
    open=jasmine.createSpy().and.callFake(async()=>store);
    const synth={paused:false,speak:(u:SpeechSynthesisUtterance)=>spoken.push(u),cancel:()=>{},resume:()=>{}};
    TestBed.configureTestingModule({providers:[RecoverableSpeechService,provideHttpClient(),provideHttpClientTesting(),
      {provide:RECOVERABLE_SPEECH_STORE,useValue:open},
      {provide:ReaderSpeechService,useValue:{voices:signal([voice]),platform:{synth,utterance:class {constructor(public text:string){}}}}},
      {provide:SessionActivityService,useValue:{renew:()=>{}}}]});
    service=TestBed.inject(RecoverableSpeechService);http=TestBed.inject(HttpTestingController);
    read=jasmine.createSpy().and.callFake(async(_page,_layout,start,end)=>text.slice(start,end));
    context={format:'pdf',archiveId:21,path:'/books/test.pdf',pages:1000,readText:read};
    selection={format:'pdf',pages:[{page:700,start:0,end:text.length,length:text.length,revision:'a'.repeat(64)}],
      layout:{reading:true,layoutWidth:390,fontSize:18,fontFamily:'serif',pageMargin:6,lineHeight:1.5},preview:'Primera frase.'};
  });
  afterEach(async()=>{
    service.pause();await tick();TestBed.resetTestingModule();store.db.close();http.verify();
    await new Promise<void>((resolve,reject)=>{const request=indexedDB.deleteDatabase(name);request.onsuccess=()=>resolve();request.onerror=()=>reject(request.error);});
  });
  it('stores a descriptor, reads only selected pages and replays the pending phrase after reopening',async()=>{
    await bind();await start(selection);expect(open).toHaveBeenCalledOnceWith('pdf');
    const first=spoken[0].text;expect(first).toBe('Primera frase.');
    expect(JSON.stringify(service.saved)).not.toContain(text);
    expect(read.calls.allArgs().every(args=>args[0].page===700 && args[3]-args[2]<=8192)).toBeTrue();
    service.pause();await tick();await bind();expect(spoken.length).toBe(1);
    await start(undefined);expect(spoken[1].text).toBe(first);
    expect(service.reader!.session!.cursor).toBe(0);
  });
  it('validates the saved pending phrase even without requesting a new text block',async()=>{
    await bind();await start(selection);service.pause();await tick();
    const pending=service.reader!.session!.pending!.text;read.calls.reset();read.and.rejectWith(new Error('source-changed'));
    await start(undefined);
    expect(read).toHaveBeenCalled();expect(read.calls.first().args[2]).toBe(read.calls.first().args[3]);
    expect(service.reader!.error).toBe('source-changed');expect(spoken.length).toBe(1);
    expect(service.reader!.session!.pending!.text).toBe(pending);expect(service.reader!.session!.cursor).toBe(0);
  });
  it('does not emit or replace the checkpoint when closed during worker validation',async()=>{
    await bind();let finish!:(text:string)=>void;
    read.and.callFake(()=>new Promise<string>(resolve=>finish=resolve));
    const run=service.start(selection,voice,1,false);
    http.expectOne('/api/me?passive=1').flush({authenticated:true,userId:'user-a'});await head();
    for(let i=0;i<100&&!finish;i++)await tick();
    expect(finish).toBeDefined();service.clearContext();finish('');await run;
    expect(spoken.length).toBe(0);expect(service.saved).toBeUndefined();
  });
  it('does not open storage after closing during authentication',async()=>{
    const run=service.bind(context);service.clearContext();
    http.expectOne('/api/me?passive=1').flush({authenticated:true,userId:'user-a'});await run;
    expect(open).not.toHaveBeenCalled();expect(service.reader).toBeUndefined();
  });
  it('opens the EPUB namespace when the same controller changes format',async()=>{
    await bind();open.and.callFake(async()=>{store=await openStore(name);return store;});
    await bind({archiveId:22,path:'/books/test.epub',book:{} as EpubSpeechContext['book']});
    expect(open.calls.allArgs()).toEqual([['pdf'],['epub']]);
    expect(service.format).toBe('epub');expect(service.reader!.session).toBeNull();
  });
});
