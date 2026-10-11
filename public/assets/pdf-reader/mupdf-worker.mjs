import * as mupdf from '/assets/mupdf/mupdf.js';
import {findWindow,searchFold} from './text-search.mjs';

let document, stream, source;
let speechCache;
const readingCache = new Map();
const blockSize = 1024 * 1024;
function httpError(status) {
  if (status === 401 || status === 403) return 'La sesión no permite leer el PDF (HTTP ' + status + '). Vuelve a iniciar sesión.';
  if (status === 404) return 'El PDF ya no está disponible (HTTP 404).';
  return 'No se pudo leer el PDF (HTTP ' + status + ').';
}
class RangeSource {
  constructor(url, size) { this.url = url; this.size = size; this.blocks = new Map(); this.bytes = 0; this.requests = 0; }
  fileSize() { return this.size; }
  read(memory, offset, length, position) {
    if (position >= this.size) return 0;
    const start = Math.floor(position / blockSize) * blockSize;
    let block = this.blocks.get(start);
    if (!block) {
      // The binding's read callback is synchronous; network I/O stays off the UI thread.
      const request = new XMLHttpRequest();
      request.open('GET', this.url, false);
      request.responseType = 'arraybuffer';
      request.setRequestHeader('Range', `bytes=${start}-${Math.min(this.size - 1, start + blockSize - 1)}`);
      request.send();
      if (request.status !== 206) throw new Error(request.status === 200 ? 'El servidor no admite lectura por rangos (se esperaba HTTP 206).' : httpError(request.status));
      const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(request.getResponseHeader('Content-Range') || '');
      block = new Uint8Array(request.response);
      if (!match || +match[1] !== start || +match[3] !== this.size || block.length !== +match[2] - start + 1) throw new Error('Invalid Content-Range');
      this.bytes += block.byteLength;
      this.requests++;
      if (this.blocks.size === 8) this.blocks.delete(this.blocks.keys().next().value);
    } else this.blocks.delete(start);
    this.blocks.set(start, block);
    const count = Math.min(length, block.length - (position - start));
    memory.set(block.subarray(position - start, position - start + count), offset);
    return count;
  }
  close() { this.blocks.clear(); }
}
function dispose() {
  speechCache = undefined;
  disposeReading();
  document?.destroy(); document = undefined;
  stream?.destroy(); stream = undefined;
  source?.close(); source = undefined;
}
function disposeReading() {
  for (const entry of readingCache.values()) entry.document.destroy();
  readingCache.clear();
}
function selectionLines(text, scale = 1, origin = [0, 0]) {
  const lines = [];
  let line;
  text.walk({
    beginLine() { line = []; lines.push(line); },
    onChar(character, _origin, font, _size, quad) {
      try {
        const family = font.isMono() ? 'monospace' : font.isSerif() ? 'serif' : 'sans-serif';
        line.push({text: character, font: `${font.isItalic() ? 'italic' : 'normal'} ${font.isBold() ? 'bold' : 'normal'} 20px ${family}`,
          quad: quad.map((value, i) => (value - origin[i % 2]) * scale)});
      } finally { font.destroy(); }
    }
  });
  // The JS walker currently truncates non-BMP code points; JSON preserves their Unicode text.
  const unicodeLines = JSON.parse(text.asJSON()).blocks.filter(block => block.type === 'text').flatMap(block => block.lines);
  lines.forEach((glyphs, i) => {
    const characters = Array.from(unicodeLines[i]?.text ?? '');
    if (characters.length === glyphs.length) glyphs.forEach((glyph, j) => { glyph.text = characters[j]; });
  });
  return lines;
}
function speechLayout(options) {
  return {reading: options.reading, layoutWidth: options.layoutWidth, fontSize: options.fontSize,
    fontFamily: options.fontFamily, pageMargin: options.pageMargin, lineHeight: options.lineHeight};
}
function speechKey(page, options) { return JSON.stringify([page, options.reading ? speechLayout(options) : false]); }
async function speechPage(page, options, lines) {
  const key = speechKey(page, options);
  if (speechCache?.key === key) return speechCache;
  if (!lines) {
    if (options.reading) lines = prepareReading(page, options).lines;
    else {
      const loaded = document.loadPage(page); let text;
      try { text = loaded.toStructuredText(''); lines = selectionLines(text); }
      finally { text?.destroy(); loaded.destroy(); }
    }
  }
  const text = lines.map(line => line.filter(glyph => glyph.text && glyph.quad.length === 8 && glyph.quad.every(Number.isFinite))
    .map(glyph => glyph.text).join('')).filter(Boolean).map(line => line + '\n').join('');
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const revision = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
  speechCache = {key, text, revision, length: text.length};
  return speechCache;
}
async function speechMetadata(page, options, lines) {
  const entry = await speechPage(page, options, lines);
  return {revision: entry.revision, length: entry.length, layout: speechLayout(options)};
}
function prepareReading(number, options) {
  const key = JSON.stringify([options.layoutWidth, options.fontSize, options.fontFamily, options.pageMargin, options.lineHeight]);
  let entry = readingCache.get(number);
  if (entry) { readingCache.delete(number); readingCache.set(number, entry); }
  if (entry?.key === key) return entry;
  if (!entry) {
    if (readingCache.size === 3) {
      const oldest = readingCache.keys().next().value;
      readingCache.get(oldest).document.destroy(); readingCache.delete(oldest);
    }
    const page = document.loadPage(number);
    const buffer = new mupdf.Buffer();
    let writer, device;
    try {
      // Same native XHTML extraction used by MuPDF's reflow wrapper, one source page at a time.
      writer = new mupdf.DocumentWriter(buffer, 'xhtml', 'preserve-images,dehyphenate');
      device = writer.beginPage(page.getBounds());
      page.run(device, mupdf.Matrix.identity);
      device.close(); device.destroy(); device = undefined;
      writer.endPage(); writer.close();
      entry = {document: mupdf.Document.openDocument(buffer, 'application/xhtml+xml'), key: '', height: 0, text: ''};
      readingCache.set(number, entry);
    } finally { device?.destroy(); writer?.destroy(); buffer.destroy(); page.destroy(); }
  }
  const readingDocument = entry.document;
  const family = ['serif', 'sans-serif', 'monospace'].includes(options.fontFamily) ? options.fontFamily : 'serif';
  const margin = [6, 12, 24].includes(options.pageMargin) ? options.pageMargin : 6;
  const lineHeight = [1.3, 1.5, 1.8].includes(options.lineHeight) ? options.lineHeight : 1.5;
  readingDocument.style(false, `@page { margin: ${margin}px; }
    body { margin: 0; font-family: ${family}; line-height: ${lineHeight}; }
    p { white-space: normal; } img { max-width: 100%; height: auto; }`);
  // A tall logical page is never rasterized in full. Only a viewport-sized band is allocated.
  readingDocument.layout(options.layoutWidth, 100000, options.fontSize);
  if (readingDocument.countPages() !== 1) throw new Error('Esta página supera el límite del modo Lectura. Usa Original.');
  const page = readingDocument.loadPage(0);
  let text;
  try {
    text = page.toStructuredText('preserve-images');
    let bottom = 0;
    text.walk({beginTextBlock: bounds => { bottom = Math.max(bottom, bounds[3]); },
      onImageBlock: (bounds, matrix, image) => { bottom = Math.max(bottom, bounds[3]); image.destroy(); }});
    entry.height = Math.max(64, Math.ceil(bottom + margin + options.fontSize));
    entry.text = text.asText();
    entry.lines = selectionLines(text);
    entry.key = key;
  } finally { text?.destroy(); page.destroy(); }
  return entry;
}
function renderReading(number, options, scrollTop = 0) {
  const entry = prepareReading(number, options);
  const readingHeight = entry.height;
  const width = options.layoutWidth;
  const viewport = Math.max(160, options.layoutHeight);
  const top = Math.max(0, Math.min(Math.max(0, readingHeight - viewport), Math.floor(scrollTop - viewport / 2)));
  const height = Math.min(readingHeight - top, viewport * 2);
  const scale = Math.min(options.renderWidth / width, Math.sqrt(8_000_000 / (width * height)));
  const page = entry.document.loadPage(0);
  let pixmap, device;
  try {
    pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, Math.ceil(width * scale), Math.ceil(height * scale)], true);
    pixmap.clear(255);
    device = new mupdf.DrawDevice(mupdf.Matrix.identity, pixmap);
    page.run(device, [scale, 0, 0, scale, 0, -top * scale]);
    device.close();
    if (options.dark) pixmap.invertLuminance();
    return {width: pixmap.getWidth(), height: pixmap.getHeight(), pixels: pixmap.getPixels().slice(),
      text: entry.text, lines: entry.lines, displayWidth: width, displayHeight: height, contentHeight: readingHeight, sliceTop: top, reading: true};
  } finally { device?.destroy(); pixmap?.destroy(); page.destroy(); }
}
function renderOriginalBand(page, options, scrollTop = 0) {
  const bounds = page.getBounds();
  const width = options.layoutWidth * options.zoom;
  const pageScale = width / (bounds[2] - bounds[0]);
  const contentHeight = (bounds[3] - bounds[1]) * pageScale;
  const viewport = Math.max(160, options.layoutHeight);
  const top = Math.max(0, Math.min(Math.max(0, contentHeight - viewport), Math.floor(scrollTop - viewport / 2)));
  const height = Math.min(contentHeight - top, viewport * 2);
  const scale = Math.min(options.renderWidth / options.layoutWidth, Math.sqrt(8_000_000 / (width * height)));
  let pixmap, device, text;
  try {
    pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, Math.ceil(width * scale), Math.ceil(height * scale)], true);
    pixmap.clear(255);
    device = new mupdf.DrawDevice(mupdf.Matrix.identity, pixmap);
    const s = pageScale * scale;
    page.run(device, [s, 0, 0, s, -bounds[0] * s, -bounds[1] * s - top * scale]);
    device.close();
    if (options.dark) pixmap.invertLuminance();
    text = page.toStructuredText('');
    return {width: pixmap.getWidth(), height: pixmap.getHeight(), pixels: pixmap.getPixels().slice(),
      text: text.asText(), lines: selectionLines(text, pageScale, [bounds[0], bounds[1]]),
      displayWidth: width, displayHeight: height, contentHeight, sliceTop: top, reading: false};
  } finally { text?.destroy(); device?.destroy(); pixmap?.destroy(); }
}
function outline(items, depth = 0) {
  return (items ?? []).flatMap(item => {
    let page = item.page;
    try { if ((!Number.isInteger(page) || page < 0) && item.uri) page = document.resolveLink(item.uri); } catch {}
    return [{title: item.title || 'Sin titulo', page, depth}, ...outline(item.down, depth + 1)];
  });
}
function internalLinks(page,options){
  const bounds=page.getBounds(),scale=options.layoutWidth*options.zoom/(bounds[2]-bounds[0]);
  const links=page.getLinks(),result=[];
  try{for(const link of links){
    const uri=link.getURI();if(link.isExternal()||!uri.startsWith('#'))continue;
    const target=document.resolveLink(uri);if(!Number.isInteger(target)||target<0||target>=document.countPages())continue;
    const box=link.getBounds();result.push({uri,page:target,box:box.map((n,i)=>(n-bounds[i%2])*scale)});
    if(result.length>=100)break;
  }}finally{for(const link of links)link.destroy();}
  return result;
}
async function handle(data) {
  const {id, type, options} = data;
  const started = performance.now();
  try {
    if (type === 'open') {
      dispose();
      const url = new URL(data.url, self.location.origin);
      if (url.origin !== self.location.origin || url.username || url.password || !/^\/(books|cache)\//.test(url.pathname)) throw new Error('La ruta del PDF no pertenece a la biblioteca.');
      const head = await fetch(url, {method: 'HEAD', credentials: 'same-origin'});
      if (!head.ok) throw new Error(httpError(head.status));
      const size = Number(head.headers.get('Content-Length'));
      if (!Number.isSafeInteger(size) || size <= 0) throw new Error('Missing file size');
      source = new RangeSource(url.href, size);
      stream = new mupdf.Stream(source);
      document = mupdf.Document.openDocument(stream, 'application/pdf');
      if (!document.isPDF()) throw new Error('El archivo recibido no es un PDF.');
      if (document.needsPassword()) throw new Error('Documento protegido con contraseña; no soportado en esta ronda');
      self.postMessage({id, type, pages: document.countPages(), outline: outline(document.loadOutline()),
        bytes: source.bytes, size, requests: source.requests, elapsed: performance.now() - started});
    } else if(type==='search-page'){
      if(!document||!Number.isSafeInteger(data.page)||data.page<0||data.page>=document.countPages()||typeof data.query!=='string'||data.query.length>128)throw new Error('invalid-search');
      const page=document.loadPage(data.page);let text;
      try{
        text=page.toStructuredText('');const raw=text.asText();
        if(raw.length>2000000)throw new Error('Esta pagina supera el limite de texto de busqueda.');
        const result=findWindow(raw,data.query,data.offset??0,50);
        const needle=searchFold(data.query).trim(),prefix=searchFold(raw.slice(0,data.offset??0));let ordinal=0,found=0;
        while((found=prefix.indexOf(needle,found))>=0){ordinal++;found+=needle.length;}
        result.hits.forEach((hit,index)=>{hit.occurrence=ordinal+index;});
        self.postMessage({id,type,channel:'search',...result,page:data.page,bytes:source.bytes,requests:source.requests});
      }finally{text?.destroy();page.destroy();}
    } else if(type==='link-destination'){
      if(!document||typeof data.uri!=='string'||data.uri.length>2048||!data.uri.startsWith('#'))throw new Error('invalid-link');
      const target=document.resolveLinkDestination(data.uri),page=document.resolveLink(data.uri);
      if(!Number.isInteger(page)||page<0||page>=document.countPages())throw new Error('invalid-link');
      const loaded=document.loadPage(page);try{const bounds=loaded.getBounds();
        self.postMessage({id,type,channel:'search',page,ratio:Number.isFinite(target.y)?Math.max(0,Math.min(1,(target.y-bounds[1])/(bounds[3]-bounds[1]))):0});
      }finally{loaded.destroy();}
    } else if (type === 'speech-text') {
      if (!document || !Number.isSafeInteger(data.page) || data.page < 0 || data.page >= document.countPages() ||
        !Number.isSafeInteger(data.start) || !Number.isSafeInteger(data.end) || data.start < 0 || data.end < data.start || data.end-data.start > 8192 ||
        !options || typeof options.reading !== 'boolean' || !Number.isFinite(options.layoutWidth) || options.layoutWidth < 120 || options.layoutWidth > 100000 ||
        !Number.isFinite(options.fontSize) || options.fontSize < 12 || options.fontSize > 36 ||
        !['publisher','serif','sans-serif','monospace'].includes(options.fontFamily) || ![6,12,24].includes(options.pageMargin) ||
        ![1.3,1.5,1.8].includes(options.lineHeight)) throw new Error('source-range');
      const entry = await speechPage(data.page, options);
      if (entry.revision !== data.revision || entry.length !== data.length || data.end > entry.length) throw new Error('source-changed');
      self.postMessage({id, type, channel: 'speech', text: entry.text.slice(data.start, data.end)});
    } else if (type === 'render') {
      if (!document) throw new Error('No document open');
      const pages = document.countPages();
      const number = Math.max(0, Math.min(pages - 1, data.page));
      if (options.reading) {
        const result = renderReading(number, options, data.scrollTop);
        const loaded=document.loadPage(number);try{result.links=internalLinks(loaded,options);}finally{loaded.destroy();}
        result.speech = await speechMetadata(number, options, result.lines);
        self.postMessage({id, type, page: number, pages, ...result, bytes: source.bytes, size: source.size,
          cachedPages: readingCache.size, cachedBlocks: source.blocks.size,
          requests: source.requests, elapsed: performance.now() - started}, [result.pixels.buffer]);
        return;
      }
      disposeReading();
      const page = document.loadPage(number);
      if (options.banded) {
        try {
          const result = renderOriginalBand(page, options, data.scrollTop);
          result.links=internalLinks(page,options);
          result.speech = await speechMetadata(number, options, result.lines);
          self.postMessage({id, type, page: number, pages, ...result, bytes: source.bytes, size: source.size,
            cachedPages: 0, cachedBlocks: source.blocks.size, requests: source.requests, elapsed: performance.now() - started,
            outline: undefined}, [result.pixels.buffer]);
        } finally { page.destroy(); }
        return;
      }
      let pixmap, text;
      try {
        const bounds = page.getBounds();
        const width = bounds[2] - bounds[0], height = bounds[3] - bounds[1];
        const scale = Math.min(options.renderWidth / width * options.zoom, Math.sqrt(8_000_000 / (width * height)));
        pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, true);
        if (options.dark) pixmap.invertLuminance();
        text = page.toStructuredText('');
        const pixels = pixmap.getPixels().slice();
        self.postMessage({id, type, page: number, pages, width: pixmap.getWidth(), height: pixmap.getHeight(), pixels,
          displayWidth: width * scale / (options.renderWidth / options.layoutWidth),
          text: text.asText(), bytes: source.bytes, size: source.size, requests: source.requests,
          elapsed: performance.now() - started, outline: data.relayout ? outline(document.loadOutline()) : undefined}, [pixels.buffer]);
      } finally { text?.destroy(); pixmap?.destroy(); page.destroy(); }
    } else if (type === 'close') { dispose(); self.postMessage({id, type}); }
  } catch (error) {
    if (type === 'open') dispose();
    const message = error.message || String(error);
    self.postMessage({id, type: 'error', channel: data.channel,
      error: data.channel === 'speech' && !['source-changed','source-range'].includes(message) ? 'source-unavailable' : message});
  }
}
// Native calls and text hashing share one document; never interleave close/open/render.
let queue = Promise.resolve();
self.onmessage = ({data}) => queue = queue.then(() => handle(data));
self.postMessage({type: 'ready'});
