import { AfterViewInit, Component, ElementRef, inject, Input, Output, EventEmitter, ChangeDetectorRef, OnChanges, OnDestroy, OnInit, SimpleChanges, ChangeDetectionStrategy } from "@angular/core";
import { AsyncPipe } from "@angular/common";
import { catchError, from, Observable, of, Subscription, take } from "rxjs";
import { DownloadService } from "(src)/app/services/download.service";
import { NgxSpinnerModule, NgxSpinnerService } from "ngx-spinner";

import { File, FileKind, getExtension } from "(src)/app/core/headers";
import { AuthorPipe } from "(src)/app/pipes/author.pipe";
import { TitlePipe } from "(src)/app/pipes/title.pipe";
import { DescriptionPipe } from "(src)/app/pipes/description.pipe";
import { SubjectPipe } from "(src)/app/pipes/subject.pipe";
import { FileCheckService } from "(src)/app/services/file-check.service";
import { PdfViewerComponent } from "(src)/app/components/pdf-viewer/pdf-viewer.component";
import { ExtensionPipe } from "(src)/app/pipes/extension.pipe";
import { EpubViewerComponent } from "(src)/app/components/epub-viewer/epub-viewer.component";
import { ComicViewerComponent } from "(src)/app/components/comic-viewer/comic-viewer.component";
import { BooksService } from "(src)/app/services/books.service";
import { ErrorMessageComponent } from "(src)/app/components/error-message/error-message.component";
import { FullPathPipe } from "(src)/app/pipes/full-path.pipe";
import { AudiobookViewerComponent } from "(src)/app/components/audiobook-viewer/audiobook-viewer.component";
import { StopPlayingService } from "(src)/app/services/stop-playing.service";
import {ReadingService} from '../../services/reading.service';
import {RoutedModal} from '../helpers/routed-modal';
import {ActivityView} from '../reading-home/activity-route';

declare var bootstrap: any;

@Component({
	selector: "book-details-panel",
	imports: [
    AuthorPipe,
    TitlePipe,
    DescriptionPipe,
    SubjectPipe,
    AsyncPipe,
    PdfViewerComponent,
    ExtensionPipe,
    EpubViewerComponent,
    ComicViewerComponent,
    NgxSpinnerModule,
    ErrorMessageComponent,
    FullPathPipe,
    AudiobookViewerComponent
],
	templateUrl: "./book-details-panel.component.html",
	changeDetection: ChangeDetectionStrategy.Eager,
	styleUrl: "./book-details-panel.component.scss"
})
export class BookDetailsPanelComponent implements OnInit, OnChanges, AfterViewInit, OnDestroy {
	@Input() file!: File;
	@Input() readerOutlet?: HTMLElement;
	@Output() readerRequested = new EventEmitter<ActivityView>();
	@Output() readerClosed = new EventEmitter<void>();
	private managedReader?: RoutedModal;
	private cdr = inject(ChangeDetectorRef);
	private host: ElementRef<HTMLElement> = inject(ElementRef);
	private detailsElement?: HTMLElement;
	private readerElement?: HTMLElement;
	downloadMessage: string = "";
	titleMessage: string = "Information";
	stringSource: string = "";
	comicPosition?: {current:number;total:number};
	extension: string = "N/A";
	disabledExtensions: string[] = ["pdf", "epub", "cbr", "cbz", "cb7", "cbt"];
	supportedComicExtensions: string[] = ["cbr", "cbz", "cb7", "cbt"];
	audioExtensions: string[] = ["mp3", "wav", "m4a", "m4b", "ogg", "flac"];
	imagesExtensions: string[] = ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg", "tiff"];
	convertToPdfExtensions: string[] = [
		"doc", "docx", "ppt", "pptx", "xls",
		"xlsx", "rtf", "txt", "html", "htm", "lit", "md"
	];
	_isUsingPdfConversion: boolean = false;
	private convertToPdfSub?: Subscription;
	pdfState: 'checking' | 'ready' | 'pending' | 'failed' | 'unavailable' = 'unavailable';
	pdfStatusMessage = '';
	private onDetailsShown = (event: Event) => {
		if(event.target !== this.detailsElement)return;
		if(!this.readerOutlet && this.file?.id!==undefined)void this.readingStore.visit(this.file.id).catch(()=>{});
		if (this.pdfState !== 'checking') this.checkPreparedPdf();
	};
	private onDetailsHidden = (event: Event) => {
		if(event.target !== this.detailsElement)return;
		this.convertToPdfSub?.unsubscribe();
		if (this.pdfState === 'checking') {
			this.pdfState = 'unavailable';
			this.pdfStatusMessage = 'PDF sin comprobar.';
		}
	};

	private onReaderShow = (event: Event) => {
		if(event.target === this.readerElement)this.comicPosition=undefined;
	};
	private onShownModal = (event: Event) => {
		if(event.target !== this.readerElement)return;
		this.stringSource = !this.stringSource ? this.getReaderSource(this.file) : this.stringSource;
	};

