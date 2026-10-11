import { ComponentFixture, TestBed } from '@angular/core/testing';
import {bookFixture} from '../../testing/book-fixture';
import {FileCheckService} from '../../services/file-check.service';
import {of, Subject, throwError} from 'rxjs';
import {provideHttpClient} from '@angular/common/http';
import {provideNoopAnimations} from '@angular/platform-browser/animations';
import {BooksService, PreparedPdfResponse} from '../../services/books.service';
import {FileKind, getTitle} from '../../core/headers';

import { BookDetailsPanelComponent } from './book-details-panel.component';
import {ReadingService} from '../../services/reading.service';

describe('BookDetailsPanelComponent', () => {
  let component: BookDetailsPanelComponent;
  let fixture: ComponentFixture<BookDetailsPanelComponent>;
  let owner:HTMLElement,foreign:HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BookDetailsPanelComponent],
      providers: [provideHttpClient(), provideNoopAnimations()]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BookDetailsPanelComponent);
    foreign=document.createElement('div');foreign.id='bookDetailsModal';foreign.className='modal';
    const foreignReader=document.createElement('div');foreignReader.id='readModal';foreign.append(foreignReader);
    owner=document.createElement('div');owner.id='historyBookDetailsModal';owner.className='modal';owner.style.display='block';
    document.body.append(foreign,owner);owner.append(fixture.nativeElement);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('file', bookFixture());
    spyOn(TestBed.inject(FileCheckService), 'checkFileExists').and.returnValue(of(false));
    fixture.detectChanges();
  });
  afterEach(()=>{fixture.destroy();owner.remove();foreign.remove();});

  it('listens only to its owning details modal and removes those listeners on destruction',()=>{
    const visit=spyOn(TestBed.inject(ReadingService),'visit').and.resolveTo();
    foreign.dispatchEvent(new Event('shown.bs.modal'));expect(visit).not.toHaveBeenCalled();
    owner.dispatchEvent(new Event('shown.bs.modal'));expect(visit).toHaveBeenCalledOnceWith(bookFixture().id);
    fixture.nativeElement.querySelector('#readModal').dispatchEvent(new Event('shown.bs.modal',{bubbles:true}));
    expect(visit).toHaveBeenCalledTimes(1);
    fixture.destroy();owner.dispatchEvent(new Event('shown.bs.modal'));expect(visit).toHaveBeenCalledTimes(1);
  });
  it('ignores reader events from a different component with the same reader ID',()=>{
    foreign.querySelector('#readModal')!.dispatchEvent(new Event('shown.bs.modal'));
    expect(component.stringSource).toBe('');
    fixture.nativeElement.querySelector('#readModal').dispatchEvent(new Event('shown.bs.modal'));
    expect(component.stringSource).not.toBe('');
    fixture.nativeElement.querySelector('#readModal').dispatchEvent(new Event('hidden.bs.modal'));
    expect(component.stringSource).toBe('');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  function select(name: string, kind = FileKind.FILE) {
    fixture.componentRef.setInput('file', {...bookFixture(), name, fileKind: kind});
    fixture.detectChanges();
  }
  function lookup() { return spyOn(TestBed.inject(BooksService), 'getPreparedPdf'); }
  it('routes activity reader requests without changing the catalogue modal behavior',()=>{
    component.readerOutlet=document.createElement('div');
    const original=spyOn(component.readerRequested,'emit');
    component.onRead();expect(original).toHaveBeenCalledOnceWith('original');
    component.pdfState='failed';component.onConvertToPdf();expect(original).toHaveBeenCalledTimes(1);
    component.pdfState='ready';component.onConvertToPdf();expect(original).toHaveBeenCalledWith('pdf-preparado');
  });
  it('validates managed readers and preserves the read/listen audit',async()=>{
    const managed={visible:jasmine.createSpy('visible').and.resolveTo(),dispose:()=>Promise.resolve()};
    (component as any).managedReader=managed;
    const audit=spyOn(TestBed.inject(BooksService),'logAction');
    select('audio.m4b');await component.showManagedReader('original');
    expect(audit).toHaveBeenCalledOnceWith('Listen to','audio.m4b',component.file.id);
    lookup().and.returnValue(of({success:'ERROR',code:'PDF_UNAVAILABLE'}));
    select('book.docx');
    await expectAsync(component.showManagedReader('original')).toBeRejectedWithError('READER_UNAVAILABLE');
    await expectAsync(component.showManagedReader('pdf-preparado','/cache/other.pdf')).toBeRejectedWithError('PDF_NOT_READY');
    expect(managed.visible).toHaveBeenCalledTimes(1);
    const path=`/cache/${component.file.coverId}/${component.file.coverId}.pdf`;
    await component.showManagedReader('pdf-preparado',path);
    expect(component.stringSource).toBe(path);expect(component.isUsingPdfConversion).toBeTrue();
    expect(audit).toHaveBeenCalledWith('Read','book.docx',component.file.id);
  });
  it('labels the reader modal with the existing cleaned catalog title, including prepared PDFs', () => {
    lookup().and.returnValue(of({success:'OK', pdfPath:`/cache/${bookFixture().coverId}/${bookFixture().coverId}.pdf`}));
    for (const name of ['book.pdf', 'book.epub', 'book.docx']) {
      const file = {...bookFixture(), name, webDetails:{title:'  El libro   del catalogo  '}};
      fixture.componentRef.setInput('file', file); fixture.detectChanges();
      const modal = fixture.nativeElement.querySelector('#readModal') as HTMLElement;
      const heading = modal.querySelector('#' + modal.getAttribute('aria-labelledby')) as HTMLElement;
      expect(heading.textContent).toBe(getTitle(file)); expect(heading.title).toBe(getTitle(file));
      expect(heading.textContent).not.toContain(file.coverId);
    }
  });
  it('keeps long titles and the close button in one compact PDF header at mobile and desktop widths', () => {
    fixture.componentRef.setInput('file', {...bookFixture(), webDetails:{title:'Un titulo muy largo '.repeat(30)}});
    fixture.detectChanges();
    const modal = fixture.nativeElement.querySelector('#readModal') as HTMLElement;
    modal.style.display = 'block';
    for (const width of [320, 390, 1440]) {
      modal.style.width = width + 'px';
      const header = modal.querySelector('.modal-header')!.getBoundingClientRect();
      const title = modal.querySelector('.reader-title')!.getBoundingClientRect();
      const close = modal.querySelector('.btn-close')!.getBoundingClientRect();
      expect(title.width).toBeGreaterThan(0); expect(title.right).toBeLessThanOrEqual(close.left);
      expect(close.right).toBeLessThanOrEqual(header.right); expect(header.height).toBeLessThanOrEqual(49);
      expect(getComputedStyle(modal.querySelector('.reader-title')!).textOverflow).toBe('ellipsis');
    }
  });
  it('limits the compact reader layout to native and prepared PDFs', () => {
    const modal = () => fixture.nativeElement.querySelector('#readModal') as HTMLElement;
    select('book.pdf'); expect(modal().classList.contains('pdf-reader-modal')).toBeTrue();
    for (const name of ['book.epub', 'audio.m4a', 'comic.cbz']) {
      select(name); expect(modal().classList.contains('pdf-reader-modal')).toBeFalse();
    }
    lookup().and.returnValue(of({success:'OK', pdfPath:`/cache/${bookFixture().coverId}/${bookFixture().coverId}.pdf`}));
    select('book.docx'); component._isUsingPdfConversion = true; fixture.detectChanges();
    expect(modal().classList.contains('pdf-reader-modal')).toBeTrue();
  });
  it('never asks for PDF conversion for EPUB files, EPUB directories or native PDF', () => {
    const get = lookup();
    for (const [name, kind] of [['book.EPUB', FileKind.FILE], ['expanded.doc', FileKind.EPUB], ['book.pdf', FileKind.FILE]] as const) {
      select(name, kind);
      expect(component.isConvertToPdf).toBeFalse();
      expect(component.isDisabled).toBeFalse();
    }
    expect(get).not.toHaveBeenCalled();
  });
  it('enables opening only after a ready reply and rechecks at click time', () => {
    const pdfPath = `/cache/${bookFixture().coverId}/${bookFixture().coverId}.pdf`;
    const get = lookup().and.returnValues(of({success: 'OK', pdfPath}), of({success: 'ERROR', code: 'PDF_STALE'}));
    const read = spyOn(component, 'onRead');
    select('book.doc');
    expect(component.pdfState).toBe('ready');
    component.onConvertToPdf();
    expect(get).toHaveBeenCalledTimes(2);
    expect(component.pdfState).toBe('unavailable');
    expect(component.isUsingPdfConversion).toBeFalse();
    expect(read).not.toHaveBeenCalled();
  });
  it('opens the canonical PDF only after the second valid reply', () => {
    const pdfPath = `/cache/${bookFixture().coverId}/${bookFixture().coverId}.pdf`;
    lookup().and.returnValue(of({success: 'OK', pdfPath}));
    const read = spyOn(component, 'onRead');
    select('book.DOCX');
    component.onConvertToPdf();
    expect(component.stringSource).toBe(pdfPath);
    expect(component.isUsingPdfConversion).toBeTrue();
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('keeps failed and pending conversions disabled with a visible explanation', () => {
    const get = lookup();
    for (const code of ['PDF_PENDING', 'PDF_FAILED', 'PDF_UNAVAILABLE', 'PDF_STALE']) {
      get.and.returnValue(of({success: 'ERROR', code}));
      select('book.doc');
      const button = [...fixture.nativeElement.querySelectorAll('button')].find((node: any) => node.textContent.includes('Abrir PDF')) as HTMLButtonElement;
      expect(button.disabled).toBeTrue();
      expect(component.pdfStatusMessage).not.toBe('');
    }
  });
  it('does not accept another book URL or treat a network error as ready', () => {
    const get = lookup().and.returnValue(of({success: 'OK', pdfPath: '/cache/another.pdf'}));
    select('book.txt');
    expect(component.pdfState).toBe('unavailable');
    get.and.returnValue(throwError(() => new Error('network')));
    component.checkPreparedPdf();
    expect(component.pdfState).toBe('unavailable');
  });
  it('cancels late replies when changing books, closing details or destroying the component', () => {
    const reply = new Subject<PreparedPdfResponse>();
    lookup().and.returnValue(reply);
    select('one.doc');
    expect(reply.observed).toBeTrue();
    select('book.epub');
    expect(reply.observed).toBeFalse();
    select('two.doc');
    owner.dispatchEvent(new Event('hidden.bs.modal'));
    expect(reply.observed).toBeFalse();
    select('three.doc');
    fixture.destroy();
    expect(reply.observed).toBeFalse();
  });
});
