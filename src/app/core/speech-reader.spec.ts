import {fakeAsync, tick} from '@angular/core/testing';
import {prepareSpeechText, SpeechPlatform, SpeechReader, speechChunks} from './speech-reader';

describe('TTS text preparation', () => {
  it('joins layout lines with spaces, preserving words, punctuation and explicit paragraphs', () => {
    expect(prepareSpeechText('  El libro\r\ncontinua aqui.\n\n\tOtro\nparrafo.  '))
      .toBe('El libro continua aqui.\n\nOtro parrafo.');
  });
  it('normalizes tabs, nonbreaking spaces and Unicode line/paragraph separators', () => {
    expect(prepareSpeechText('Uno\u00a0\t dos\u2028tres\u2029Cuatro\fcinco'))
      .toBe('Uno dos tres\n\nCuatro cinco');
  });
  it('removes discretionary hyphens but never guesses whether a printed hyphen belongs to the word', () => {
    expect(prepareSpeechText('extra\u00ad\nordinario y teórico-práctico; 10-20.'))
      .toBe('extraordinario y teórico-práctico; 10-20.');
    expect(prepareSpeechText('teórico-\npráctico')).toBe('teórico- práctico');
  });
  it('is idempotent and handles whitespace-only input', () => {
    const value=prepareSpeechText('uno\n dos\n \n tres');
    expect(prepareSpeechText(value)).toBe(value);
    expect(prepareSpeechText('\n \t\u00ad\n')).toBe('');
  });
});

