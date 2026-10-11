import {ComponentFixture, TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {PdfViewerComponent} from './pdf-viewer.component';
import {ContinuousPages} from './continuous-pages';
import {pdfSelection, renderPdfTextLayer} from './pdf-text-layer';

class WorkerStub {
  onmessage?: (event: {data: any}) => void;
  onerror?: (event: {message: string}) => void;
  sent: any[] = [];
  terminated = false;
  postMessage(message: unknown) { this.sent.push(message); }
  terminate() { this.terminated = true; }
  emit(data: any) { this.onmessage?.({data}); }
}

describe('MuPDF reader integration', () => {
  let fixture: ComponentFixture<PdfViewerComponent>;
  let workers: WorkerStub[];
  let frames: Map<number, FrameRequestCallback>;
  let storage: Map<string, string>;
  let sequence: number;
  const key = 'libretorio:pdf:preferences:v1';

  beforeEach(async () => {
    workers = []; frames = new Map(); storage = new Map(); sequence = 0;
    spyOn(window, 'Worker').and.callFake((function() {
      const worker = new WorkerStub(); workers.push(worker); return worker;
    }) as any);
    spyOn(window, 'requestAnimationFrame').and.callFake(callback => { frames.set(++sequence, callback); return sequence; });
    spyOn(window, 'cancelAnimationFrame').and.callFake(id => { frames.delete(id); });
    spyOn(window, 'ResizeObserver').and.returnValue({observe() {}, unobserve() {}, disconnect() {}});
    spyOn(window, 'matchMedia').and.returnValue({matches: false} as MediaQueryList);
    spyOn(Storage.prototype, 'getItem').and.callFake(name => storage.get(name) ?? null);
    spyOn(Storage.prototype, 'setItem').and.callFake((name, value) => storage.set(name, value));
    await TestBed.configureTestingModule({imports: [PdfViewerComponent], providers: [provideHttpClient()]}).compileComponents();
  });
  afterEach(() => fixture?.destroy());
  function frame() {
    const pending = [...frames.values()]; frames.clear(); pending.forEach(cb => cb(0)); fixture.detectChanges();
  }
  function mount(src = '/books/sample.pdf') {
    fixture = TestBed.createComponent(PdfViewerComponent);
    fixture.componentRef.setInput('pdfSrc', src); fixture.detectChanges(); frame();
    return fixture.componentInstance;
  }
  function opened(src = '/books/sample.pdf') {
    const c = mount(src), worker = workers[0];
    Object.defineProperties(c.paperStage!.nativeElement, {clientWidth: {value: 390, configurable: true}, clientHeight: {value: 700, configurable: true}});
    worker.emit({type: 'ready'});
    worker.emit({type: 'open', id: worker.sent.at(-1).id, pages: 100, bytes: 1024, size: 10000, requests: 1,
      outline: [{title: 'Chapter', page: 20}, {title: 'Bad', page: -1}]});
    fixture.detectChanges(); return {c, worker};
  }
  function respond(worker: WorkerStub, height = 1500) {
    const job = worker.sent.at(-1);
    worker.emit({type: 'render', id: job.id, page: job.page, pages: 100, width: 2, height: 2,
      pixels: new Uint8ClampedArray(16).fill(255), contentHeight: height, sliceTop: 0, displayWidth: 390,
      displayHeight: Math.min(height, 1400), text: 'Sample', elapsed: 1, bytes: 1024, size: 10000, requests: 1});
    fixture.detectChanges();
  }
  it('mounts only when the parent supplies a source; defaults to Original on desktop', () => {
    mount(''); expect(workers.length).toBe(0);
    fixture.componentRef.setInput('pdfSrc', '/books/sample.pdf'); fixture.detectChanges(); frame();
    expect(workers.length).toBe(1);
    workers[0].emit({type: 'ready'});
    expect(workers[0].sent[0].options.reading).toBeFalse();
    expect(window.Worker).toHaveBeenCalledWith('/assets/pdf-reader/mupdf-worker.mjs', {type: 'module'});
  });
  it('defaults to Reading on compact mobile screens, including touch landscape', () => {
    (window.matchMedia as jasmine.Spy).and.callFake(query => ({
      matches: query === '(max-width: 600px), (max-height: 500px) and (pointer: coarse)'
    }));
    const {c, worker} = opened();
    expect(c.reading).toBeTrue();
    expect(worker.sent[0].options.reading).toBeTrue();
  });
  it('allows a manual mode change without resetting it on resize, but resets on the next PDF', () => {
    const {c} = opened();
    c.setReading(true);
    Object.defineProperty(c.paperStage!.nativeElement, 'clientWidth', {value: 900});
    c['resize']();
    expect(c.reading).toBeTrue();
    fixture.componentRef.setInput('pdfSrc', '/books/second.pdf'); fixture.detectChanges(); frame();
    expect(c.reading).toBeFalse();
  });
  it('accepts prepared PDFs under cache without changing their public URL', () => {
    const {worker} = opened('/cache/uuid/uuid.pdf');
    expect(worker.sent[0].url).toBe(window.location.origin + '/cache/uuid/uuid.pdf');
    expect(fixture.nativeElement.querySelector('a[download]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[aria-label="Descargar diagnostico de voz"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.reader-header h1')).toBeNull();
    expect(fixture.nativeElement.querySelector('.reader-header').textContent).not.toContain('uuid.pdf');
  });
  it('rejects external or non-library sources before making requests', () => {
    const c = mount('https://other.test/books/file.pdf');
    expect(workers.length).toBe(0); expect(c.error).toContain('ruta');
    fixture.componentRef.setInput('pdfSrc', '/api/users'); fixture.detectChanges(); frame();
    expect(workers.length).toBe(0);
  });
  it('releases the worker and canvases when the modal clears its source, ignoring late results', () => {
    const {c, worker} = opened(); respond(worker);
    expect(fixture.nativeElement.querySelector('canvas')).not.toBeNull();
    fixture.componentRef.setInput('pdfSrc', ''); fixture.detectChanges();
    expect(worker.terminated).toBeTrue(); expect(c.busy).toBeFalse();
    worker.emit({type: 'ready'});
    expect(fixture.nativeElement.querySelector('canvas')).toBeNull();
    expect(c['openFrame']).toBeUndefined();expect(c['scrollFrame']).toBeUndefined();
    frame();expect(workers.length).toBe(1);expect(worker.terminated).toBeTrue();
  });
  it('replaces a source in place without accepting the previous document response', () => {
    const {worker} = opened(); const previous = worker.sent.at(-1);
    fixture.componentRef.setInput('pdfSrc', '/books/second.pdf'); fixture.detectChanges(); frame();
    expect(worker.terminated).toBeTrue(); expect(workers.length).toBe(2);
    worker.emit({type: 'open', id: previous.id, pages: 9999});
    expect(fixture.componentInstance.pages).toBe(0);
    expect(fixture.componentInstance.documentUrl).toBe(window.location.origin + '/books/second.pdf');
  });
  it('serializes renders and discards old mode results', () => {
    const {c, worker} = opened(); const count = worker.sent.length;
    c.setReading(true); expect(worker.sent.length).toBe(count);
    respond(worker); expect(worker.sent.length).toBe(count + 1);
    expect(worker.sent.at(-1).options.reading).toBeTrue(); expect(c.views.every(v => !v.ready)).toBeTrue();
    respond(worker); expect(c.views.some(v => v.ready)).toBeTrue();
  });
  it('updates the native settings panel and retains a validated outline', () => {
    const {c} = opened(); c.openPanel(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('dialog.reading-settings').open).toBeTrue();
    expect(c.outline.map(x => x.title)).toEqual(['Chapter']);
    c.closePanel(); expect(fixture.nativeElement.querySelector('dialog.reading-settings').open).toBeFalse();
  });
  it('keeps selected pages mounted while scrolling, then releases them when the selection clears', () => {
    const {c, worker} = opened(); respond(worker);
    const layer = fixture.nativeElement.querySelector('.pdf-text-layer') as HTMLElement;
    layer.textContent = 'Selected passage';
    layer.dataset['speechRevision']='a'.repeat(64);layer.dataset['speechLength']='16';
    const range = document.createRange(); range.selectNodeContents(layer);
    const selection = document.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    c.onSelectionChange(); expect(c.selectedText).toBe('Selected passage');
    c.paperStage!.nativeElement.scrollTop = c.model.top(20);
    c.onPaperScroll(); frame();
    expect(c.views.some(v => v.page === 0)).toBeTrue();
    expect(fixture.nativeElement.querySelector('.pdf-text-layer')).toBe(layer);
    expect(selection.toString()).toBe('Selected passage');
    const data = new DataTransfer(), copy = new ClipboardEvent('copy', {clipboardData: data, cancelable: true});
    c.copySelection(copy); expect(copy.defaultPrevented).toBeTrue();
    expect(data.getData('text/plain')).toBe('Selected passage');
    selection.removeAllRanges(); c.onSelectionChange(); c.onPaperScroll(); frame();
    expect(c.selectedText).toBe(''); expect(c.views.some(v => v.page === 0)).toBeFalse();
  });
  it('supports native word selection with the actual positioned glyph styles', () => {
    const {c, worker} = opened(); respond(worker);
    const layer = fixture.nativeElement.querySelector('.pdf-text-layer') as HTMLElement;
    renderPdfTextLayer(layer, [Array.from('Hola mundo').map((text, x) => ({text,
      quad: [x * 12, 0, x * 12 + 12, 0, x * 12, 20, x * 12 + 12, 20]}))]);
    layer.dataset['speechRevision']='b'.repeat(64);layer.dataset['speechLength']='11';
    const first = layer.querySelector('.pdf-text-run') as HTMLElement;
    expect(getComputedStyle(first).position).toBe('relative');
    const selection = document.getSelection()!;
    selection.collapse(first.firstChild, 0);
    selection.modify('extend', 'forward', 'word');
    c.onSelectionChange();
    expect(c.selectedText).toBe('Hola');
    selection.removeAllRanges();
  });
  it('keeps native caret hit-testing in the intended line at margins and paragraph gaps', () => {
    mount();
    const layer = document.createElement('div');
    layer.className = 'pdf-text-layer'; layer.dataset['page'] = '0';
    layer.style.cssText = 'position:fixed;left:0;top:0;width:390px;height:460px;z-index:2147483647';
    fixture.nativeElement.appendChild(layer);
    const texts = ['Primera linea del primer parrafo.', 'Segunda linea, termina aqui.', 'Otro parrafo, no seleccionar.'];
    renderPdfTextLayer(layer, texts.map((line, i) => Array.from(line).map((text, x) => ({text,
      quad: [20 + x * 10, [40,80,240][i], 30 + x * 10, [40,80,240][i],
        20 + x * 10, [60,100,260][i], 30 + x * 10, [60,100,260][i]]}))));
    const rows = [...layer.querySelectorAll('.pdf-text-line')];
    const selection = document.getSelection()!;
    try {
      const start = rows[0].querySelector('.pdf-text-run')!.firstChild!;
      for (const [x, y, expected] of [[370,50,0], [5,50,0], [370,90,1], [5,90,1], [250,150,1], [370,250,2]]) {
        const caret = document.caretRangeFromPoint(x, y)!;
        const element = caret.startContainer.nodeType === Node.ELEMENT_NODE ? caret.startContainer as Element : caret.startContainer.parentElement!;
        expect(element.closest('.pdf-text-line')).withContext(`caret ${x},${y}`).toBe(rows[expected]);
      }
      const end = document.caretRangeFromPoint(370, 50)!;
      const range = document.createRange(); range.setStart(start, 0); range.setEnd(end.startContainer, end.startOffset);
      selection.removeAllRanges(); selection.addRange(range);
      expect(pdfSelection(fixture.nativeElement).text).toBe(texts[0]);
      expect(selection.toString()).toBe(texts[0]);
      const left = document.caretRangeFromPoint(5, 50)!;
      selection.setBaseAndExtent(end.startContainer, end.startOffset, left.startContainer, left.startOffset);
      expect(pdfSelection(fixture.nativeElement).text).toBe(texts[0]);
      const word = rows[0].querySelector('.pdf-text-run')!.getBoundingClientRect();
      expect(word.left).toBeCloseTo(20, 0); expect(word.top).toBeCloseTo(40, 0);
    } finally { selection.removeAllRanges(); layer.remove(); }
  });
  it('preserves the legacy night preference without modifying other reader storage', () => {
    storage.set('libretorio:pdf:night:v1', '1'); storage.set('audio:volume', '0.5');
    const c = mount(); expect(c.dark).toBeTrue(); c.toggleDark();
    expect(JSON.parse(storage.get(key)!).dark).toBeFalse();
    expect(storage.get('audio:volume')).toBe('0.5'); expect(storage.get('libretorio:pdf:night:v1')).toBe('1');
  });
  it('validates preferences and controls and tolerates blocked storage', () => {
    storage.set(key, JSON.stringify({fontSize: -1, fontFamily: 'invalid', pageMargin: 999, fullWidth: 'yes'}));
    const c = mount(); expect(c.fontSize).toBe(20); expect(c.fontFamily).toBe('serif'); expect(c.fullWidth).toBeFalse();
    (Storage.prototype.setItem as jasmine.Spy).and.throwError('blocked');
    expect(() => c.toggleDark()).not.toThrow(); c.setFont(100); expect(c.fontSize).toBe(20);
  });
  it('adapts to desktop width and preserves mobile layout', () => {
    const {c} = opened();
    (window.matchMedia as jasmine.Spy).and.returnValue({matches: false} as MediaQueryList);
    Object.defineProperty(c.paperStage!.nativeElement, 'clientWidth', {value: 1425});
    c.changeWidth({target: {value: 'full'}} as unknown as Event);
    expect((c as any).options().layoutWidth).toBe(1425); expect(c.zoom).toBe(1);
    (window.matchMedia as jasmine.Spy).and.returnValue({matches: true});
    Object.defineProperty(c.paperStage!.nativeElement, 'clientWidth', {value: 375});
    expect((c as any).options().layoutWidth).toBe(375);
    c.changeWidth({target: {value: 'column'}} as unknown as Event);
    expect((c as any).options().layoutWidth).toBe(375);
  });
  it('shows HTTP failures rather than keeping the loading indicator forever', () => {
    const c = mount(), w = workers[0]; w.emit({type: 'ready'});
    w.emit({type: 'error', id: w.sent[0].id, error: 'HTTP 401'}); fixture.detectChanges();
    expect(c.busy).toBeFalse(); expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain('401');
  });
  it('reports worker startup failure and cancels deferred opening on destruction', () => {
    (window.Worker as unknown as jasmine.Spy).and.throwError('CSP');
    const c = mount(); expect(c.busy).toBeFalse(); expect(c.error).toContain('motor PDF');
    fixture.componentRef.setInput('pdfSrc', '/books/other.pdf'); fixture.detectChanges(); fixture.destroy();
    expect(c['openFrame']).toBeUndefined();expect(c['scrollFrame']).toBeUndefined();
  });
});

describe('PDF continuous page window', () => {
  it('holds only nearby pages and keeps the anchor when a preceding height changes', () => {
    const model = new ContinuousPages(); model.reset(10000, 700);
    const old = model.top(5000) + 123;
    expect(model.window(old, 700).length).toBeLessThanOrEqual(4);
    expect(model.measure(4999, 2000, old)).toBe(model.top(5000) + 123);
    expect(model.locate(model.total - 1)).toBe(9999);
  });
});
