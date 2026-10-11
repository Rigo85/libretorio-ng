// Bounded diagnostics shared with the lab; no document text is exported.
const METRICS = new Set(['checkpoint','source-read','prepare-fragment','lease-renew','voice-start','utterance','phrase-gap','long-task']);
const LIMITS = [1,5,10,25,50,100,250,500,1000,5000,15000];

export class ReadingMetrics {
  constructor(now = () => performance.now()) {
    this.now = now; this.since = now(); this.startedAt = new Date().toISOString();
    this.counters = {}; this.durations = {}; this.samples = []; this.samplesDropped = 0;
    this.requested = null; this.started = null; this.ended = null;
    this.peakSourceCharacters = 0; this.peakNormalizedCharacters = 0;
  }
  duration(name, ms, failed = false) {
    if (!METRICS.has(name) || !Number.isFinite(ms) || ms < 0) return;
    const stats = this.durations[name] ??= {count:0,failed:0,totalMs:0,maxMs:0,buckets:Array(LIMITS.length+1).fill(0)};
    stats.count++; stats.failed += Number(failed); stats.totalMs += ms; stats.maxMs = Math.max(stats.maxMs,ms);
    const index = LIMITS.findIndex(limit => ms <= limit); stats.buckets[index < 0 ? LIMITS.length : index]++;
  }
  async measure(name, operation) {
    const at = this.now(); let failed = true;
    try { const result = await operation(); failed = false; return result; }
    finally { this.duration(name,this.now()-at,failed); }
  }
  event(type) {
    const at = this.now();
    // Event names are controlled by the reader. Cap keys defensively as well as values.
    if (Object.hasOwn(this.counters,type) || Object.keys(this.counters).length < 32) this.counters[type] = (this.counters[type] ?? 0)+1;
    if (['pause','request-continue','error','blocked','replace','restart'].includes(type)) {
      this.requested = this.started = this.ended = null;
    } else if (type === 'request-speak') this.requested = at;
    else if (type === 'start') {
      if (this.requested !== null) this.duration('voice-start',at-this.requested);
      if (this.ended !== null) this.duration('phrase-gap',at-this.ended);
      this.started = at; this.requested = this.ended = null;
    } else if (type === 'end') {
      if (this.started !== null) this.duration('utterance',at-this.started);
      this.ended = at; this.started = null;
    }
  }
  buffers(source,planner) {
    this.peakSourceCharacters = Math.max(this.peakSourceCharacters,source?.peakCharacters ?? 0);
    this.peakNormalizedCharacters = Math.max(this.peakNormalizedCharacters,planner?.window?.text.length ?? 0);
  }
  sample({visible, state, cursor, heapBytes}) {
    const sample = {at:new Date().toISOString(),elapsedMs:Math.round(this.now()-this.since),visible,state,cursor};
    if (Number.isFinite(heapBytes) && heapBytes >= 0) sample.jsHeapBytes = heapBytes;
    this.samples.push(sample);
    if (this.samples.length > 120) { this.samples.shift(); this.samplesDropped++; }
  }
  report() {
    const durations = {};
    for (const [name,stats] of Object.entries(this.durations)) durations[name] = {
      ...stats, buckets:[...stats.buckets],meanMs:stats.totalMs/stats.count
    };
    return {startedAt:this.startedAt,elapsedMs:Math.round(this.now()-this.since),counters:{...this.counters},durations,
      bucketUpperBoundsMs:LIMITS,peakSourceCharacters:this.peakSourceCharacters,peakNormalizedCharacters:this.peakNormalizedCharacters,
      samples:[...this.samples],samplesDropped:this.samplesDropped};
  }
}

export function browserPerformance(perf = performance) {
  const navigation = perf.getEntriesByType('navigation')[0];
  return {
    navigation:navigation ? {
      requestId:navigation.serverTiming?.find(entry => entry.name === 'lab')?.description ?? null,
      type:navigation.type,ttfbMs:navigation.responseStart-navigation.requestStart,
      responseMs:navigation.responseEnd-navigation.responseStart,loadMs:navigation.loadEventEnd,
      transferBytes:navigation.transferSize
    } : null,
    resources:perf.getEntriesByType('resource').filter(entry => {
      try { return new URL(entry.name).origin === location.origin; } catch { return false; }
    }).slice(0,24).map(entry => ({
      // Only static asset paths are allowed; never export query strings or arbitrary URLs.
      asset:/^\/(?:recovery\/(?:app|reader|source|store|diagnostics)\.mjs|(?:recovery\/)?style\.css|icons\.woff2)$/.test(new URL(entry.name).pathname)
        ? new URL(entry.name).pathname : 'other',durationMs:entry.duration,transferBytes:entry.transferSize
    }))
  };
}

export async function openDiagnostics(name = 'libretorio-tts-diagnostics-v1') {
  const db = await new Promise((resolve,reject) => {
    const request = indexedDB.open(name,1);
    request.onupgradeneeded = () => request.result.createObjectStore('runs',{keyPath:'id'});
    request.onerror = () => reject(new Error('diagnostics-unavailable'));
    request.onsuccess = () => resolve(request.result);
  });
  db.onversionchange = () => db.close();
  return {
    close() { db.close(); },
    save(id,report) {
      return new Promise((resolve,reject) => {
        const tx = db.transaction('runs','readwrite'), store = tx.objectStore('runs');
        store.getAll().onsuccess = event => {
          const entries = event.target.result;
          const sequence = Math.max(0,...entries.map(item=>item.sequence ?? 0))+1;
          store.put({id,savedAt:Date.now(),sequence,report});
          const old = entries.filter(item=>item.id!==id).sort((a,b)=>(b.sequence ?? 0)-(a.sequence ?? 0)).slice(4);
          for (const item of old) store.delete(item.id);
        };
        tx.oncomplete = resolve; tx.onabort = () => reject(new Error('diagnostics-write-failed'));
        tx.onerror = () => {};
      });
    },
    previous(id) {
      return new Promise((resolve,reject) => {
        const tx = db.transaction('runs','readonly'), request = tx.objectStore('runs').getAll();
        request.onsuccess = () => resolve(request.result.filter(item=>item.id!==id).sort((a,b)=>(b.sequence ?? 0)-(a.sequence ?? 0)).slice(0,4));
        request.onerror = () => reject(new Error('diagnostics-read-failed'));
      });
    }
  };
}