	private onHiddenModal = (event: Event) => {
		if(event.target !== this.readerElement)return;
		this.comicPosition=undefined;
		this.stringSource = "";
		this._isUsingPdfConversion = false;
		this.stopPlayingService.stopPlayingAudio();
		if(this.readerOutlet)this.readerClosed.emit();
	};

	constructor(
		private fileCheckService: FileCheckService,
		private downloadService: DownloadService,
		private booksService: BooksService,
		private spinner: NgxSpinnerService,
		private stopPlayingService: StopPlayingService,
		private readingStore:ReadingService) {}

	ngOnChanges(changes: SimpleChanges): void {
		if (changes["file"]) {
			this.comicPosition=undefined;
			this.convertToPdfSub?.unsubscribe();
			this.stringSource = '';
			this._isUsingPdfConversion = false;
			this.extension = getExtension(this.file);
			this.checkPreparedPdf();
		}
	}

	ngOnInit(): void {
		if (this.file) {
			this.extension = getExtension(this.file);
		}
	}

	ngAfterViewInit(): void {
		const details = this.detailsElement = this.host.nativeElement.closest<HTMLElement>('.modal') ?? undefined;
		details?.addEventListener('shown.bs.modal', this.onDetailsShown);
		details?.addEventListener('hidden.bs.modal', this.onDetailsHidden);
		const modalElement = this.readerElement = this.host.nativeElement.querySelector<HTMLElement>("#readModal") ?? undefined;
		if (modalElement) {
			if(this.readerOutlet){this.readerOutlet.append(modalElement);this.managedReader=new RoutedModal(modalElement);}
			modalElement.addEventListener("shown.bs.modal", this.onShownModal);
			modalElement.addEventListener("show.bs.modal", this.onReaderShow);
			modalElement.addEventListener("hidden.bs.modal", this.onHiddenModal);
		}
	}

	ngOnDestroy() {
		void this.managedReader?.dispose(true);
		const details = this.detailsElement;
		details?.removeEventListener('shown.bs.modal', this.onDetailsShown);
		details?.removeEventListener('hidden.bs.modal', this.onDetailsHidden);
		this._isUsingPdfConversion = false;
		this.convertToPdfSub?.unsubscribe();
		const modalElement = this.readerElement;
		if (modalElement) {
			modalElement.removeEventListener("shown.bs.modal", this.onShownModal);
			modalElement.removeEventListener("show.bs.modal", this.onReaderShow);
			modalElement.removeEventListener("hidden.bs.modal", this.onHiddenModal);
		}
	}

	get isAudioFile(): boolean {
		return this.file?.fileKind === FileKind.FILE && this.audioExtensions.includes(this.extension);
	}

	get isComicReaderCandidate(): boolean {
		if (!this.file) {
			return false;
		}

		return this.file.fileKind === FileKind.COMIC_MANGA
			|| (this.file.fileKind === FileKind.FILE && this.supportedComicExtensions.includes(this.extension));
	}

	get showReadButton(): boolean {
		if (!this.isComicReaderCandidate) {
			return true;
		}

		return this.file?.comicReaderReady === true;
	}

	get isDisabled(): boolean {
		if (!this.file) {
			return true;
		}

		if (this.isComicReaderCandidate) {
			return false;
		}

		return !this.disabledExtensions.includes(this.extension) &&
			!["EPUB", "COMIC-MANGA", "AUDIOBOOK"].includes(this.file.fileKind.toString()) &&
			!this.isAudioFile
			;
	}

	get isConvertToPdf(): boolean {
		return this.file?.fileKind === FileKind.FILE && this.convertToPdfExtensions.includes(this.extension);
	}

	get isUsingPdfConversion(): boolean {
		return this._isUsingPdfConversion;
	}

	checkFileExists(file: File): Observable<boolean> {
		if (this.imagesExtensions.includes(this.extension)) {
			return of(true);
		} else {
			return from(this.fileCheckService.checkFileExists(this.getCoverId(file)))
				.pipe(catchError(() => of(false)));
		}
	}

	getImageUrl(file: File): string {
		if (this.imagesExtensions.includes(this.extension)) {
			const parentPath = file.parentPath.split("dist/public")[1];
			return `${parentPath}/${file.name}`;
		} else {
			return `/covers/${this.getCoverId(file)}.webp`;
		}
	}

	getCoverId(file: File): string {
		const coverId = `${file.webDetails?.cover_i || "no-cover"}`;
		return !file.customDetails ? file.coverId : coverId;
	}

