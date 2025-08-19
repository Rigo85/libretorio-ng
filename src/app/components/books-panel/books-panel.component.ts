import { AfterViewInit, Component, ElementRef, OnInit, ViewChild } from "@angular/core";
import { catchError, filter, from, map, Observable, of, shareReplay, startWith, take, tap } from "rxjs";
import { AsyncPipe, Location, NgForOf, NgIf } from "@angular/common";
import { NgxSpinnerModule, NgxSpinnerService } from "ngx-spinner";

import { File, filterObjectFields, getExtension, hash, ScanResult } from "(src)/app/core/headers";
import { ExtensionPipe } from "(src)/app/pipes/extension.pipe";
import { AuthorPipe } from "(src)/app/pipes/author.pipe";
import { TitlePipe } from "(src)/app/pipes/title.pipe";
import { BookDetailsPanelComponent } from "(src)/app/components/book-details-panel/book-details-panel.component";
import {
	EditBookDetailsPanelComponent
} from "(src)/app/components/edit-book-details-panel/edit-book-details-panel.component";
import { FileCheckService } from "(src)/app/services/file-check.service";
import { SearchDetailsPanelComponent } from "(src)/app/components/search-details-panel/search-details-panel.component";
import { BooksService } from "(src)/app/services/books.service";
import { UrlParamsService } from "(src)/app/services/url-params.service";
import { CollapseStateService } from "(src)/app/services/collapse-state.service";
import { LeftPanelUpdateService } from "(src)/app/services/left-panel-update.service";
import { SearchTextService } from "(src)/app/services/search-text.service";
import { ActivatedRoute } from "@angular/router";
import { AuthService } from "(src)/app/services/auth.service";

declare var bootstrap: any;

@Component({
	selector: "books-panel",
	imports: [
		ExtensionPipe,
		AuthorPipe,
		TitlePipe,
		BookDetailsPanelComponent,
		EditBookDetailsPanelComponent,
		AsyncPipe,
		NgIf,
		SearchDetailsPanelComponent,
		NgxSpinnerModule,
		NgForOf
	],
	templateUrl: "./books-panel.component.html",
	styleUrls: ["./books-panel.component.scss"]
})
export class BooksPanelComponent implements AfterViewInit, OnInit {
	files: File[] = [];
	total: number = 0;
	selectedFile?: File;
	bookDetailsModal: any;
	editBookDetailsModal: any;
	searchDetailsModal: any;
	confirmationModal: any;
	public searchDetails$!: Observable<any[]>;
	updateMessage?: string = undefined;
	webDetailsFields: string[] = [
		"title",
		"author_name",
		"subject",
		"description",
		"publisher",
		"cover_i",
		"publish_date",
		"publish_year",
		"first_sentence"
	];
	isEnabledSaveButton: boolean = true;
	stepFields: any = {
		title: "",
		cover_i: "", // number
		publisher: [], // string[]
		author_name: [], // string[]
		publish_date: [], // string[]
		publish_year: [], // number[]
		subject: [], // string[]
		description: "",
		first_sentence: [] // string[]
	};
	editBookDetailsOptions: any = {};
	readonly File = File;
	specialDirectoriesColors: Record<string, string> = {
		"COMIC-MANGA": "#3d6636",
		"EPUB": "#363866",
		"FILE": "#55595c",
		"AUDIOBOOK": "#66691e",
		"NONE:": "#55595c"
	};
	loading = false;
	itemsPerLoad = 50;
	overlapCount = 5;
	currentStartIndex = 0;
	private isScrollingDown: boolean = true;
	private paramsCoverId?: string;
	isAdmin$: Observable<boolean> = of(false);
	imagesExtensions: string[] = ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg", "tiff"];
	@ViewChild("albumContainer") albumContainer?: ElementRef<HTMLElement>;
	lastParentHash?: string;

	constructor(
		private bookService: BooksService,
		private fileCheckService: FileCheckService,
		private spinner: NgxSpinnerService,
		private urlParamsService: UrlParamsService,
		private collapseStateService: CollapseStateService,
		private leftPanelUpdateService: LeftPanelUpdateService,
		private searchTextService: SearchTextService,
		private location: Location,
		private route: ActivatedRoute,
		private authService: AuthService
	) { }

	ngOnInit(): void {
		this.bookService.connect();

		this.bookService.connectionStatus$
			.pipe(
				filter((connected: any) => connected),
				take(1)
			)
			.subscribe(() => {
				// console.info("WebSocket connection established.");

				this.route.params.subscribe((params) => {
					this.handleParams(params);
				});

				this.setupWebSocketSubscriptions();

				this.isAdmin$ = this.authService.isAdmin()
					.pipe(
						shareReplay(1)
					);
			});
	}

