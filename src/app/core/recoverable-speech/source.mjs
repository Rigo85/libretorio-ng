// Shared by the isolated lab and the EPUB reader.
export const BLOCK_SIZE = 8192;
export const ALGORITHM = 'sentences-1';
export const MAX_FRAGMENT = 480;

export function normalizeText(text) {
  return text.replace(/\r\n?/g, '\n').replace(/[\u2028\u2029]/g, '\n')
    .replace(/\u00ad\s*/gu, '').replace(/(\p{L})-\n\s*(?=\p{L})/gu, '$1')
    .replace(/\s+/gu, ' ').trim();
}

function mappedText(raw) {
  let text = '';
  const ends = [];
  for (const match of raw.matchAll(/(\p{L})-\r?\n\s*(?=\p{L})|\u00ad\s*|\s+|[\s\S]/gu)) {
    const value = match[0];
    const output = match[1] ?? (value.startsWith('\u00ad') ? '' : /^\s/u.test(value) ? ' ' : value);
    text += output;
    for (let i = 0; i < output.length; i++) ends.push(match.index + (i === output.length - 1 ? value.length : i + 1));
  }
  return {text, ends};
}

// Providers expose immutable source offsets, not positions in the normalized speech.
export class BlockSource {
  constructor(document, getBlock) {
    this.document = document;
    this.getBlock = getBlock;
    this.cache = new Map();
    this.reads = 0;
    this.peakCharacters = 0;
  }
  async block(index) {
    if (!this.cache.has(index)) {
      const text = await this.getBlock(this.document.id, index);
      const expected = Math.min(BLOCK_SIZE, this.document.length - index * BLOCK_SIZE);
      if (typeof text !== 'string' || text.length !== expected) throw new Error('source-missing');
      if (this.cache.size === 2) this.cache.delete(this.cache.keys().next().value);
      this.cache.set(index, text);
      this.reads++;
      this.peakCharacters = Math.max(this.peakCharacters, this.cachedCharacters);
    }
    return this.cache.get(index);
  }
  get cachedCharacters() { return [...this.cache.values()].reduce((n, text) => n + text.length, 0); }
  async read(offset, end) {
    if (!Number.isSafeInteger(offset) || offset < 0 || end > this.document.length || offset > end) throw new Error('source-range');
    const limit = Math.min(end, offset + BLOCK_SIZE);
    let text = '';
    while (offset < limit) {
      const index = Math.floor(offset / BLOCK_SIZE), within = offset % BLOCK_SIZE;
      const block = await this.block(index);
      const count = Math.min(limit - offset, block.length - within);
      text += block.slice(within, within + count);
      offset += count;
    }
    return text;
  }
  clear() { this.cache.clear(); }
}

export class SentencePlanner {
  constructor(source, locale) {
    this.source = source;
    this.segmenter = new Intl.Segmenter(locale.replaceAll('_', '-'), {granularity:'sentence'});
    this.graphemes = new Intl.Segmenter(locale.replaceAll('_', '-'), {granularity:'grapheme'});
    this.window = null;
    this.normalizations = 0;
  }
  async prepare(start, end) {
    const raw = await this.source.read(start, end);
    if (!raw.length) throw new Error('source-missing');
    this.window = {start, end:start + raw.length, ...mappedText(raw)};
    this.normalizations++;
  }
  async next(start, end) {
    if (start === end) return null;
    if (!this.window || start < this.window.start || start >= this.window.end) await this.prepare(start, end);
    // Normalize before sentence detection: a wrapped line is not an utterance boundary.
    // The mapping keeps the persistent cursor in the original source, not this temporary text.
    let index = this.window.ends.findIndex(offset => this.window.start + offset > start);
    let text = index < 0 ? '' : this.window.text.slice(index);
    if (!text.trim()) return {start, end:this.window.end, text:''};
    let length = this.segmenter.segment(text)[Symbol.iterator]().next().value.segment.length;
    if (length === text.length && this.window.end < end && length <= MAX_FRAGMENT) {
      // The last sentence of a window may continue in the next block. Rebuild only
      // its unconsumed tail, not every sentence already served from this window.
      await this.prepare(start,end); index = 0; text = this.window.text;
      length = this.segmenter.segment(text)[Symbol.iterator]().next().value.segment.length;
    }
    if (length > MAX_FRAGMENT) {
      const head = text.slice(0, MAX_FRAGMENT);
      const punctuation = [...head.matchAll(/[,;:](?:\s+)/gu)].at(-1);
      const space = [...head.matchAll(/\s+/gu)].at(-1);
      length = punctuation?.index > MAX_FRAGMENT / 3 ? punctuation.index + punctuation[0].length :
        space?.index > 0 ? space.index : MAX_FRAGMENT;
      // Preserve combining marks and surrogate pairs even for a single oversized word.
      let boundary = 0;
      for (const segment of this.graphemes.segment(text)) {
        const next = segment.index + segment.segment.length;
        if (next > length) break;
        boundary = next;
      }
      if (!boundary) throw new Error('oversized-grapheme');
      length = boundary;
    }
    return {start, end:this.window.start + this.window.ends[index + length - 1], text:text.slice(0, length).trim()};
  }
}

// Import is incremental; a failed/incomplete import never becomes the current reading.
export async function importText(store, chunks, {id, title}) {
  let pending = '', length = 0, index = 0;
  try {
    for await (const chunk of chunks) {
      if (typeof chunk !== 'string') throw new Error('source-encoding');
      for (let offset = 0; offset < chunk.length;) {
        const count = Math.min(BLOCK_SIZE - pending.length, chunk.length - offset);
        pending += chunk.slice(offset, offset + count);
        offset += count;
        if (pending.length === BLOCK_SIZE) {
          await store.putBlock(id, index++, pending);
          length += pending.length;
          pending = '';
        }
      }
    }
    if (pending.length) { await store.putBlock(id, index, pending); length += pending.length; }
    if (!length) throw new Error('empty-source');
    const document = {id, revision:id, title:title.slice(0, 180), length, kind:'lab-text', algorithm:ALGORITHM};
    await store.putDocument(document);
    return document;
  } catch (error) {
    await store.removeDocument(id).catch(() => {});
    throw error;
  }
}

export async function* fileChunks(file) {
  const decoder = new TextDecoder('utf-8', {fatal:true});
  // Slice bounds the input too: no file.text(), full-file ArrayBuffer, or chapter split().
  for (let offset = 0; offset < file.size; offset += 32768) {
    yield decoder.decode(await file.slice(offset, offset + 32768).arrayBuffer(), {stream:true});
  }
  yield decoder.decode();
}

export async function* sampleChunks(paragraphs = 8) {
  for (let i = 1; i <= paragraphs; i++) {
    yield `Pasaje ${i}. Elena abri\u00f3 la biblioteca a las nueve de la ma\u00f1ana. ` +
      'Sobre la mesa encontr\u00f3 un mapa antiguo y una carta sin firma. Primero ley\u00f3 la carta con atenci\u00f3n.\n' +
      'Despu\u00e9s busc\u00f3 el nombre del pueblo. La historia no terminaba all\u00ed: alguien hab\u00eda se\u00f1alado otro camino, cerca del r\u00edo.\n\n';
  }
}
