import {
	Component,
	ElementRef,
	HostListener,
	Input,
	OnChanges,
	OnDestroy,
	OnInit,
	SimpleChanges
} from "@angular/core";
import { NgForOf } from "@angular/common";
import { HttpClient } from "@angular/common/http";
import JSZip from "jszip";
import { createExtractorFromData } from "node-unrar-js";
import { Buffer } from "buffer";
import { NgxSpinnerModule, NgxSpinnerService } from "ngx-spinner";

import { ErrorMessageComponent } from "(src)/app/components/error-message/error-message.component";
import { onClose } from "(src)/app/components/helpers/utils";
import { ErrorMessageService } from "(src)/app/services/error-message.service";
import { BooksService } from "(src)/app/services/books.service";
import { FileKind } from "(src)/app/core/headers";

@Component({
	selector: "comic-viewer",
	standalone: true,
	imports: [
		NgForOf,
		ErrorMessageComponent,
		NgxSpinnerModule
	],
	templateUrl: "./comic-viewer.component.html",
	styleUrl: "./comic-viewer.component.scss"
})
export class ComicViewerComponent implements OnChanges, OnInit, OnDestroy {
	@Input() comicSrc!: string;
	@Input() id!: string;
	@Input() fileKind!: FileKind;
	pages: string[] = [];
	onClose = onClose;
	currentPage: number = 1;
	private totalPages: number = 0;
	private separator = " / ";
	private decompressing = false;
	private scrollElement?: HTMLElement;

	constructor(
		private http: HttpClient,
		private errorMessageService: ErrorMessageService,
		private elementRef: ElementRef,
		private spinner: NgxSpinnerService,
		private booksService: BooksService) {}

	ngOnChanges(changes: SimpleChanges) {
		if (changes["comicSrc"] && changes["comicSrc"].currentValue !== changes["comicSrc"].previousValue) {
			this.pages = [];
			this.totalPages = 0;
			this.currentPage = 1;
			this.loadComic(this.comicSrc);
		}
	}

	ngOnDestroy() {
		this.pages = [];
	}

	ngOnInit() {
		this.booksService.decompressIncomingMessage$.subscribe((message) => {
			const {success, error, pages} = message.data;

			this.decompressing = false;
			this.spinner.hide();

			if (success === "OK") {
				this.pages = pages;
				this.totalPages = pages.length;
			} else {
				this.handleError(error);
			}
		});

		this.scrollElement = document.getElementById("body-scroll") ?? undefined;
	}

	private loadComic(url: string): void {
		if (!url) {
			return;
		}

		this.spinner.show().catch((error) => {console.info("Error showing spinner:", error);});

		if (["COMIC-MANGA", "EPUB"].includes(this.fileKind.toString())) {
			this.decompressing = true;
			this.booksService.decompressFile(this.comicSrc, this.id, this.fileKind);
		} else if (this.fileKind === FileKind.FILE) {
			this.http.get(url, {responseType: "arraybuffer"})
				.subscribe({
					next: (arrayBuffer) => {
						const buffer = Buffer.from(arrayBuffer);
						const fileName = url.toLowerCase();
						this.extractComic(fileName, buffer).catch((error) => {console.info("Error extracting comic:", error);});
					},
					error: (error) => {
						this.spinner.hide();
						console.error("Error loading comic:", error);
						this.handleError("Error loading comic.");
					}
				});
		}
	}

	private async extractComic(fileName: string, buffer: Buffer) {
		const dispatch: Record<string, (buffer: Buffer) => Promise<void>> = {
			"cbz": this.extractZip.bind(this),
			"cbr": this.extractRar.bind(this),
			// "cbt": this.extractTar,
			"cb7": this.extract7z.bind(this)
		};

		const extension: string = fileName.split(".").pop() ?? "";

		if (extension && dispatch[extension]) {
			try {
				await dispatch[extension](buffer);
				if (!this.decompressing) {
					await this.spinner.hide();
				}
			} catch (error) {
				await this.spinner.hide();
				console.error(`Error extracting ${extension.toUpperCase()}:`, error);
				this.handleError(`Error opening ${extension.toUpperCase()} file.`);
			}
		}
	}

