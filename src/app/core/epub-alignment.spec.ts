import {applyEpubAlignment, epubAlignment} from './epub-alignment';

describe('EPUB prose alignment', () => {
  let frame: HTMLIFrameElement;
  let doc: Document;
  const align = (id: string) => frame.contentWindow!.getComputedStyle(doc.getElementById(id)!).textAlign;
  beforeEach(() => {
    frame = document.createElement('iframe');
    frame.style.width = '390px';
    document.body.append(frame);
    doc = frame.contentDocument!;
    doc.head.innerHTML = '<style>p { text-align:justify; text-indent:1.5em; line-height:1.25em; }</style>';
    doc.body.innerHTML = '<h1 id="title">Titulo</h1><p id="prose">Texto de prueba para justificar.</p>' +
      '<p id="center" style="text-align:center">Centrado</p><p id="left" style="text-align:left">Original izquierdo</p>' +
      '<div class="poema"><p id="verse">Verso</p></div><blockquote><p id="quote">Cita</p></blockquote>' +
      '<p id="hanging" style="text-indent:-1em">Sangria francesa</p><p id="pre" style="white-space:pre-wrap">Verso\nSegundo verso</p>';
  });
  afterEach(() => frame.remove());
  it('changes justified prose only, preserves text, and restores the original styles', () => {
    const original = doc.body.innerHTML;
    const text = doc.body.textContent;
    applyEpubAlignment(doc, 'reflowable', 'left', 'es');
    expect(align('prose')).toBe('left');
    expect(align('center')).toBe('center');
    expect(align('left')).toBe('left');
    for (const id of ['verse', 'quote', 'hanging', 'pre']) expect(align(id)).toBe('justify');
    expect(doc.body.textContent).toBe(text);
    expect(doc.documentElement.lang).toBe('es');
    applyEpubAlignment(doc, 'reflowable', 'justify', 'es');
    expect(align('prose')).toBe('justify');
    expect(frame.contentWindow!.getComputedStyle(doc.getElementById('prose')!).hyphens).toBe('auto');
    expect(align('left')).toBe('left');
    applyEpubAlignment(doc, 'reflowable', 'original', 'es');
    expect(align('prose')).toBe('justify');
    expect(doc.body.innerHTML).toBe(original);
    expect(doc.documentElement.hasAttribute('lang')).toBeFalse();
    expect(doc.querySelector('#libretorio-prose-alignment')).toBeNull();
  });
  it('preserves explicit document languages and produces one stylesheet on repeated changes', () => {
    doc.documentElement.setAttribute('xml:lang', 'fr');
    for (let i = 0; i < 3; i++) applyEpubAlignment(doc, 'reflowable', 'justify', 'es');
    expect(doc.documentElement.hasAttribute('lang')).toBeFalse();
    expect(doc.documentElement.getAttribute('xml:lang')).toBe('fr');
    expect(doc.querySelectorAll('#libretorio-prose-alignment').length).toBe(1);
    applyEpubAlignment(doc, 'reflowable', 'original', 'es');
    expect(doc.documentElement.getAttribute('xml:lang')).toBe('fr');
  });
  it('leaves fixed-layout books alone and rejects invalid stored values and language tags', () => {
    const original = doc.documentElement.outerHTML;
    for (const layout of ['pre-paginated', undefined]) applyEpubAlignment(doc, layout, 'left', 'es');
    expect(doc.documentElement.outerHTML).toBe(original);
    expect(epubAlignment('center')).toBe('original');
    expect(epubAlignment(null)).toBe('original');
    expect(epubAlignment('left')).toBe('left');
    applyEpubAlignment(doc, 'reflowable', 'justify', 'not a language');
    expect(doc.documentElement.hasAttribute('lang')).toBeFalse();
  });
  it('also applies to newly loaded chapters without adding text or wrappers', () => {
    applyEpubAlignment(doc, 'reflowable', 'left', 'es');
    doc.body.innerHTML = '<p id="new">Nuevo capitulo</p>';
    applyEpubAlignment(doc, 'reflowable', 'left', 'es');
    expect(align('new')).toBe('left');
    expect(doc.body.children.length).toBe(1);
  });
});
