export type PdfTextGlyph = {text: string; quad: number[]; font?: string};
export type PdfTextLines = PdfTextGlyph[][];

function wordQuad(glyphs: PdfTextGlyph[]): number[] {
  const q = glyphs[0].quad;
  const uw = Math.hypot(q[2] - q[0], q[3] - q[1]) || 1, vh = Math.hypot(q[4] - q[0], q[5] - q[1]) || 1;
  const ux = (q[2] - q[0]) / uw, uy = (q[3] - q[1]) / uw;
  const vx = (q[4] - q[0]) / vh, vy = (q[5] - q[1]) / vh;
  const det = ux * vy - uy * vx;
  if (Math.abs(det) < 0.0001) return q;
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const glyph of glyphs) for (let i = 0; i < 8; i += 2) {
    const x = glyph.quad[i] - q[0], y = glyph.quad[i + 1] - q[1];
    const u = (x * vy - y * vx) / det, v = (ux * y - uy * x) / det;
    left = Math.min(left, u); right = Math.max(right, u); top = Math.min(top, v); bottom = Math.max(bottom, v);
  }
  return [[left, top], [right, top], [left, bottom], [right, bottom]]
    .flatMap(([u, v]) => [q[0] + ux * u + vx * v, q[1] + uy * u + vy * v]);
}

// Whole words keep native long-press selection intact; their boxes follow MuPDF's glyph quads.
export function renderPdfTextLayer(container: HTMLElement, lines: PdfTextLines): void {
  const doc = container.ownerDocument;
  const context = doc.createElement('canvas').getContext('2d');
  if (!context) return;
  const widths = new Map<string, number>();
  const fragment = doc.createDocumentFragment();
  for (const line of lines) {
    const row = doc.createElement('span');
    row.className = 'pdf-text-line';
    const valid = line.filter(glyph => glyph.text && glyph.quad.length === 8 && glyph.quad.every(Number.isFinite));
    if (!valid.length) continue;
    let top = Infinity, left = Infinity, bottom = -Infinity, right = -Infinity;
    for (const glyph of valid) for (let i = 0; i < 8; i += 2) {
      left = Math.min(left, glyph.quad[i]); right = Math.max(right, glyph.quad[i]);
      top = Math.min(top, glyph.quad[i + 1]); bottom = Math.max(bottom, glyph.quad[i + 1]);
    }
    const first = valid[0].quad;
    const horizontal = Math.abs(first[2] - first[0]) >= Math.abs(first[3] - first[1]);
    const rowLeft = horizontal ? 0 : left;
    row.style.left = `${rowLeft}px`; row.style.top = `${top}px`;
    row.style.width = horizontal ? '100%' : `${right - left}px`;
    row.style.height = `${bottom - top}px`;
    let cursor = 0;
    const words: PdfTextGlyph[][] = [];
    for (const glyph of valid) {
      const previous = words.at(-1), last = previous?.at(-1);
      if (!last || /\s/u.test(last.text) !== /\s/u.test(glyph.text) || last.font !== glyph.font) words.push([glyph]);
      else previous!.push(glyph);
    }
    for (const word of words) {
      const q = wordQuad(word), text = word.map(glyph => glyph.text).join('');
      const font = word[0].font ?? '20px sans-serif';
      context.font = font;
      const key = `${font}:${text}`;
      const width = widths.get(key) ?? Math.max(0.01, context.measureText(text).width);
      widths.set(key, width);
      const span = doc.createElement('span');
      span.textContent = text;
      span.className = 'pdf-text-run'; span.dir = 'auto';
      span.style.font = font; span.style.lineHeight = '20px';
      span.style.width = `${width}px`;
      if (horizontal) {
        // Keep words in the line's native flow so margin/whitespace hit-testing stays on this line.
        const wordLeft = Math.min(q[0], q[2], q[4], q[6]), wordRight = Math.max(q[0], q[2], q[4], q[6]);
        const box = doc.createElement('span'); box.className = 'pdf-text-word';
        box.style.marginLeft = `${wordLeft - cursor}px`;
        box.style.width = `${wordRight - wordLeft}px`; box.style.height = `${bottom - top}px`;
        span.style.transform = `matrix(${(q[2] - q[0]) / width},${(q[3] - q[1]) / width},${(q[4] - q[0]) / 20},${(q[5] - q[1]) / 20},${q[0] - wordLeft},${q[1] - top})`;
        box.appendChild(span); row.appendChild(box); cursor = wordRight;
      } else {
        span.style.transform = `matrix(${(q[2] - q[0]) / width},${(q[3] - q[1]) / width},${(q[4] - q[0]) / 20},${(q[5] - q[1]) / 20},${q[0] - rowLeft},${q[1] - top})`;
        row.appendChild(span);
      }
    }
    const end = doc.createElement('br');
    if (!horizontal) {
      end.style.position = 'absolute';
      end.style.left = `${valid.at(-1)!.quad[2] - rowLeft}px`;
      end.style.top = `${valid.at(-1)!.quad[3] - top}px`;
    }
    row.appendChild(end);
    fragment.appendChild(row);
  }
  container.replaceChildren(fragment);
}

function endpointLayer(node: Node | null, root: HTMLElement): HTMLElement | null {
  const element = node?.nodeType === Node.ELEMENT_NODE ? node as Element : node?.parentElement;
  const layer = element?.closest<HTMLElement>('.pdf-text-layer') ?? null;
  return layer && root.contains(layer) ? layer : null;
}

export function pdfSelection(root: HTMLElement, selection = root.ownerDocument.getSelection(), includeText = true): {text: string; pages: number[]} {
  if (!selection || selection.isCollapsed || !selection.rangeCount ||
      !endpointLayer(selection.anchorNode, root) || !endpointLayer(selection.focusNode, root)) return {text: '', pages: []};
  const range = selection.getRangeAt(0), pages: number[] = [], pieces: string[] = [];
  for (const layer of root.querySelectorAll<HTMLElement>('.pdf-text-layer')) {
    if (!range.intersectsNode(layer)) continue;
    pages.push(Number(layer.dataset['page']));
    if (!includeText) continue;
    const local = range.cloneRange();
    if (!layer.contains(range.startContainer)) local.setStart(layer, 0);
    if (!layer.contains(range.endContainer)) local.setEnd(layer, layer.childNodes.length);
    const content = local.cloneContents();
    content.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    pieces.push(content.textContent ?? '');
  }
  return {text: pieces.join('\n').trim(), pages};
}
