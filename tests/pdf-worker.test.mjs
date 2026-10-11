import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as mupdf from 'mupdf';

function fixturePdf(rotation = 0, includeText = true) {
  const doc = new mupdf.PDFDocument(), font = new mupdf.Font('Times-Roman');
  const ref = doc.addSimpleFont(font);
  const lines = Array.from({length: 36}, (_, i) => `0 -18 Td (Line ${i}: Reading keeps the complete text on this page.) Tj`).join('\n');
  for (let i = 0; i < 6; i++) {
    const page = doc.addPage([0, 0, 500, 750], rotation, {Font: {F1: ref}}, includeText ? `BT /F1 12 Tf 30 730 Td (Chapter ${i}) Tj ${lines} ET` : '0.5 g 20 20 100 100 re f');
    doc.insertPage(-1, page); page.destroy();
  }
  const outline = doc.outlineIterator(); outline.insert({title: 'Chapter two', uri: '#page=2', open: false}); outline.destroy();
  const first=doc.loadPage(0);first.createLink([20,20,100,40],'#page=2').destroy();first.createLink([20,60,100,80],'https://outside.test/').destroy();first.destroy();
  const buffer = doc.saveToBuffer('compress'); const result = buffer.asUint8Array().slice();
  buffer.destroy(); ref.destroy(); font.destroy(); doc.destroy(); return result;
}
async function harness(bytes = fixturePdf()) {
  const messages = [], requests = [];
  let status = 206, headStatus = 200, badRange = false;
  const self = {location: {origin: 'https://reader.test'}, postMessage: data => messages.push(data)};
  const context = vm.createContext({self, URL, performance,crypto,TextEncoder,
    fetch: async (_url, options) => {
      assert.equal(options.credentials, 'same-origin'); assert.equal(options.method, 'HEAD');
      return {ok: headStatus === 200, status: headStatus, headers: {get: () => String(bytes.length)}};
    }, XMLHttpRequest: class {
      open(method, url, async) { assert.equal(method, 'GET'); assert.equal(async, false); this.url = url; }
      setRequestHeader(name, value) { assert.equal(name, 'Range'); this.range = value; }
      send() {
        const [, start, end] = /^bytes=(\d+)-(\d+)$/.exec(this.range);
        requests.push({url: this.url, start: +start, end: +end});
        assert.ok(+end - +start + 1 <= 1024 * 1024);
        this.response = bytes.slice(+start, +end + 1).buffer; this.status = status;
        this.header = `bytes ${badRange ? 100 : start}-${end}/${bytes.length}`;
      }
      getResponseHeader() { return this.header; }
    }
  });
  const dependency = new vm.SyntheticModule(Object.keys(mupdf), function() {
    for (const key of Object.keys(mupdf)) this.setExport(key, mupdf[key]);
  }, {context});
  const worker = new vm.SourceTextModule(fs.readFileSync(new URL('../public/assets/pdf-reader/mupdf-worker.mjs', import.meta.url), 'utf8'), {context});
  const searchModule=new vm.SourceTextModule(fs.readFileSync(new URL('../public/assets/pdf-reader/text-search.mjs',import.meta.url),'utf8'),{context});
  await worker.link(specifier=>specifier.endsWith('text-search.mjs')?searchModule:dependency); await worker.evaluate();
  let id = 0;
  return {requests, setStatus(value) {status = value;}, setHeadStatus(value) {headStatus = value;}, corruptRange() {badRange = true;},
    async send(data) { await self.onmessage({data: {id: ++id, ...data}}); return messages.at(-1); }};
}
const options = {layoutWidth: 390, layoutHeight: 700, renderWidth: 780, fontSize: 20,
  fontFamily: 'serif', pageMargin: 12, lineHeight: 1.5, dark: false, reading: true, banded: true, zoom: 1};
