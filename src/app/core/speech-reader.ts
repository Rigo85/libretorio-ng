// Keep explicit paragraph boundaries, not the visual line wrapping of the reader.
export function prepareSpeechText(text: string): string {
  return text.replace(/\r\n?|\u2028|\f/g, '\n').replace(/\u2029/g, '\n\n')
    .replace(/(\p{L})\u00ad[ \t]*\n[ \t]*(?=\p{L})/gu, '$1')
    .replace(/\u00ad/g, '')
    .replace(/[^\S\n]+/g, ' ').replace(/ *\n */g, '\n')
    .split(/\n{2,}/).map(paragraph => paragraph.replace(/\n/g, ' ').trim())
    .filter(Boolean).join('\n\n');
}

// Adapted from the tested local-speech trial: one native utterance in flight.
export function speechChunks(text: string, limit = 320): string[] {
  if (!Number.isInteger(limit) || limit < 2) throw new Error('Invalid speech fragment limit');
  let remaining = text.trim();
  const result: string[] = [];
  while (remaining) {
    let end = Math.min(limit, remaining.length);
    if (end < remaining.length) {
      const part = remaining.slice(0, end);
      const sentence = [...part.matchAll(/[.!?;\n](?:\s|$)/g)].at(-1);
      const space = part.lastIndexOf(' ');
      if (sentence && sentence.index! > limit / 3) end = sentence.index! + 1;
      else if (space > 0) end = space;
      else if (/[\uD800-\uDBFF]/.test(remaining[end - 1])) end--;
    }
    result.push(remaining.slice(0, end).trim()); remaining = remaining.slice(end).trimStart();
  }
  return result;
}

export type SpeechPlatform = {synth: SpeechSynthesis; utterance: new(text: string) => SpeechSynthesisUtterance;
  pauseMode?: 'native' | 'restart-fragment'};
export class SpeechReader {
  state: 'idle' | 'starting' | 'speaking' | 'paused' | 'done' | 'error' = 'idle';
  error = '';
  pauseRequested = false;
  index = 0;
  count = 0;
  events: {at: string; type: string; index: number; charIndex?: number; code?: string}[] = [];
  private parts: string[] = [];
  private generation = 0;
  private current?: SpeechSynthesisUtterance;
  private timer?: ReturnType<typeof setTimeout>;
  private voice?: SpeechSynthesisVoice;
  private rate = 1;

  constructor(private platform: SpeechPlatform, private update: () => void, private progress: () => void) {}

  record(type: string, extra: {charIndex?: number; code?: string} = {}): void {
    this.events.push({at: new Date().toISOString(), type, index: this.index, ...extra});
    if (this.events.length > 200) this.events.shift();
    this.update();
  }

  start(text: string, voice: SpeechSynthesisVoice, rate: number): void {
    if (!text.trim() || text.length > 60_000 || !voice || !Number.isFinite(rate) || rate < .5 || rate > 2)
      throw new Error('Seleccion o voz no valida. Maximo 60000 caracteres.');
    const prepared = prepareSpeechText(text);
    if (!prepared || prepared.length > 60_000) throw new Error('No hay texto valido para leer.');
    this.stop(); this.error = ''; this.parts = speechChunks(prepared); this.count = this.parts.length;
    this.voice = voice; this.rate = rate; this.index = 0; this.record('request-start'); this.speakCurrent();
  }

  private watch(ms: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.fail('timeout'), ms);
  }

  private speakCurrent(): void {
    const generation = this.generation;
    let utterance: SpeechSynthesisUtterance;
    try { utterance = new this.platform.utterance(this.parts[this.index]); }
    catch { this.fail('engine-error'); return; }
    let started = false, offset = -1;
    this.current = utterance; this.state = 'starting';
    utterance.voice = this.voice!; utterance.lang = this.voice!.lang.replace('_', '-'); utterance.rate = this.rate;
    const active = () => generation === this.generation && this.current === utterance;
    utterance.onstart = () => {
      if (!active()) return;
      started = true; this.state = 'speaking'; this.watch(120_000); this.record('start');
    };
    utterance.onboundary = event => {
      if (!active() || !started || this.pauseRequested || this.state !== 'speaking' ||
          !Number.isInteger(event.charIndex) || event.charIndex <= offset || event.charIndex >= utterance.text.length) return;
      offset = event.charIndex; this.watch(120_000);
      // An initial boundary at zero is not evidence of forward progress.
      if (offset > 0) this.progress();
      this.record('boundary', {charIndex: offset});
    };
    utterance.onpause = () => {
      if (!active()) return;
      this.pauseRequested = true; this.state = 'paused'; clearTimeout(this.timer); this.record('pause');
    };
    utterance.onresume = () => {
      if (!active()) return;
      this.state = 'speaking'; this.watch(120_000); this.record('resume');
    };
    utterance.onend = () => {
      if (!active()) return;
      if (!started) { this.fail('end-without-start'); return; }
      clearTimeout(this.timer);
      if (!this.pauseRequested) this.progress();
      this.current = undefined; this.index++; this.record('end');
      if (this.index === this.count) { this.parts = []; this.state = 'done'; this.pauseRequested = false; this.update(); }
      else if (this.pauseRequested) { this.state = 'paused'; this.update(); }
      else this.speakCurrent();
    };
    utterance.onerror = event => { if (active()) this.fail(event.error); };
    this.watch(15_000); this.update();
    try { this.platform.synth.speak(utterance); } catch { this.fail('engine-error'); }
  }

  private fail(code: string): void {
    this.stop(); this.state = 'error'; this.error = code; this.record('error', {code});
  }
  pause(): void {
    if (!this.current || this.pauseRequested) return;
    this.pauseRequested = true;
    if (this.platform.pauseMode === 'restart-fragment') {
      // Android stops speech on pause and cannot resume it. Retain the fragment,
      // but invalidate native callbacks before cancellation (including synchronous ones).
      this.generation++; this.current = undefined; clearTimeout(this.timer);
      this.state = 'paused';
      try {
        this.platform.synth.cancel();
        this.record('request-pause'); this.record('paused-fragment-retained');
      } catch { this.fail('engine-error'); }
      return;
    }
    try { this.platform.synth.pause(); this.record('request-pause'); } catch { this.fail('engine-error'); }
  }
  resume(): void {
    if (!this.pauseRequested) return;
    if (this.platform.pauseMode === 'restart-fragment') {
      this.pauseRequested = false;
      try {
        if (this.platform.synth.paused) this.platform.synth.resume();
        this.record('request-resume');
        if (this.index < this.count) { this.record('restart-fragment'); this.speakCurrent(); }
      } catch { this.fail('engine-error'); }
      return;
    }
    this.pauseRequested = false; this.watch(120_000);
    try { this.platform.synth.resume(); this.record('request-resume'); } catch { this.fail('engine-error'); return; }
    if (!this.current && this.index < this.count) this.speakCurrent();
  }
  stop(): void {
    this.generation++; clearTimeout(this.timer);
    const owned = !!this.current;
    this.current = undefined; this.parts = []; this.pauseRequested = false;
    if (owned) {
      try {
        this.platform.synth.cancel();
        if (this.platform.synth.paused) this.platform.synth.resume();
      } catch { /* The generation guard still rejects late native callbacks. */ }
    }
    this.state = 'idle'; this.record('stop');
  }
}