describe('SpeechReader', () => {
  let reader: SpeechReader, sent: SpeechSynthesisUtterance[], progress: jasmine.Spy;
  let platform: SpeechPlatform;
  const voice = {lang:'es_ES', localService:true} as SpeechSynthesisVoice;
  beforeEach(() => {
    sent = []; progress = jasmine.createSpy();
    class Utterance { constructor(public text: string) {} }
    platform = {utterance:Utterance, synth:{
      speak:(u: SpeechSynthesisUtterance)=>sent.push(u), cancel:()=>{}, pause:()=>{}, resume:()=>{}
    }} as unknown as SpeechPlatform;
    reader = new SpeechReader(platform, ()=>{}, progress);
  });
  afterEach(() => reader.stop());
  const fire = (u: SpeechSynthesisUtterance, type: string, data = {}) => (u as any)['on'+type]?.(data);
  it('feeds normalized text to the native engine, not layout newlines', () => {
    const selected='La primera\nlinea termina.\n\nOtra\nfrase.';
    reader.start(selected,voice,1);
    expect(sent[0].text).toBe('La primera linea termina.\n\nOtra frase.');
    expect(selected).toContain('primera\nlinea');
  });
  it('bounds chunks without splitting surrogate pairs and rejects invalid limits', () => {
    expect(() => speechChunks('text',0)).toThrow();
    expect(speechChunks('ab😀cd',3)).toEqual(['ab','😀c','d']);
    expect(speechChunks('word '.repeat(500)).every(part => part.length <= 320)).toBeTrue();
  });
  it('renews only on forward progress, never start/duplicate/zero boundaries', () => {
    reader.start('Un texto seleccionado.',voice,1); const u = sent[0];
    fire(u,'boundary',{charIndex:5}); fire(u,'start'); fire(u,'boundary',{charIndex:0});
    expect(progress).not.toHaveBeenCalled();
    fire(u,'boundary',{charIndex:5}); fire(u,'boundary',{charIndex:5});
    expect(progress).toHaveBeenCalledTimes(1);
    fire(u,'end'); expect(progress).toHaveBeenCalledTimes(2); expect(reader.state).toBe('done');
  });
  it('does not skip errors or renew on completion without a start', () => {
    reader.start('words '.repeat(200),voice,1); fire(sent[0],'end');
    expect(reader.error).toBe('end-without-start'); expect(sent.length).toBe(1);
    expect(progress).not.toHaveBeenCalled();
  });
  it('queues one fragment and ignores callbacks after cancellation', () => {
    reader.start('words '.repeat(200),voice,1); const first = sent[0];
    expect(sent.length).toBe(1); fire(first,'start'); fire(first,'end'); expect(sent.length).toBe(2);
    reader.stop(); progress.calls.reset(); fire(sent[1],'start'); fire(sent[1],'end');
    expect(sent.length).toBe(2); expect(progress).not.toHaveBeenCalled();
  });
  it('distinguishes a pause request from confirmation and never advances while paused', () => {
    reader.start('words '.repeat(200),voice,1); const u = sent[0]; fire(u,'start'); reader.pause();
    expect(reader.state).toBe('speaking'); expect(reader.pauseRequested).toBeTrue();
    fire(u,'boundary',{charIndex:10}); fire(u,'pause'); expect(reader.state).toBe('paused');
    fire(u,'end'); expect(sent.length).toBe(1); expect(progress).not.toHaveBeenCalled();
    reader.resume(); expect(sent.length).toBe(2);
  });
  it('stops stalled engines without fake progress', fakeAsync(() => {
    reader.start('text',voice,1); tick(15000); expect(reader.error).toBe('timeout');
    expect(progress).not.toHaveBeenCalled();
  }));
  it('keeps desktop native pause/resume without replaying the fragment', () => {
    const pause = spyOn(platform.synth, 'pause'), resume = spyOn(platform.synth, 'resume');
    reader.start('Native desktop speech.', voice, 1); const u = sent[0]; fire(u, 'start');
    reader.pause(); fire(u, 'pause'); reader.resume(); fire(u, 'resume');
    expect(pause).toHaveBeenCalledTimes(1); expect(resume).toHaveBeenCalledTimes(1);
    expect(sent.length).toBe(1); expect(reader.state).toBe('speaking');
    expect(progress).not.toHaveBeenCalled();
  });
  it('restarts the retained Android fragment even when native resume does nothing', () => {
    platform.pauseMode = 'restart-fragment';
    const pause = spyOn(platform.synth, 'pause'), cancel = spyOn(platform.synth, 'cancel');
    reader.start('Una seleccion para escuchar.', voice, 1.25); const first = sent[0]; fire(first, 'start');
    reader.pause(); expect(reader.state).toBe('paused'); expect(cancel).toHaveBeenCalledTimes(1);
    expect(pause).not.toHaveBeenCalled(); reader.resume();
    expect(sent.length).toBe(2); expect(sent[1]).not.toBe(first); expect(sent[1].text).toBe(first.text);
    expect(sent[1].voice).toBe(voice); expect(sent[1].rate).toBe(1.25); expect(sent[1].lang).toBe('es-ES');
    expect(reader.state).toBe('starting'); expect(progress).not.toHaveBeenCalled();
    fire(sent[1], 'start'); fire(sent[1], 'end');
    expect(reader.state).toBe('done'); expect(progress).toHaveBeenCalledTimes(1);
  });
  it('rejects synchronous cancellation and all late events from the paused utterance', () => {
    platform.pauseMode = 'restart-fragment';
    reader.start('words '.repeat(200), voice, 1); const first = sent[0]; fire(first, 'start');
    spyOn(platform.synth, 'cancel').and.callFake(() => {
      fire(first, 'error', {error:'interrupted'}); fire(first, 'end');
    });
    reader.pause(); expect(reader.state).toBe('paused'); expect(reader.index).toBe(0);
    reader.resume();
    for (const event of ['start', 'pause', 'resume', 'boundary', 'end', 'error'])
      fire(first, event, {charIndex:10, error:'canceled'});
    expect(reader.state).toBe('starting'); expect(reader.error).toBe(''); expect(reader.index).toBe(0);
    expect(sent.length).toBe(2); expect(progress).not.toHaveBeenCalled();
  });
  it('keeps a paused fragment beyond the watchdog deadline, then requires a new start', fakeAsync(() => {
    platform.pauseMode = 'restart-fragment';
    reader.start('Selected text.', voice, 1); fire(sent[0], 'start'); reader.pause();
    tick(180000); expect(reader.state).toBe('paused'); expect(reader.error).toBe('');
    reader.resume(); tick(15000); expect(reader.error).toBe('timeout');
    expect(progress).not.toHaveBeenCalled();
  }));
  it('handles repeated Android pauses without skipping a fragment or duplicating requests', () => {
    platform.pauseMode = 'restart-fragment';
    reader.start('words '.repeat(200), voice, 1); fire(sent[0], 'start'); fire(sent[0], 'end');
    progress.calls.reset(); const text = sent[1].text;
    for (let i = 0; i < 3; i++) {
      fire(sent.at(-1)!, 'start'); reader.pause(); reader.pause(); reader.resume(); reader.resume();
      expect(reader.index).toBe(1); expect(sent.at(-1)!.text).toBe(text);
    }
    expect(sent.length).toBe(5); expect(progress).not.toHaveBeenCalled();
  });
  it('cannot resume retained text after stop, and isolates a new selection', () => {
    platform.pauseMode = 'restart-fragment';
    reader.start('Previous selection.', voice, 1); const first = sent[0]; reader.pause();
    reader.stop(); reader.resume(); expect(sent.length).toBe(1); expect(reader.state).toBe('idle');
    reader.start('New selection.', voice, 1); fire(first, 'end'); fire(first, 'error', {error:'interrupted'});
    expect(sent[1].text).toBe('New selection.'); expect(reader.state).toBe('starting');
    expect(reader.error).toBe(''); expect(progress).not.toHaveBeenCalled();
  });
});