	private async extractZip(buffer: Buffer): Promise<void> {
		try {
			const zip = await JSZip.loadAsync(buffer);
			const files = Object.keys(zip.files).sort();
			for (const relativePath of files) {
				const file = zip.files[relativePath];
				if (relativePath.endsWith(".jpg") || relativePath.endsWith(".png")) {
					const imageBuffer = await file.async("arraybuffer");
					const base64 = `data:image/${this.getImageFormat(relativePath)};base64,${Buffer.from(imageBuffer).toString("base64")}`;
					this.pages.push(base64);
					this.totalPages++;
				}
			}
		} catch (error) {
			console.error("Error extracting ZIP:", error);
			this.decompressing = true;
			this.booksService.decompressFile(this.comicSrc, this.id, this.fileKind);
		}
	}

	private async extractRar(buffer: Buffer): Promise<void> {
		try {
			const wasmBinary = await fetch("/assets/unrar.wasm").then(response => response.arrayBuffer());
			const extractor = await createExtractorFromData({data: buffer, wasmBinary});
			const extracted = extractor.extract();

			const sortedFiles = Array
				.from(extracted.files)
				.sort((a, b) => a.fileHeader.name.localeCompare(b.fileHeader.name))
			;

			for (const file of sortedFiles) {
				if (file.fileHeader.flags.directory) {
					console.info(`Skipping directory: "${file.fileHeader.name}"`);
					continue;
				}

				if (file.fileHeader.name.endsWith(".jpg") || file.fileHeader.name.endsWith(".png")) {
					const imageBuffer = file.extraction;
					if (imageBuffer) {
						const base64 = `data:image/${this.getImageFormat(file.fileHeader.name)};base64,${Buffer.from(imageBuffer).toString("base64")}`;
						this.pages.push(base64);
						this.totalPages++;
					} else {
						console.error(`Failed to extract image: "${file.fileHeader.name}"`);
					}
				} else {
					console.log(`Skipping non-image file: ${file.fileHeader.name}"`);
				}
			}
		} catch (error: any) {
			console.error("Failed to load WASM file or extract RAR while attempting to decompress on the backend:", error.message);
			this.decompressing = true;
			this.booksService.decompressFile(this.comicSrc, this.id, this.fileKind);
		}
	}

	private async extract7z(buffer: Buffer): Promise<void> {
		this.decompressing = true;
		this.booksService.decompressFile(this.comicSrc, this.id, this.fileKind);
	}

	private getImageFormat(fileName: string): string {
		if (fileName.endsWith(".png")) {
			return "png";
		} else {
			return "jpeg";
		}
	}

	private handleError(message: string) {
		this.errorMessageService.open(message);
	}

	private nextPage() {
		if (this.currentPage < this.totalPages) {
			this.currentPage++;
			this.scrollToTop();
		}
	}

	private prevPage() {
		if (this.currentPage > 1) {
			this.currentPage--;
			this.scrollToTop();
		}
	}

	private scrollToTop() {
		setTimeout(() => {
			if (this.scrollElement) {
				this.scrollElement.scrollTop = 0;
			}
		});
	}

	get position(): string {
		return `${this.currentPage}${this.separator}${this.totalPages}`;
	}

	@HostListener("document:keyup", ["$event"])
	handleKeyUp(event: KeyboardEvent) {
		if (event.key === "ArrowLeft") {
			this.prevPage();
		} else if (event.key === "ArrowRight") {
			this.nextPage();
		}
	}

	@HostListener("document:click", ["$event"])
	onDocumentClick(event: MouseEvent) {
		const target = event.target as HTMLElement;
		const imageContainer = this.elementRef.nativeElement.querySelector("#image-container");

		if (imageContainer && imageContainer.contains(target)) {
			const rect = imageContainer.getBoundingClientRect();
			const clickX = event.clientX - rect.left;
			const viewerWidth = rect.width;

			if (clickX < viewerWidth / 2) {
				this.prevPage();
			} else {
				this.nextPage();
			}
		}
	}

	// private extractTar(buffer: Buffer): void {
	// 	decompress(buffer, {plugins: [decompressTar()]}).then((files: any[]) => {
	// 		files.forEach((file: any) => {
	// 			if (file.path.endsWith(".jpg") || file.path.endsWith(".png")) {
	// 				const base64 = `data:image/jpeg;base64,${file.data.toString("base64")}`;
	// 				this.pages.push(base64);
	// 			}
	// 		});
	// 	});
	// }


}
