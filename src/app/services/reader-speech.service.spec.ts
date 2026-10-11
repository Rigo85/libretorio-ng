import {TestBed} from '@angular/core/testing';
import {ReaderSpeechService, SPEECH_PLATFORM} from './reader-speech.service';
import {SessionActivityService} from './session-activity.service';
import {StopPlayingService} from './stop-playing.service';

describe('ReaderSpeechService',()=>{
  let service:ReaderSpeechService, activity:jasmine.Spy, sent:any[], events:Map<string,()=>void>;
  const voice={name:'Local',voiceURI:'local',lang:'es_ES',localService:true} as SpeechSynthesisVoice;
  beforeEach(()=>{
    sent=[]; events=new Map(); activity=jasmine.createSpy();
    class Utterance { constructor(public text:string) {} }
    TestBed.configureTestingModule({providers:[
      {provide:SessionActivityService,useValue:{renew:activity}},
      {provide:SPEECH_PLATFORM,useValue:{utterance:Utterance,synth:{
        getVoices:()=>[voice], addEventListener:(name:string,cb:()=>void)=>events.set(name,cb),
        removeEventListener:(name:string)=>events.delete(name),
        speak:(u:any)=>sent.push(u),cancel:()=>{},pause:()=>{},resume:()=>{}
      }}}
    ]});
    service=TestBed.inject(ReaderSpeechService);
  });
  afterEach(()=>service.ngOnDestroy());
  it('rejects unauthorized remote voices and invalid input without interrupting audio',()=>{
    const stop=spyOn(TestBed.inject(StopPlayingService),'stopPlayingAudio');
    expect(()=>service.start({},'text',{...voice,localService:false},1,false)).toThrow();
    expect(()=>service.start({},'',voice,1,false)).toThrow();
    expect(stop).not.toHaveBeenCalled(); expect(sent.length).toBe(0);
  });
  it('uses the existing session contract only for actual synthesis progress',()=>{
    service.start({},'Selected text',voice,1,false);
    sent[0].onstart(); expect(activity).not.toHaveBeenCalled();
    sent[0].onboundary({charIndex:5}); expect(activity).toHaveBeenCalledOnceWith('audio');
  });
  it('does not renew the session on Android pause, replay requests or canceled callbacks',()=>{
    service.platform!.pauseMode = 'restart-fragment';
    service.start({}, 'Selected text', voice, 1, false); sent[0].onstart();
    service.reader!.pause(); service.reader!.resume();
    sent[0].onend(); sent[0].onerror({error:'interrupted'}); sent[1].onstart();
    expect(activity).not.toHaveBeenCalled();
    sent[1].onend(); expect(activity).toHaveBeenCalledOnceWith('audio');
  });
  it('stops on shared playback cancellation and rejects stale events',()=>{
    service.start({},'Selected text',voice,1,false);
    TestBed.inject(StopPlayingService).stopPlayingAudio();
    sent[0].onstart(); sent[0].onend(); expect(activity).not.toHaveBeenCalled();
    expect(service.owner).toBeUndefined(); expect(service.reader?.state).toBe('idle');
  });
  it('preserves another reader owner and loads asynchronously available voices',()=>{
    const owner={}; service.start(owner,'Selected text',voice,1,false);
    service.stop({}); expect(service.owner).toBe(owner);
    service.voices.set([]); events.get('voiceschanged')!(); expect(service.voices()).toEqual([voice]);
  });
});

describe('Native speech platform pause policy', () => {
  it('uses retained fragments on Android', () => {
    spyOnProperty(navigator, 'userAgent').and.returnValue('Mozilla/5.0 (Linux; Android 10; K) Chrome/154.0.0.0');
    expect(TestBed.inject(SPEECH_PLATFORM)?.pauseMode).toBe('restart-fragment');
  });
  it('preserves native pause outside Android', () => {
    spyOnProperty(navigator, 'userAgent').and.returnValue('Mozilla/5.0 (X11; Linux x86_64) Chrome/154.0.0.0');
    expect(TestBed.inject(SPEECH_PLATFORM)?.pauseMode).toBe('native');
  });
});
