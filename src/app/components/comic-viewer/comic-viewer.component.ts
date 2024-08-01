import { Component, ElementRef, HostListener, Input, OnChanges, SimpleChanges } from "@angular/core";
import { NgForOf } from "@angular/common";
import { HttpClient } from "@angular/common/http";
import JSZip from "jszip";
import { ArcFile, createExtractorFromData } from "node-unrar-js";
// import decompress from "decompress";
// import * as decompressTar from "decompress-tar";
import { Buffer } from "buffer";
import { NgxSpinnerModule, NgxSpinnerService } from "ngx-spinner";

import { ErrorMessageComponent } from "(src)/app/components/error-message/error-message.component";
import { onClose } from "(src)/app/components/helpers/utils";
import { ErrorMessageService } from "(src)/app/services/error-message.service";

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
export class ComicViewerComponent implements OnChanges {
	@Input() comicSrc!: string;
	pages: string[] = [];
	onClose = onClose;
	currentPage: number = 1;
	totalPages: number = 0;
	separator = " / ";

	constructor(
		private http: HttpClient,
		private errorMessageService: ErrorMessageService,
		private elementRef: ElementRef,
		private spinner: NgxSpinnerService) {}

	ngOnChanges(changes: SimpleChanges) {
		if (changes["comicSrc"] && changes["comicSrc"].currentValue !== changes["comicSrc"].previousValue) {
			this.pages = [];
			this.totalPages = 0;
			this.currentPage = 1;
			this.loadComic(this.comicSrc);
		}
	}

	private loadComic(url: string): void {
		if (!url) {
			return;
		}

		this.spinner.show().catch((error) => {console.info("Error showing spinner:", error);});
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

	private async extractComic(fileName: string, buffer: Buffer) {
		const dispatch: Record<string, (buffer: Buffer) => Promise<void>> = {
			"cbz": this.extractZip.bind(this),
			"cbr": this.extractRar.bind(this)
			// "cbt": this.extractTar,
			// "cb7": this.extract7z
		};

		const extension: string = fileName.split(".").pop() ?? "";

		if (extension && dispatch[extension]) {
			try {
				await dispatch[extension](buffer);
				await this.spinner.hide();
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
			this.handleError("Error opening CBZ file.");
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
		} catch (error) {
			console.error("Failed to load WASM file or extract RAR:", error);
			this.handleError("Error opening CBR file.");
		}
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

	nextPage() {
		if (this.currentPage < this.totalPages) {
			this.currentPage++;
		}
	}

	prevPage() {
		if (this.currentPage > 1) {
			this.currentPage--;
		}
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

	// private extract7z(buffer: Buffer): void {
	// 	const tempFilePath = "temp.7z";
	// 	fs.writeFileSync(tempFilePath, buffer);
	//
	// 	seven.unpack(tempFilePath, "output", (err: any) => {
	// 		if (err) {
	// 			console.error(err);
	// 			return;
	// 		}
	//
	// 		fs.readdirSync("output").forEach((file: string) => {
	// 			if (file.endsWith(".jpg") || file.endsWith(".png")) {
	// 				const imageBuffer = fs.readFileSync(`output/${file}`);
	// 				const base64 = `data:image/jpeg;base64,${imageBuffer.toString("base64")}`;
	// 				this.pages.push(base64);
	// 			}
	// 		});
	//
	// 		// Clean up the temporary files
	// 		fs.unlinkSync(tempFilePath);
	// 		fs.rmSync("output", {recursive: true, force: true});
	// 	});
	// }
}