export type EpubAlignment = 'original' | 'left' | 'justify';
export const epubAlignment = (value: unknown): EpubAlignment =>
  value === 'left' || value === 'justify' ? value : 'original';

const styleId = 'libretorio-prose-alignment';
const marker = 'data-libretorio-justified-prose';
const injectedLanguages = new WeakMap<Document, string>();
const specialBlock = /^(poem|poema|poetry|verse|verso|stanza|estrofa|cita|dedicatoria)([-_].*)?$/i;

export function applyEpubAlignment(doc: Document, layout: string | undefined,
  alignment: EpubAlignment, language?: string): void {
  doc.getElementById(styleId)?.remove();
  doc.querySelectorAll(`[${marker}]`).forEach(element => element.removeAttribute(marker));
  const injected = injectedLanguages.get(doc);
  if (injected && doc.documentElement.getAttribute('lang') === injected) doc.documentElement.removeAttribute('lang');
  injectedLanguages.delete(doc);
  if (layout !== 'reflowable' || alignment === 'original' || !doc.defaultView) return;

  // Override only prose already justified by the book, not its other alignments.
  for (const paragraph of Array.from(doc.querySelectorAll('p'))) {
    if (paragraph.closest('blockquote,pre,code,table,figure,header,nav')) continue;
    let special = false;
    for (let ancestor: Element | null = paragraph; ancestor; ancestor = ancestor.parentElement) {
      if (Array.from(ancestor.classList).some(name => specialBlock.test(name)) ||
          /\b(verse|poem|z3998:poem|z3998:verse)\b/.test(ancestor.getAttribute('epub:type') ?? '')) {
        special = true; break;
      }
    }
    const style = doc.defaultView.getComputedStyle(paragraph);
    if (!special && style.textAlign === 'justify' && !style.whiteSpace.startsWith('pre') &&
        parseFloat(style.textIndent) >= 0) paragraph.setAttribute(marker, '');
  }
  if (!doc.querySelector(`[${marker}]`)) return;
  if (language && /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(language) &&
      !doc.documentElement.hasAttribute('lang') && !doc.documentElement.hasAttribute('xml:lang')) {
    doc.documentElement.setAttribute('lang', language);
    injectedLanguages.set(doc, language);
  }
  const style = doc.createElement('style');
  style.id = styleId;
  style.textContent = `p[${marker}] { text-align: ${alignment} !important;${alignment === 'justify' ? ' -webkit-hyphens: auto !important; hyphens: auto !important;' : ''} }`;
  doc.head.appendChild(style);
}