const normalize = text => text.replace(/[\s\u00ad-]/gu, '');
test('real PDF worker: bookmarks, reflow, bands, Original, full width, cache bounds and teardown', async () => {
  const h = await harness();
  const opened = await h.send({type: 'open', url: '/cache/prepared/prepared.pdf', options});
  assert.equal(opened.type, 'open'); assert.equal(opened.pages, 6);
  assert.equal(opened.outline[0].title, 'Chapter two'); assert.equal(opened.outline[0].page, 1);
  const original = await h.send({type: 'render', page: 0, options: {...options, reading: false}});
  assert.equal(original.type, 'render');
  const reading = await h.send({type: 'render', page: 0, options});
  assert.equal(reading.type, 'render'); assert.equal(normalize(reading.text), normalize(original.text));
  for (const result of [reading, original]) {
    assert.ok(result.lines.length > 10);
    assert.equal(normalize(result.lines.flat().map(g => g.text).join('')), normalize(result.text));
    assert.ok(result.lines.flat().every(g => g.quad.length === 8 && g.quad.every(Number.isFinite)));
  }
  const larger = await h.send({type: 'render', page: 0, options: {...options, fontSize: 28}});
  assert.equal(larger.displayWidth, 390); assert.ok(larger.contentHeight > reading.contentHeight);
  const before = h.requests.length;
  const scrolled = await h.send({type: 'render', page: 0, scrollTop: 1500, options: {...options, fontSize: 28}});
  assert.ok(scrolled.sliceTop > 0); assert.equal(h.requests.length, before);
  assert.deepEqual(scrolled.lines, larger.lines, 'scrolling bands must not move the text layer');
  let ink = 0;
  for (let i = 0; i < scrolled.pixels.length; i += 4) if (scrolled.pixels[i] < 180) ink++;
  assert.ok(ink > 1000); assert.ok(scrolled.width * scrolled.height <= 8_010_000);
  for (let page = 1; page < 6; page++) {
    const next = await h.send({type: 'render', page, options});
    assert.equal(next.type, 'render'); assert.ok(next.cachedPages <= 3); assert.ok(next.cachedBlocks <= 8);
  }
  const restored = await h.send({type: 'render', page: 0, options: {...options, reading: false}});
  assert.deepEqual(restored.pixels, original.pixels); assert.equal(restored.cachedPages, 0);
  const full = await h.send({type: 'render', page: 0, options: {...options, layoutWidth: 1425, renderWidth: 1425}});
  assert.equal(full.displayWidth, 1425); assert.equal(normalize(full.text), normalize(original.text));
  assert.equal((await h.send({type: 'close'})).type, 'close');
  assert.equal((await h.send({type: 'render', page: 0, options})).type, 'error');
});
test('selection quads follow Original zoom and rotation; pages without text have no invented selection', async () => {
  const h = await harness(fixturePdf(90));
  await h.send({type: 'open', url: '/books/rotated.pdf'});
  const base = await h.send({type: 'render', page: 0, options: {...options, reading: false}});
  const zoom = await h.send({type: 'render', page: 0, options: {...options, reading: false, zoom: 2, dark: true}});
  assert.equal(base.type, 'render'); assert.equal(zoom.type, 'render');
  assert.equal(base.lines[0][0].text, 'C');
  base.lines[0][0].quad.forEach((value, i) => assert.ok(Math.abs(zoom.lines[0][0].quad[i] - value * 2) < 0.001));
  await h.send({type: 'close'});
  const blank = await harness(fixturePdf(0, false));
  await blank.send({type: 'open', url: '/books/no-text.pdf'});
  const result = await blank.send({type: 'render', page: 0, options: {...options, reading: false}});
  assert.equal(result.type, 'render'); assert.equal(result.lines.length, 0);
  await blank.send({type: 'close'});
});
test('worker rejects outside URLs, missing sessions, whole-file fallback and malformed ranges', async () => {
  const h = await harness();
  for (const url of ['https://outside.test/books/a.pdf', '/api/users', 'file:///books/a.pdf', '/books/../api/users'])
    assert.equal((await h.send({type: 'open', url, options})).type, 'error');
  assert.equal(h.requests.length, 0);
  h.setHeadStatus(401);
  assert.match((await h.send({type: 'open', url: '/books/a.pdf', options})).error, /401/);
  h.setHeadStatus(200); h.setStatus(200);
  assert.equal((await h.send({type: 'open', url: '/books/a.pdf', options})).type, 'error');
  h.setStatus(206); h.corruptRange();
  assert.equal((await h.send({type: 'open', url: '/books/a.pdf', options})).type, 'error');
});
test('speech text uses the rendered page fingerprint, is bounded and never changes the visible layout',async()=>{
  const h=await harness();await h.send({type:'open',url:'/books/tts.pdf'});
  for(const reading of [false,true]) {
    const mode={...options,reading};
    const shown=await h.send({type:'render',page:2,options:mode});
    assert.match(shown.speech.revision,/^[a-f0-9]{64}$/);
    const text=shown.lines.map(line=>line.map(g=>g.text).join('')+'\n').join('');
    assert.equal(shown.speech.length,text.length);
    const request={type:'speech-text',channel:'speech',page:2,options:shown.speech.layout,revision:shown.speech.revision,length:shown.speech.length,start:7,end:40};
    const response=await h.send(request);assert.equal(response.text,text.slice(7,40));assert.equal(response.channel,'speech');assert.equal(response.pixels,undefined);
    const changed=await h.send({...request,revision:'a'.repeat(64)});assert.equal(changed.error,'source-changed');
    assert.equal((await h.send({...request,end:9000})).error,'source-range');
    await h.send({type:'render',page:2,options:{...mode,reading:true,fontSize:30}});
    assert.equal((await h.send(request)).text,text.slice(7,40),'saved selection layout survives viewer mode/font changes');
    const again=await h.send({type:'render',page:2,options:mode});assert.deepEqual(again.lines,shown.lines);assert.deepEqual(again.pixels,shown.pixels);
  }
  await h.send({type:'close'});
});
test('search visits pages without reflow, is capped, and leaves reader pixels and speech intact',async()=>{
 const h=await harness();await h.send({type:'open',url:'/books/search.pdf'});
 const before=await h.send({type:'render',page:0,options});
 for(let pass=0;pass<6;pass++)for(let page=0;page<6;page++){
  const result=await h.send({type:'search-page',channel:'search',page,offset:0,query:'Reading keeps'});
  assert.equal(result.type,'search-page');assert.equal(result.hits.length,36);assert.ok(result.done);
  assert.equal(result.hits[20].occurrence,20);assert.ok(result.examined<=32772);
 }
 const after=await h.send({type:'render',page:0,options});assert.deepEqual(after.pixels,before.pixels);assert.deepEqual(after.speech,before.speech);assert.ok(after.cachedPages<=3);assert.ok(after.cachedBlocks<=8);
 const links=await h.send({type:'render',page:0,options:{...options,reading:false,zoom:2}});assert.equal(links.links.length,1);assert.equal(links.links[0].page,1);
 assert.equal((await h.send({type:'link-destination',channel:'search',uri:links.links[0].uri})).page,1);
 assert.equal((await h.send({type:'link-destination',channel:'search',uri:'javascript:alert(1)'})).type,'error');
 assert.equal((await h.send({type:'search-page',channel:'search',page:99,query:'test'})).type,'error');
 await h.send({type:'close'});
});
