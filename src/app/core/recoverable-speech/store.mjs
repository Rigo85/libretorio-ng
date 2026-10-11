// Pass a separate database name when used outside the lab.
export const LEASE_MS = 15000;

export function openStore(name = 'libretorio-tts-recovery-lab-v1') {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('documents', {keyPath:'id'});
      db.createObjectStore('blocks', {keyPath:['id', 'index']});
      db.createObjectStore('sessions', {keyPath:'slot'});
      db.createObjectStore('leases', {keyPath:'slot'});
    };
    request.onerror = () => reject(new Error('storage-unavailable'));
    request.onblocked = () => reject(new Error('storage-blocked'));
    request.onsuccess = () => {
      const store = new ReadingStore(request.result);
      request.result.onversionchange = () => request.result.close();
      resolve(store);
    };
  });
}

export class ReadingStore {
  constructor(db) { this.db = db; }
  retired(slot) {
    try { return localStorage.getItem(`${this.db.name}:retired:${slot}`); } catch { return null; }
  }
  retire(slot, owner) {
    // pagehide cannot await IndexedDB. This bounded, synchronous revocation contains
    // only a random lease owner, never text or progress. IDB remains authoritative.
    try { localStorage.setItem(`${this.db.name}:retired:${slot}`, owner); } catch {}
  }
  transaction(stores, mode, operation) {
    return new Promise((resolve, reject) => {
      let tx, result, failure;
      try { tx = this.db.transaction(stores, mode); }
      catch { reject(new Error('storage-unavailable')); return; }
      const abort = code => { failure = new Error(code); tx.abort(); };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure ?? new Error('storage-write-failed'));
      tx.onerror = () => {};
      try { operation(tx, value => { result = value; }, abort); }
      catch { abort('storage-write-failed'); }
    });
  }
  get(store, key) {
    return this.transaction([store], 'readonly', (tx, done) => {
      tx.objectStore(store).get(key).onsuccess = event => done(event.target.result);
    });
  }
  put(store, value) {
    return this.transaction([store], 'readwrite', tx => tx.objectStore(store).put(value));
  }
  putBlock(id, index, text) { return this.put('blocks', {id, index, text}); }
  async getBlock(id, index) { return (await this.get('blocks', [id, index]))?.text; }
  putDocument(document) { return this.put('documents', document); }
  getDocument(id) { return this.get('documents', id); }
  load(slot) { return this.get('sessions', slot); }
  removeDocument(id) {
    return this.transaction(['documents','blocks'], 'readwrite', tx => {
      tx.objectStore('documents').delete(id);
      tx.objectStore('blocks').delete(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]));
    });
  }
  async documents() {
    return this.transaction(['documents'], 'readonly', (tx, done) => {
      tx.objectStore('documents').getAll().onsuccess = event => done(event.target.result);
    });
  }
  claim(slot, owner) {
    if (this.retired(slot) === owner) {
      try { localStorage.removeItem(`${this.db.name}:retired:${slot}`); } catch {}
    }
    return this.transaction(['leases'], 'readwrite', (tx, done, abort) => {
      const leases = tx.objectStore('leases');
      leases.get(slot).onsuccess = event => {
        const lease = event.target.result, now = Date.now();
        if (lease && lease.owner !== owner && lease.until > now && this.retired(slot) !== lease.owner) { abort('reading-in-another-tab'); return; }
        leases.put({slot, owner, until:now + LEASE_MS}); done(true);
      };
    });
  }
  renew(slot, owner) {
    return this.transaction(['leases'], 'readwrite', (tx, done, abort) => {
      const leases = tx.objectStore('leases');
      leases.get(slot).onsuccess = event => {
        const lease = event.target.result, now = Date.now();
        if (!lease || lease.owner !== owner || lease.until <= now || this.retired(slot) === owner) { abort('lease-lost'); return; }
        leases.put({slot, owner, until:now + LEASE_MS}); done(true);
      };
    });
  }
  release(slot, owner) {
    return this.transaction(['leases'], 'readwrite', tx => {
      const leases = tx.objectStore('leases');
      leases.get(slot).onsuccess = event => { if (event.target.result?.owner === owner) leases.delete(slot); };
    });
  }
  save(slot, owner, expectedRevision, value) {
    return this.transaction(['leases', 'sessions'], 'readwrite', (tx, done, abort) => {
      tx.objectStore('leases').get(slot).onsuccess = event => {
        const lease = event.target.result;
        if (!lease || lease.owner !== owner || lease.until <= Date.now() || this.retired(slot) === owner) { abort('lease-lost'); return; }
        const sessions = tx.objectStore('sessions');
        sessions.get(slot).onsuccess = event => {
          const current = event.target.result;
          if ((current?.revision ?? 0) !== expectedRevision) { abort('checkpoint-conflict'); return; }
          const next = {...value, slot, revision:expectedRevision + 1};
          sessions.put(next); done(next);
        };
      };
    });
  }
}
