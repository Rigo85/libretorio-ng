import { AfterViewInit, Component, Input, OnChanges, OnInit, SimpleChanges } from "@angular/core";
import { AsyncPipe, NgIf, NgOptimizedImage } from "@angular/common";
import { NgxExtendedPdfViewerModule } from "ngx-extended-pdf-viewer";
import { catchError, from, Observable, of } from "rxjs";
import { HttpErrorResponse } from "@angular/common/http";

import { File, getExtension } from "(src)/app/core/headers";
import { AuthorPipe } from "(src)/app/pipes/author.pipe";
import { TitlePipe } from "(src)/app/pipes/title.pipe";
import { DescriptionPipe } from "(src)/app/pipes/description.pipe";
import { SubjectPipe } from "(src)/app/pipes/subject.pipe";
import { FileCheckService } from "(src)/app/services/file-check.service";
import { DownloadService } from "(src)/app/services/download.service";
import { PdfViewerComponent } from "(src)/app/components/pdf-viewer/pdf-viewer.component";
import { ExtensionPipe } from "(src)/app/pipes/extension.pipe";
import { EpubViewerComponent } from "(src)/app/components/epub-viewer/epub-viewer.component";

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
		EpubViewerComponent
	],
	templateUrl: "./book-details-panel.component.html",
	styleUrl: "./book-details-panel.component.scss"
})
export class BookDetailsPanelComponent implements OnInit, OnChanges, AfterViewInit {
	@Input() file!: File;
	downloadMessage: string = "";
	titleMessage: string = "Information";
	stringSource: string = "";
	extension: string = "N/A";
	disabledExtensions: string[] = ["pdf", "epub"];

	constructor(private fileCheckService: FileCheckService, private downloadService: DownloadService) {}

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
				this.stringSource = this.getStringSource(this.file);
			});

			modalElement.addEventListener("hidden.bs.modal", () => {
				this.stringSource = "";
			});
		}
	}

	get isDisabled(): boolean {
		return !this.disabledExtensions.includes(this.extension);
	}

	checkFileExists(file: File): Observable<boolean> {
		return from(this.fileCheckService.checkFileExists(this.getCoverId(file)))
			.pipe(catchError(() => of(false)));
	}

	getCoverId(file: File): string {
		const coverId = `${file.webDetails?.cover_i || "no-cover"}`;
		return !file.customDetails ? file.coverId : coverId;
	}

	onDownload(file: { parentPath: string; name: string }) {
		const fileUrl = `${file.parentPath}/${file.name}`;
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
			const modal = new bootstrap.Modal(modalElement);
			modal.show();
		}
	}
}
