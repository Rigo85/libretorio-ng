import {ALGORITHM, BlockSource, SentencePlanner} from './source.mjs';
import {ReadingMetrics} from './diagnostics.mjs';

const RECOVERABLE = new Set(['network', 'audio-busy', 'synthesis-failed']);
export const voiceKey = voice => JSON.stringify([voice.voiceURI, voice.name, voice.lang, voice.localService]);

export class RecoverableReader {
  constructor({store, synth, Utterance, owner, slot = 'lab-local', changed = () => {},
    timers = globalThis, retryDelay = 700, startTimeout = 15000, speechTimeout = 120000,
    sourceFactory, progress = () => {}}) {
    Object.assign(this, {store, synth, Utterance, owner, slot, changed, timers, retryDelay, startTimeout, speechTimeout, sourceFactory, progress});
    this.state = 'idle'; this.error = ''; this.epoch = 0; this.session = null;
    this.events = []; this.droppedEvents = 0; this.queue = Promise.resolve();
    this.active = null; this.source = null; this.held = false; this.leaseEpoch = 0;
    this.metrics = new ReadingMetrics();
  }
  record(type, detail = {}) {
    this.metrics.event(type); this.metrics.buffers(this.source,this.planner);
    this.events.push({at:new Date().toISOString(), type, cursor:this.session?.cursor ?? 0, ...detail});
    if (this.events.length > 200) { this.events.shift(); this.droppedEvents++; }
    this.changed();
  }
  serial(action) {
    const result = this.queue.then(action);
    this.queue = result.catch(() => {});
    return result;
  }
  async restore() {
    this.session = await this.store.load(this.slot) ?? null;
    this.validate();
    this.state = this.session ? this.session.cursor === this.session.end ? 'done' : 'paused' : 'idle';
    this.record('restore');
    return this.session;
  }
  validate() {
    const s = this.session;
    if (!s) return;
    if (s.schema !== 1 || s.algorithm !== ALGORITHM) throw new Error('descriptor-version');
    if (![s.start,s.cursor,s.end].every(Number.isSafeInteger) || s.start < 0 || s.cursor < s.start || s.cursor > s.end ||
      (s.pending && (s.pending.start !== s.cursor || !Number.isSafeInteger(s.pending.end) || s.pending.end <= s.cursor ||
        s.pending.end > s.end || typeof s.pending.text !== 'string' || s.pending.text.length > 480))) throw new Error('descriptor-invalid');
  }
  async acquire() {
    const leaseToken = ++this.leaseEpoch;
    this.timers.clearInterval(this.heartbeat); this.heartbeat = undefined;
    await this.store.claim(this.slot, this.owner);
    if (leaseToken !== this.leaseEpoch) {
      this.store.retire?.(this.slot, this.owner);
      await this.store.release(this.slot, this.owner);
      return false;
    }
    this.held = true;
    this.heartbeat = this.timers.setInterval(() => {
      this.metrics.measure('lease-renew',()=>this.store.renew(this.slot, this.owner)).catch(error => { if (leaseToken === this.leaseEpoch) this.fail(error.message); });
    }, 4000);
    return true;
  }
  async persist(value) {
    this.session = await this.metrics.measure('checkpoint',()=>this.store.save(this.slot, this.owner, this.session?.revision ?? 0, value));
    this.record('checkpoint');
  }
  replace(document, {confirmed = false, start = 0, end = document.length, locale = 'es'} = {}) {
    if (this.session && !confirmed) return Promise.reject(new Error('confirmation-required'));
    this.pause();
    const token = this.epoch;
    return this.serial(async () => {
      if (token !== this.epoch) return;
      if (!await this.acquire()) return;
      if (token !== this.epoch) return;
      this.session = await this.store.load(this.slot) ?? null;
      if (token !== this.epoch) return;
      if (this.session && !confirmed) throw new Error('confirmation-required');
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > document.length) throw new Error('source-range');
      await this.persist({schema:1, algorithm:ALGORITHM, documentId:document.id, documentRevision:document.revision,
        title:document.title, start, end, cursor:start, pending:null, locale, settings:null});
      this.source?.clear(); this.source = null; this.state = 'paused'; this.error = '';
      this.record('replace');
    }).catch(error => { this.fail(error.message); throw error; });
  }
  restart(confirmed) {
    if (!confirmed) return Promise.reject(new Error('confirmation-required'));
    this.pause();
    const token = this.epoch;
    return this.serial(async () => {
      if (token !== this.epoch) return;
      if (!await this.acquire()) return;
      if (token !== this.epoch) return;
      await this.restore();
      if (token !== this.epoch) return;
      if (!this.session) throw new Error('reading-missing');
      await this.persist({...this.session, cursor:this.session.start, pending:null});
      this.state = 'paused'; this.error = ''; this.record('restart');
    }).catch(error => { this.fail(error.message); throw error; });
  }
  resume(voice, rate = 1, remoteAllowed = false) {
    if (['loading','speaking','committing','retrying'].includes(this.state)) return this.queue;
    if (!voice || (!voice.localService && !remoteAllowed) || !Number.isFinite(rate) || rate < 0.5 || rate > 2) {
      return Promise.reject(new Error('voice-selection'));
    }
    const token = ++this.epoch;
    this.state = 'loading'; this.error = ''; this.record('request-continue');
    return this.serial(async () => {
      if (!await this.acquire()) return;
      if (token !== this.epoch) return;
      this.session = await this.store.load(this.slot) ?? null;
      this.validate();
      if (token !== this.epoch) return;
      if (!this.session) throw new Error('reading-missing');
      this.state = 'loading';
      const document = await this.store.getDocument(this.session.documentId);
      if (!document || document.revision !== this.session.documentRevision || document.length < this.session.end) throw new Error('source-changed');
      if (token !== this.epoch) return;
      this.voice = voice; this.rate = rate;
      this.source?.clear();
      this.source = this.sourceFactory ? await this.sourceFactory(document) :
        new BlockSource(document, (id, index) => this.metrics.measure('source-read',()=>this.store.getBlock(id, index)));
      if (token !== this.epoch) { this.source.clear(); return; }
      this.planner = new SentencePlanner(this.source, this.session.locale);
      await this.persist({...this.session, settings:{voice:voiceKey(voice), rate},
        pending:this.session.pending ? {...this.session.pending, attempts:0} : null});
      if (token === this.epoch) await this.next(token);
    }).catch(error => { if (token === this.epoch) this.fail(error.message); });
  }
  async next(token) {
    while (token === this.epoch) {
      if (this.session.cursor === this.session.end) { this.state = 'done'; this.record('done'); return; }
      if (!this.session.pending) {
        const pending = await this.metrics.measure('prepare-fragment',()=>this.planner.next(this.session.cursor, this.session.end));
        if (token !== this.epoch) return;
        await this.persist({...this.session, pending:{...pending, attempts:0}});
      }
      if (token !== this.epoch) return;
      if (!this.session.pending.text) {
        await this.persist({...this.session, cursor:this.session.pending.end, pending:null});
        continue;
      }
      const pending = {...this.session.pending, attempts:this.session.pending.attempts + 1};
      await this.persist({...this.session, pending});
      if (token !== this.epoch) return;
      await this.metrics.measure('lease-renew',()=>this.store.renew(this.slot, this.owner));
      if (token !== this.epoch) return;
      this.speak(token, pending);
      return;
    }
  }
  speak(token, pending) {
    const utterance = new this.Utterance(pending.text);
    utterance.voice = this.voice; utterance.lang = this.voice.lang.replaceAll('_','-'); utterance.rate = this.rate;
    const current = {utterance, token, started:false, pending, lastBoundary:0};
    this.active = current;
    const valid = () => this.active === current && this.epoch === token;
    utterance.onstart = () => {
      if (!valid()) return;
      current.started = true; this.state = 'speaking'; this.watch(this.speechTimeout, 'speech-timeout'); this.record('start');
    };
    utterance.onboundary = event => {
      if (!valid()) return;
      this.record('boundary', {charIndex:event.charIndex});
      if (current.started && Number.isInteger(event.charIndex) && event.charIndex > current.lastBoundary && event.charIndex < pending.text.length) {
        current.lastBoundary = event.charIndex; this.progress();
      }
    };
    utterance.onend = () => {
      if (!valid()) { this.record('stale-end'); return; }
      if (!current.started) { this.fail('end-without-start'); return; }
      this.progress();
      if (!valid()) return;
      this.active = null; this.clearWatch(); this.state = 'committing'; this.record('end');
      this.serial(async () => {
        await this.persist({...this.session, cursor:pending.end, pending:null});
        if (token === this.epoch) await this.next(token);
      }).catch(error => {
        if (token === this.epoch) this.fail(error.message);
        else this.record('checkpoint-failed', {code:error.message});
      });
    };
    utterance.onerror = event => {
      if (!valid()) { this.record('stale-error', {code:event.error}); return; }
      this.onError(event.error, current);
    };
    this.state = 'loading'; this.watch(this.startTimeout, 'start-timeout'); this.record('request-speak', {characters:pending.text.length, attempt:pending.attempts});
    try {
      // cancel() need not clear the native paused flag. This is not native resume of a reading.
      if (this.synth.paused) this.synth.resume();
      this.synth.speak(utterance);
    } catch { this.fail('engine-exception'); }
  }
  onError(code, current) {
    this.active = null; this.clearWatch();
    const token = ++this.epoch;
    try { this.synth.cancel(); } catch {}
    this.record('error', {code});
    if (RECOVERABLE.has(code) && current.pending.attempts < 3) {
      this.state = 'retrying'; this.changed();
      this.timer = this.timers.setTimeout(() => {
        if (token !== this.epoch) return;
        this.serial(() => this.next(token)).catch(error => { if (token === this.epoch) this.fail(error.message); });
      }, this.retryDelay * current.pending.attempts);
    } else this.fail(code);
  }
  clearWatch() { this.timers.clearTimeout(this.timer); this.timer = undefined; }
  watch(delay, code) { this.clearWatch(); this.timer = this.timers.setTimeout(() => this.fail(code), delay); }
  pause() {
    ++this.epoch; this.clearWatch();
    const wasActive = !!this.active; this.active = null;
    if (wasActive) { try { this.synth.cancel(); } catch {} }
    if (this.session) this.state = this.session.cursor === this.session.end ? 'done' : 'paused';
    this.record('pause');
  }
  fail(code) {
    this.pause(); ++this.leaseEpoch; this.timers.clearInterval(this.heartbeat); this.heartbeat = undefined;
    this.state = 'error'; this.error = code; this.record('blocked', {code});
  }
  async suspend() {
    this.pause();
    ++this.leaseEpoch;
    this.timers.clearInterval(this.heartbeat); this.heartbeat = undefined;
    if (this.held) this.store.retire?.(this.slot, this.owner);
    // Start the release transaction inside pagehide, not in a later microtask
    // which the browser may never run. Checkpoints were already stored before speech.
    const release = this.held ? this.store.release(this.slot, this.owner) : Promise.resolve();
    this.held = false;
    this.source?.clear();
    await release.catch(() => {});
  }
  report(environment = {}) {
    const s = this.session;
    return {version:1, engine:'recoverable-windowed-native', ...environment, state:this.state, error:this.error,
      cursor:s?.cursor, end:s?.end, pending:s?.pending ? {start:s.pending.start,end:s.pending.end,attempts:s.pending.attempts} : null,
      voice:s?.settings, cachedCharacters:this.source?.cachedCharacters ?? 0, peakCachedCharacters:this.source?.peakCharacters ?? 0,
      sourceReads:this.source?.reads ?? 0, normalizedCharacters:this.planner?.window?.text.length ?? 0,
      offsetEntries:this.planner?.window?.ends.length ?? 0, normalizations:this.planner?.normalizations ?? 0,
      performance:this.metrics.report(),droppedEvents:this.droppedEvents, events:this.events};
  }
}
