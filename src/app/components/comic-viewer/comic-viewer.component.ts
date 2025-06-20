import { Component, ElementRef, HostListener, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from "@angular/core";
import { NgxSpinnerModule, NgxSpinnerService } from "ngx-spinner";

import { ErrorMessageComponent } from "(src)/app/components/error-message/error-message.component";
import { onClose } from "(src)/app/components/helpers/utils";
import { ErrorMessageService } from "(src)/app/services/error-message.service";
import { BooksService } from "(src)/app/services/books.service";
import { FileKind } from "(src)/app/core/headers";

@Component({
	selector: "comic-viewer",
	imports: [
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
	relativeCurrentPage: number = 1;
	private totalPages: number = 0;
	private currentPagesLength: number = 0;
	private index: number = 0;
	private pageIndex: number = 0;
	private separator = " / ";
	private scrollElement?: HTMLElement;
	private isBackward: boolean = false;

	constructor(
		private errorMessageService: ErrorMessageService,
		private elementRef: ElementRef,
		private spinner: NgxSpinnerService,
		private booksService: BooksService) {}

	ngOnChanges(changes: SimpleChanges) {
		if (changes["comicSrc"] && changes["comicSrc"].currentValue !== changes["comicSrc"].previousValue) {
			this.pages = [];
			this.totalPages = 0;
			this.currentPage = 1;
			this.relativeCurrentPage = 1;
			this.currentPagesLength = 0;
			this.loadComic(this.comicSrc);
		}
	}

	ngOnDestroy() {
		this.pages = [];
	}

	ngOnInit() {
		this.booksService.decompressIncomingMessage$.subscribe((message) => {
			const {success, error, pages} = message.data;
			this.spinner.hide();

			if (success === "OK") {
				this.pages = pages.pages;
				this.totalPages = pages.totalPages;
				// this.currentPage = pages.pageIndex;
				this.currentPagesLength = pages.currentPagesLength;
				if (this.isBackward) {
					this.isBackward = false;
					this.relativeCurrentPage = pages.currentPagesLength;
				}
				this.index = pages.index;
				this.pageIndex = pages.pageIndex;
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

		this.spinner.show();
		this.booksService.decompressFile(this.comicSrc, this.id, this.fileKind);
	}

	private handleError(message: string) {
		this.errorMessageService.open(message);
	}

	private nextPage() {
		if (this.currentPage < this.totalPages) {
			if (this.relativeCurrentPage < this.currentPagesLength) {
				this.currentPage++;
				this.relativeCurrentPage++;
				this.scrollToTop();
			} else {
				this.spinner.show();
				this.relativeCurrentPage = 1;
				this.currentPage++;
				this.booksService.getMorePages(this.id, this.index + 1);
			}
		}
	}

	private prevPage() {
		if (this.currentPage > 1) {
			if (this.relativeCurrentPage > 1) {
				this.currentPage--;
				this.relativeCurrentPage--;
				this.scrollToTop();
			} else {
				this.spinner.show();
				this.currentPage--;
				this.isBackward = true;
				this.booksService.getMorePages(this.id, this.index - 1);
			}
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

}
