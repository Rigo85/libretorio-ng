const styleId = 'libretorio-mobile-margins';

export function applyMobileEpubMargins(document: Document, layout: string | undefined): void {
  if (layout !== 'reflowable' || document.getElementById(styleId)) return;
  // A stylesheet survives EPUB.js reapplying inline padding during layout/resize.
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = '@media (max-width: 767px) { body { padding-left: 12px !important; padding-right: 12px !important; } }';
  document.head.appendChild(style);
}