	onDownload(file: { parentPath: string; name: string, coverId: string, fileKind: FileKind }): void {
		let fileUrl: string;

		if (file.fileKind === FileKind.FILE) {
			fileUrl = `${file.parentPath}/${file.name}`;
		} else {
			fileUrl = `cache/${file.coverId}/${file.coverId}.zip`;
		}

		const encodedUrl = encodeURI(fileUrl);
		this.spinner.show();

		this.downloadService.checkFileAvailable(encodedUrl).pipe(
			take(1),
			catchError(() => {
				this.downloadMessage = "File not available for download.";
				this.messageDialog();
				return of(null);
			})
		).subscribe((result) => {
			this.spinner.hide();
			if (result !== null) {
				const a = document.createElement("a");
				a.href = encodedUrl;
				a.download = file.name;
				a.click();
				this.booksService.logAction("Download", this.file.name, this.file.id);
			}
		});
	}

	clearDownloadMessage() {
		this.downloadMessage = "";
		this.titleMessage = "Information";
	}

	messageDialog() {
		const modalElement = this.host.nativeElement.querySelector("#downloadConfirmationModal");
		if (modalElement) {
			const modal = new bootstrap.Modal(modalElement);
			modal.show();
		}
	}

	getStringSource(file: File): string {
		return file ? (file.parentPath + "/" + file.name) : "";
	}

	private getPublicSource(file: File): string {
		if (!file) {
			return "";
		}

		const parentPath = file.parentPath.split("dist/public")[1] ?? file.parentPath;
		return `${parentPath}/${file.name}`;
	}

	private getReaderSource(file: File): string {
		if (file?.fileKind === FileKind.AUDIOBOOK || this.isAudioFile) {
			return this.getStringSource(file);
		}

		return this.getPublicSource(file);
	}

	onRead() {
		if (!this.file) {
			return;
		}
		if(this.readerOutlet){this.readerRequested.emit('original');return;}

		const modalElement = this.host.nativeElement.querySelector("#readModal");
		if (modalElement) {
			this.booksService.logAction(
				this.file.fileKind === FileKind.AUDIOBOOK || this.isAudioFile ? "Listen to" : "Read",
				this.file.name,
				this.file.id
			);
			const modalInstance = bootstrap.Modal.getInstance(modalElement);
			if (modalInstance) {
				modalInstance.show();
			} else {
				// console.info("Modal instance not found, creating a new one.");
				const newModalInstance = new bootstrap.Modal(modalElement);
				newModalInstance.show();
			}
		}
	}

	onConvertToPdf() {
		if(this.readerOutlet){if(this.pdfState==='ready')this.readerRequested.emit('pdf-preparado');return;}
		if (this.pdfState === 'ready') this.checkPreparedPdf(true);
	}

	async showManagedReader(view: ActivityView, path?: string): Promise<void> {
		if(!this.managedReader)throw new Error('READER_NOT_READY');
		if(view==='pdf-preparado'){
			if(!this.isConvertToPdf || path!==`/cache/${this.file.coverId}/${this.file.coverId}.pdf`)throw new Error('PDF_NOT_READY');
			this._isUsingPdfConversion=true;this.stringSource=path;
		}else if(!this.showReadButton || this.isDisabled)throw new Error('READER_UNAVAILABLE');
		this.cdr.detectChanges();
		await this.managedReader.visible(true);
		this.booksService.logAction(
			this.file.fileKind === FileKind.AUDIOBOOK || this.isAudioFile ? "Listen to" : "Read",
			this.file.name,
			this.file.id
		);
	}
	hideManagedReader(): Promise<void> {return this.managedReader?.visible(false) ?? Promise.resolve();}

	checkPreparedPdf(open = false) {
		this.convertToPdfSub?.unsubscribe();
		this.pdfState = 'unavailable';
		this.pdfStatusMessage = '';
		if (!this.isConvertToPdf) return;
		this.pdfState = 'checking';
		this.pdfStatusMessage = 'Comprobando PDF...';
		const file = this.file;
		this.convertToPdfSub = this.booksService.getPreparedPdf(this.getStringSource(file), file.coverId).subscribe({
			next: response => {
				const expected = `/cache/${file.coverId}/${file.coverId}.pdf`;
				if (response.success === 'OK' && response.pdfPath === expected) {
					this.pdfState = 'ready';
					this.pdfStatusMessage = '';
					if (open) {
						this._isUsingPdfConversion = true;
						this.stringSource = expected;
						this.onRead();
					}
					return;
				}
				this.pdfState = response.code === 'PDF_PENDING' ? 'pending' : response.code === 'PDF_FAILED' ? 'failed' : 'unavailable';
				this.pdfStatusMessage = this.pdfState === 'pending' ? 'PDF pendiente del escaneo.'
					: this.pdfState === 'failed' ? 'El scanner no pudo preparar este PDF.'
					: 'PDF no disponible.';
			},
			error: (error: Error) => {
				this.pdfState = 'unavailable';
				this.pdfStatusMessage = error.message === 'PDF_BACKEND_UPDATE_REQUIRED'
					? 'La comprobacion de PDF requiere actualizar el backend.'
					: 'No se pudo comprobar el PDF. Vuelve a comprobar cuando haya conexion.';
			}
		});
	}
}