	private setupWebSocketSubscriptions(): void {
		this.bookService.incomingMessage$.pipe(
			catchError((err) => {
				console.error("WebSocket error occurred:", err);
				this.spinner.hide();
				return [];
			}),
			map((msg) => msg.data as ScanResult),
			tap((scanResult) => {
				this.collapseStateService.initializeCollapseStates(scanResult.directories);

				this.total = scanResult.total ?? 0;
				if (scanResult.directories) {
					this.leftPanelUpdateService.setDirectories(scanResult.directories);
				}

				this.files = scanResult.files;
				if (this.paramsCoverId) {
					const file = this.files.find((file) => file.coverId === this.paramsCoverId);
					if (file) {
						this.onSelectFile(file);
					}
				}

				// console.info(this.files);
				// console.info("total:", this.total);

				this.spinner.hide();

				if (this.files?.length) {
					const currentParentHash = this.files[0].parentHash;
					if (this.lastParentHash !== currentParentHash) {
						this.lastParentHash = currentParentHash;
						this.currentStartIndex = 0;

						if (this.albumContainer?.nativeElement) {
							this.albumContainer.nativeElement.scrollTop = 50;
						}
					}
				}
			}),
			startWith({files: [], total: 0}),
			shareReplay(1)
		).subscribe();

		this.searchDetails$ = this.bookService.searchDetailsIncomingMessage$.pipe(
			map((msg) => {
				return msg.data as any[];
			}),
			tap(() => {
				this.spinner.hide();
			}),
			catchError((error) => {
				console.error("Error receiving data:", error);
				this.spinner.hide();
				return of([]);
			}),
			startWith([])
		);

		this.bookService.updateIncomingMessage$
			.pipe(
				map((msg) => msg.data),
				catchError((error) => {
						console.error("Error receiving data:", error);
						return of({response: false});
					}
				))
			.subscribe((msg) => {
				this.spinner.hide();
				this.updateMessage = msg["response"] ? "Update successful." : "Update failed.";
				this.confirmationModal.show();
			});

		this.urlParamsService.fileMessage$
			.subscribe((file: File) => {
				this.onSelectFile(file);
			});
	}

	ngAfterViewInit(): void {
		const bookDetailsModalElement = document.getElementById("bookDetailsModal");
		const editBookDetailsModalElement = document.getElementById("editBookDetailsModal");
		const searchDetailsModalElement = document.getElementById("searchDetailsModal");
		const confirmationModalElement = document.getElementById("confirmationModal");

		if (bookDetailsModalElement && editBookDetailsModalElement && searchDetailsModalElement && confirmationModalElement) {
			this.bookDetailsModal = new bootstrap.Modal(bookDetailsModalElement);
			this.editBookDetailsModal = new bootstrap.Modal(editBookDetailsModalElement);
			this.searchDetailsModal = new bootstrap.Modal(searchDetailsModalElement);
			this.confirmationModal = new bootstrap.Modal(confirmationModalElement);

			bookDetailsModalElement.addEventListener("shown.bs.modal", this.onOpenDetailsModal.bind(this));
			bookDetailsModalElement.addEventListener("hidden.bs.modal", this.onCloseDetailsModal.bind(this));
		}
	}

	handleParams(params: Record<string, any>): void {
		const parentHash = params["parentHash"]?.trim();
		const coverId = params["coverId"]?.trim();

		// console.info("Parent Hash:", parentHash);
		// console.info("Cover ID:", coverId);
		if (parentHash) {
			this.collapseStateService.setPendingHash(parentHash);
		}

		this.bookService.onBooksList(parentHash);
		this.paramsCoverId = coverId;
	}

	onSelectFile(file: File): void {
		this.selectedFile = file;
		this.bookDetailsModal.show();
		if (file) {
			this.bookService.logAction("Show book details", file.name, file.id);
		}
	}

	openEditModal(): void {
		this.bookDetailsModal.hide();
		this.editBookDetailsModal.show();
	}

	checkFileExists(file: File): Observable<boolean> {
		const extension = getExtension(file);
		if (this.imagesExtensions.includes(extension)) {
			return of(true);
		} else {
			return from(this.fileCheckService.checkFileExists(this.getCoverId(file)))
				.pipe(catchError(() => of(false)));
		}
	}

	getImageUrl(file: File): string {
		const extension = getExtension(file);
		if (this.imagesExtensions.includes(extension)) {
			const parentPath = file.parentPath.split("dist/public")[1];
			return `${parentPath}/${file.name}`;
		} else {
			return `/covers/${this.getCoverId(file)}.jpg`;
		}
	}

	getCoverId(file: File): string {
		const coverId = `${file.webDetails?.cover_i || "no-cover"}`;
		return !file.customDetails ? file.coverId : coverId;
	}

	openSearchDetails(): void {
		this.editBookDetailsModal.hide();
		this.searchDetailsModal.show();
	}

	onSearchOptions($event: { title: string; author: string }): void {
		this.spinner.show();
		this.bookService.onSearchOptions($event);
	}

