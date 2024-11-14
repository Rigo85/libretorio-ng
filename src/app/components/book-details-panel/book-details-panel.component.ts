import { AfterViewInit, Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from "@angular/core";
import { AsyncPipe, NgIf, NgOptimizedImage } from "@angular/common";
import { NgxExtendedPdfViewerModule } from "ngx-extended-pdf-viewer";
import { catchError, from, Observable, of } from "rxjs";
import { HttpErrorResponse } from "@angular/common/http";
import { NgxSpinnerService, NgxSpinnerModule } from "ngx-spinner";

import { File, FileKind, getExtension } from "(src)/app/core/headers";
import { AuthorPipe } from "(src)/app/pipes/author.pipe";
import { TitlePipe } from "(src)/app/pipes/title.pipe";
import { DescriptionPipe } from "(src)/app/pipes/description.pipe";
import { SubjectPipe } from "(src)/app/pipes/subject.pipe";
import { FileCheckService } from "(src)/app/services/file-check.service";
import { DownloadService } from "(src)/app/services/download.service";
import { PdfViewerComponent } from "(src)/app/components/pdf-viewer/pdf-viewer.component";
import { ExtensionPipe } from "(src)/app/pipes/extension.pipe";
import { EpubViewerComponent } from "(src)/app/components/epub-viewer/epub-viewer.component";
import { ComicViewerComponent } from "(src)/app/components/comic-viewer/comic-viewer.component";
import { BooksService } from "(src)/app/services/books.service";
import { ErrorMessageService } from "(src)/app/services/error-message.service";
import { ErrorMessageComponent } from "(src)/app/components/error-message/error-message.component";
import { FullPathPipe } from "(src)/app/pipes/full-path.pipe";
import { AudiobookViewerComponent } from "(src)/app/components/audiobook-viewer/audiobook-viewer.component";

declare var bootstrap: any;

@Component({
	selector: "book-details-panel",
	standalone: true,
	imports: [
		AuthorPipe,
		TitlePipe,
		DescriptionPipe,
		SubjectPipe,
		NgIf,
		AsyncPipe,
		NgOptimizedImage,
		PdfViewerComponent,
		NgxExtendedPdfViewerModule,
		ExtensionPipe,
		EpubViewerComponent,
		ComicViewerComponent,
		NgxSpinnerModule,
		ErrorMessageComponent,
		FullPathPipe,
		AudiobookViewerComponent
	],
	templateUrl: "./book-details-panel.component.html",
	styleUrl: "./book-details-panel.component.scss"
})
export class BookDetailsPanelComponent implements OnInit, OnChanges, AfterViewInit, OnDestroy {
	@Input() file!: File;
	downloadMessage: string = "";
	titleMessage: string = "Information";
	stringSource: string = "";
	extension: string = "N/A";
	disabledExtensions: string[] = ["pdf", "epub", "cbr", "cbz", "cb7"];
	convertToPdfExtensions: string[] = [
		"epub", "doc", "docx", "ppt", "pptx", "xls",
		"xlsx", "rtf", "txt", "html", "htm", "lit"
	];
	_isUsingPdfConversion: boolean = false;

	constructor(
		private fileCheckService: FileCheckService,
		private downloadService: DownloadService,
		private booksService: BooksService,
		private spinner: NgxSpinnerService,
		private errorMessageService: ErrorMessageService) {}

	ngOnChanges(changes: SimpleChanges): void {
		if (changes["file"]) {
			this.extension = getExtension(this.file);
		}
	}

	ngOnInit(): void {
		if (this.file) {
			this.extension = getExtension(this.file);
		}
	}

	ngAfterViewInit(): void {
		const modalElement = document.getElementById("readModal");
		if (modalElement) {
			modalElement.addEventListener("shown.bs.modal", () => {
				this.stringSource = !this.stringSource ? this.getStringSource(this.file) : this.stringSource;
			});

			modalElement.addEventListener("hidden.bs.modal", () => {
				this.stringSource = "";
				this._isUsingPdfConversion = false;
			});
		}
	}

	ngOnDestroy() {
		this._isUsingPdfConversion = false;
	}

	get isDisabled(): boolean {
		return !this.disabledExtensions.includes(this.extension) &&
			!["EPUB", "COMIC-MANGA", "AUDIOBOOK"].includes(this.file.fileKind.toString())
			;
	}

	get isConvertToPdf(): boolean {
		return this.convertToPdfExtensions.includes(this.extension);
	}

	get isUsingPdfConversion(): boolean {
		return this._isUsingPdfConversion;
	}

	checkFileExists(file: File): Observable<boolean> {
		return from(this.fileCheckService.checkFileExists(this.getCoverId(file)))
			.pipe(catchError(() => of(false)));
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

		this.downloadService.downloadFile(fileUrl).pipe(
			catchError((error: HttpErrorResponse) => {
				this.downloadMessage = this.getErrorMessage(error);
				console.info(`${this.titleMessage} - ${this.downloadMessage}`);
				this.messageDialog();
				return of(null);
			})
		).subscribe({
			next: (blob) => {
				if (blob) {
					const url = window.URL.createObjectURL(blob);
					const a = document.createElement("a");
					a.href = url;
					a.download = file.name;
					a.click();
					window.URL.revokeObjectURL(url);
					console.info("Download book", fileUrl);
				}
			},
			error: (error) => {
				console.error("Download failed", error);
			},
			complete: () => {
				console.info("Download process completed.");
			}
		});
	}

	private getErrorMessage(error: HttpErrorResponse): string {
		if (error.error instanceof ErrorEvent) {
			// Error del lado del cliente o de red
			return `Error: ${error.error.message}`;
		} else {
			// Error del lado del servidor
			this.titleMessage = `Error ${error.status}`;
			return `${error.statusText} URL: ${decodeURIComponent(error.url ?? "")}`;
		}
	}

	clearDownloadMessage() {
		this.downloadMessage = "";
		this.titleMessage = "Information";
	}

	messageDialog() {
		const modalElement = document.getElementById("downloadConfirmationModal");
		if (modalElement) {
			const modal = new bootstrap.Modal(modalElement);
			modal.show();
		}
	}

	getStringSource(file: File): string {
		return file ? (this.file.parentPath + "/" + this.file.name) : "";
	}

	onRead() {
		const modalElement = document.getElementById("readModal");
		if (modalElement) {
			const modalInstance = bootstrap.Modal.getInstance(modalElement);
			if (modalInstance) {
				modalInstance.show();
			} else {
				// console.info("Modal instance not found, creating a new one.");
				const newModalInstance = new bootstrap.Modal(modalElement);
				modalElement.addEventListener("hidden.bs.modal", () => {
					const modal = bootstrap.Modal.getInstance(modalElement);
					if (modal) {
						// hiding epub modal reader when converting to pdf.
						modal.hide();
					}
				});
				newModalInstance.show();
			}
		}
	}

	onConvertToPdf() {
		try {
			this.spinner.show();
			this.booksService.convertToPdf(this.getStringSource(this.file), this.file.coverId);

			this.booksService.convertToPdfIncomingMessage$.subscribe({
				next: (msg) => {
					this.spinner.hide();
					const {success, error, pdfPath} = msg.data;
					this._isUsingPdfConversion = true;

					if (success === "OK") {
						this.stringSource = pdfPath;
						this.onRead();
					} else {
						console.error("Convert to PDF error:", error);
						this.handleError(error || "Error converting to PDF.");
					}
				},
				error: (error) => {
					console.error("Error converting to PDF:", error);
					this.spinner.hide();
					this.handleError("Error converting to PDF.");
				}
			});
		} catch (error) {
			this.spinner.hide();
			console.error("Error converting to PDF:", error);
		}
	}

	private handleError(message: string) {
		this.errorMessageService.open(message);
	}
}
