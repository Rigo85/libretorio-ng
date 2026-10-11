import {ComponentFixture, TestBed} from '@angular/core/testing';
import {ReaderSpeechComponent} from './reader-speech.component';
import {ReaderSpeechService, SPEECH_PLATFORM} from '../../services/reader-speech.service';
import {SessionActivityService} from '../../services/session-activity.service';

describe('Reader speech controls', () => {
  let fixture: ComponentFixture<ReaderSpeechComponent>, c: ReaderSpeechComponent, service: ReaderSpeechService;
  const voice = (name:string,lang:string,localService=true) => ({name,lang,localService,voiceURI:name,default:false} as SpeechSynthesisVoice);
  beforeEach(async () => {
    spyOn(Storage.prototype,'getItem').and.returnValue(null);
    spyOn(Storage.prototype,'setItem');
    await TestBed.configureTestingModule({imports:[ReaderSpeechComponent],providers:[
      {provide:SPEECH_PLATFORM,useValue:{synth:{getVoices:()=>[],addEventListener:()=>{},removeEventListener:()=>{}}}},
      {provide:SessionActivityService,useValue:{renew:jasmine.createSpy()}}
    ]}).compileComponents();
    fixture = TestBed.createComponent(ReaderSpeechComponent); c=fixture.componentInstance;
    service=TestBed.inject(ReaderSpeechService);
    service.voices.set([voice('Maria','es_ES'),voice('Ana','es-US'),voice('English','en-US'),voice('Remota','es-ES',false)]);
    fixture.detectChanges();
  });
  afterEach(()=>fixture.destroy());
  it('identifies TTS with the installed speaking-person icon, not messaging or volume',()=>{
    const button=fixture.nativeElement.querySelector('button[aria-haspopup="dialog"]');
    expect(button.title).toBe('Lectura en voz alta (TTS)');
    expect(button.querySelector('.tts-symbol').textContent).toBe('\ue91f');
    expect(button.querySelector('.tts-symbol').classList.contains('material-icons')).toBeTrue();
    expect(button.querySelector('.bi-chat-square-text')).toBeNull();
    expect(button.querySelector('.bi-volume-up')).toBeNull();
  });
  it('groups language variants, hides remote voices and filters by name ignoring accents',()=>{
    c.languageId='es'; expect(c.voices.length).toBe(2);
    c.voiceQuery='maría'; expect(c.filteredVoices.map(v=>v.name)).toEqual(['Maria']);
    c.voiceQuery='es-US'; expect(c.filteredVoices.map(v=>v.name)).toEqual(['Ana']);
    c.voiceQuery='missing'; expect(c.filteredVoices).toEqual([]);
    c.voiceQuery=''; c.remoteAllowed=true; expect(c.voices.length).toBe(3);
  });
  it('does not silently switch language when no voice exists for the explicit choice',()=>{
    c.languageId='fr'; expect(c.voice).toBeUndefined();
    service.voices.set([voice('French','fr-FR')]); expect(c.voice).toBeUndefined();
    c.voiceId=c.key(service.voices()[0]); expect(c.voice?.name).toBe('French');
  });
  it('never uses the browser language or an arbitrary voice without explicit selection',()=>{
    spyOnProperty(navigator,'language','get').and.returnValue('en-US');
    expect(c.language).toBe(''); expect(c.voice).toBeUndefined();
    c.languageId='es'; expect(c.voice).toBeUndefined();
    c.voiceId=c.key(c.voices[0]); expect(c.voice?.lang).toMatch(/^es/);
    service.voices.set([voice('Different','es-ES')]); expect(c.voice).toBeUndefined();
  });
  it('remembers language/voice/speed without text or remote permission',()=>{
    c.text='Private selection'; c.remoteAllowed=true;
    c.changeLanguage({target:{value:'es'}} as any);
    const value=JSON.parse((Storage.prototype.setItem as jasmine.Spy).calls.mostRecent().args[1]);
    expect(value).toEqual({languageId:'es',voiceId:'',rate:1});
  });
  it('snapshots pointer selection before focus clears it, clears it on document change',()=>{
    c.text='Selected text'; c.capture(); c.text=''; c.open();
    expect(c.snapshot).toBe('Selected text'); expect(c.panel?.nativeElement.open).toBeTrue();
    fixture.componentRef.setInput('source','next-document'); fixture.detectChanges();
    expect(c.snapshot).toBe(''); expect(c.panel?.nativeElement.open).toBeFalse();
  });
  it('does not stop speech when only the options close',()=>{
    const stop=spyOn(service,'stop'); c.open(); c.closePanel(); expect(stop).not.toHaveBeenCalled();
  });
  it('resumes Android speech from the outside control after closing the options',()=>{
    const sent:any[]=[];
    class Utterance { constructor(public text:string) {} }
    Object.assign(service.platform!, {pauseMode:'restart-fragment', utterance:Utterance});
    Object.assign(service.platform!.synth, {speak:(u:any)=>sent.push(u), cancel:()=>{}, resume:()=>{}});
    c.languageId='es'; c.voiceId=c.key(c.voices[0]); c.text='Texto seleccionado para leer.';
    c.open(); c.start(); sent[0].onstart(); c.closePanel(); fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.voice-launcher[aria-label="Pausar voz"]')!.click(); fixture.detectChanges();
    expect(c.status).toBe('En pausa');
    root.querySelector<HTMLButtonElement>('.voice-launcher[aria-label="Reanudar voz"]')!.click(); fixture.detectChanges();
    expect(sent.length).toBe(2); expect(sent[1].text).toBe(sent[0].text);
    expect(c.status).toBe('Iniciando voz...'); expect(c.panel!.nativeElement.open).toBeFalse();
    sent[0].onerror({error:'interrupted'}); sent[1].onstart(); fixture.detectChanges();
    expect(c.status).toContain('Leyendo fragmento');
    expect(TestBed.inject(SessionActivityService).renew).not.toHaveBeenCalled();
  });
  it('prepares only the speech snapshot, leaving the selected input intact',()=>{
    c.text='Una\nfrase.\n\nOtra.'; c.capture(); c.open();
    expect(c.snapshot).toBe('Una frase.\n\nOtra.');
    expect(c.text).toBe('Una\nfrase.\n\nOtra.');
  });
  it('renders only the chosen language and matching voices, and keeps transport above settings',()=>{
    fixture.componentRef.setInput('text','Texto seleccionado'); fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.voice-launcher')!.click(); fixture.detectChanges();
    const language=root.querySelector<HTMLSelectElement>('select[aria-label="Idioma de voz"]')!;
    language.value='es'; language.dispatchEvent(new Event('change')); fixture.detectChanges();
    const search=root.querySelector<HTMLInputElement>('input[type=search]')!;
    search.value='Ana'; search.dispatchEvent(new Event('input')); fixture.detectChanges();
    const select=root.querySelector<HTMLSelectElement>('select[aria-label="Voz"]')!;
    expect(c.filteredVoices.map(v=>v.name)).toEqual(['Ana']);
    expect(select.options.length).toBe(2); expect(select.options[1].text).toContain('Ana');
    expect(select.value).toBe('');
    select.value=c.key(c.filteredVoices[0]); select.dispatchEvent(new Event('change')); fixture.detectChanges();
    expect(c.voice?.name).toBe('Ana');
    expect(root.querySelector<HTMLDetailsElement>('.settings')!.open).toBeTrue();
    expect(root.querySelector<HTMLButtonElement>('button[aria-label="Leer seleccion"]')!.disabled).toBeFalse();
    const transport=root.querySelector('.transport')!, settings=root.querySelector('.settings')!;
    expect(transport.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const panel=c.panel!.nativeElement;
    expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth);
    for (const button of [...panel.querySelectorAll('button')]) {
      if (button.getBoundingClientRect().width) expect(button.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
    }
  });
  for (const [width,height] of [[320,640],[390,844],[1440,900]]) {
    it(`fits controls and long voice names in a ${width}x${height} viewport`,()=>{
      const frame=document.createElement('iframe');
      frame.style.cssText=`width:${width}px;height:${height}px;border:0`;
      document.body.appendChild(frame);
      const doc=frame.contentDocument!;
      for (const style of [...document.querySelectorAll('style')]) doc.head.appendChild(style.cloneNode(true));
      doc.body.appendChild(fixture.nativeElement);
      try {
        service.voices.set([voice('Una voz con nombre muy largo para comprobar que no desborda el panel','es_ES')]);
        fixture.componentRef.setInput('text','Texto de prueba'); fixture.detectChanges();
        const root=fixture.nativeElement as HTMLElement;
        root.querySelector<HTMLButtonElement>('.voice-launcher')!.click(); fixture.detectChanges();
        const language=root.querySelector<HTMLSelectElement>('select[aria-label="Idioma de voz"]')!;
        language.value='es'; language.dispatchEvent(new Event('change')); fixture.detectChanges();
        const panel=c.panel!.nativeElement, rect=panel.getBoundingClientRect();
        expect(rect.left).toBeGreaterThanOrEqual(0); expect(rect.right).toBeLessThanOrEqual(width);
        expect(rect.bottom).toBeLessThanOrEqual(height); expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth);
        for(const control of [...panel.querySelectorAll('select,input[type=search]')]) {
          expect(control.getBoundingClientRect().width).toBeLessThanOrEqual(rect.width);
          expect(control.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
        }
        const body=panel.querySelector<HTMLElement>('.body')!;
        const transport=panel.querySelector<HTMLElement>('.transport')!;
        const before=transport.getBoundingClientRect().top;
        body.scrollTop=body.scrollHeight;
        expect(transport.getBoundingClientRect().top).toBe(before);
        expect(body.getBoundingClientRect().top).toBeGreaterThanOrEqual(transport.getBoundingClientRect().bottom);
        expect(panel.querySelector('select[aria-label="Velocidad de voz"]')!.closest('.transport')).toBe(transport);
      } finally { c.closePanel(); document.body.appendChild(fixture.nativeElement); frame.remove(); }
    });
  }
});