	trackById(index: number, file: File): string {
		return file.coverId;
	}

	onUpdateOptions($event: File) {
		this.searchDetailsModal.hide();
		this.spinner.show();
		this.bookService.updateBookDetails($event);
	}

	clearUpdateMessage() {
		this.updateMessage = undefined;
		this.bookService.onBooksList(this.collapseStateService.lastHash);
	}

	onEditBookDetails($event: any) {
		if (this.selectedFile) {
			const selectedFileDetails = filterObjectFields(
				{...this.stepFields, ...(this.selectedFile.webDetails ?? {})},
				this.webDetailsFields
			);
			this.isEnabledSaveButton =
				hash(JSON.stringify(selectedFileDetails)) === hash(JSON.stringify($event["details"])) &&
				this.selectedFile.customDetails === $event["customDetails"]
			;
			if (!this.isEnabledSaveButton) {
				this.editBookDetailsOptions = $event;
			}
		}
	}

	onSaveMetadata() {
		const modalElement = document.getElementById("confirmBookEditModal");
		if (modalElement) {
			const modal = new bootstrap.Modal(modalElement);
			modal.show();
		}
	}

	confirmUpdate() {
		if (this.selectedFile) {
			const temp = this.selectedFile.webDetails ?? {};
			this.selectedFile.webDetails = JSON.stringify({...temp, ...this.editBookDetailsOptions["details"]});
			this.selectedFile.customDetails = this.editBookDetailsOptions["customDetails"];
			const modalElement = document.getElementById("confirmBookEditModal");
			if (modalElement) {
				const modal = bootstrap.Modal.getInstance(modalElement);
				modal.hide();
			}

			this.editBookDetailsModal.hide();
			this.spinner.show();
			this.isEnabledSaveButton = true;
			this.bookService.updateBookDetails(this.selectedFile);
		}
	}

	onCloseDetailsModal() {
		if (this.selectedFile) {
			this.location.go(`/parent/${this.selectedFile.parentHash}`);
		}
	}

	onOpenDetailsModal() {
		if (this.selectedFile) {
			this.location.go(`/parent/${this.selectedFile.parentHash}/id/${this.selectedFile.coverId}`);
		}
	}

	onScroll($event: Event) {
		const element = $event.target as HTMLElement;
		const scrollTop = element.scrollTop;

		// Si el scroll está al inicio, carga los elementos anteriores
		// console.info({scrollTop, index: this.currentStartIndex});
		if (scrollTop === 0 && this.currentStartIndex > 0 && !this.loading) {
			this.loadPreviousItems();
		}

		// Si el scroll está al final, carga los siguientes elementos
		if (scrollTop + element.clientHeight >= element.scrollHeight && !this.loading) {
			this.loadNextItems();
		}
	}

	private loadNextItems(): void {
		// console.info(`loadNextItems: Current Start Index: ${this.currentStartIndex}, Items Per Load: ${this.itemsPerLoad}, Total: ${this.total}`);

		if (this.currentStartIndex + this.itemsPerLoad < this.total) {
			this.currentStartIndex += this.itemsPerLoad - this.overlapCount;
			this.isScrollingDown = true;

			if (!this.searchTextService.searchText.trim()) {
				this.bookService.onBooksList(
					this.collapseStateService.lastHash,
					false,
					this.currentStartIndex,
					this.itemsPerLoad);
			} else {
				this.bookService.onSearchText(
					this.searchTextService.searchText,
					this.currentStartIndex,
					this.itemsPerLoad);
			}

			const element = document.querySelector(".album") as HTMLElement;
			element.scrollTop = 50;
		}
	}

	private loadPreviousItems(): void {
		// console.info(`loadPreviousItems: Current Start Index: ${this.currentStartIndex}, Items Per Load: ${this.itemsPerLoad}`);

		if (this.currentStartIndex > 0) {
			this.currentStartIndex = Math.max(this.currentStartIndex - (this.itemsPerLoad - this.overlapCount), 0);
			this.isScrollingDown = false;

			if (!this.searchTextService.searchText.trim()) {
				this.bookService.onBooksList(
					this.collapseStateService.lastHash,
					false,
					this.currentStartIndex,
					this.itemsPerLoad);
			} else {
				this.bookService.onSearchText(
					this.searchTextService.searchText,
					this.currentStartIndex,
					this.itemsPerLoad);
			}

			const element = document.querySelector(".album") as HTMLElement;

			setTimeout(() => {
				const offset = Math.max(1, element.clientHeight * 0.1); // Ajusta el 10% de la altura visible
				element.scrollTop = element.scrollHeight - element.clientHeight - offset;
			}, 500);
		}
	}

	closeBookDetails(selectedFile: File | undefined) {
		if (selectedFile) {
			this.bookService.logAction("Close Book Details", selectedFile.name, selectedFile.id);
		}
	}
}
