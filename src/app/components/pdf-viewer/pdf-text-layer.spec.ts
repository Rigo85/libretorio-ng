import {pdfSelection, PdfTextLines, renderPdfTextLayer} from './pdf-text-layer';

describe('PDF native text selection', () => {
  let root: HTMLElement;
  beforeEach(() => { root = document.createElement('div'); document.body.appendChild(root); });
  afterEach(() => { document.getSelection()?.removeAllRanges(); root.remove(); });
  function layer(page: number, text = 'Hola mundo') {
    const element = document.createElement('div');
    element.className = 'pdf-text-layer'; element.dataset['page'] = String(page); root.appendChild(element);
    const lines: PdfTextLines = text.split('\n').map((line, y) => Array.from(line).map((text, x) => ({
      text, quad: [x * 10, y * 20, x * 10 + 10, y * 20, x * 10, y * 20 + 20, x * 10 + 10, y * 20 + 20]
    })));
    renderPdfTextLayer(element, lines); return element;
  }
  function select(from: Node, to: Node) {
    const range = document.createRange(); range.setStart(from, 0); range.setEnd(to, to.textContent!.length);
    const selection = document.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  }
  it('creates native text nodes without interpreting document text as HTML', () => {
    const element = layer(0, '<img> texto');
    expect(element.querySelector('img')).toBeNull();
    expect(element.textContent).toBe('<img> texto');
    expect(element.querySelectorAll('.pdf-text-run').length).toBe(3);
    const chars = element.querySelectorAll('.pdf-text-run');
    select(chars[2].firstChild!, chars[2].firstChild!);
    expect(pdfSelection(root).text).toBe('texto');
    expect(document.getSelection()!.toString()).toBe('texto');
  });
  it('copies only selected text, retaining line breaks and source page order', () => {
    const first = layer(1, 'Hola\nmundo'), second = layer(2, 'Otro texto');
    select(first.querySelector('.pdf-text-run')!.firstChild!, second.querySelector('.pdf-text-run')!.firstChild!);
    expect(pdfSelection(root)).toEqual({text: 'Hola\nmundo\n\nOtro', pages: [1, 2]});
  });
  it('ignores selections outside the reader or collapsed carets', () => {
    const element = layer(0), text = document.createTextNode('outside'); document.body.appendChild(text);
    try {
      select(element.querySelector('.pdf-text-run')!.firstChild!, text);
      expect(pdfSelection(root).text).toBe('');
      document.getSelection()!.collapse(text, 0);
      expect(pdfSelection(root).pages).toEqual([]);
    } finally { text.remove(); }
  });
});
