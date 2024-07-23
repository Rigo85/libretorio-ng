import { AfterViewInit, Component, Input, OnInit } from "@angular/core";
import { catchError, from, map, Observable, of, startWith, tap } from "rxjs";
import { AsyncPipe, NgForOf, NgIf } from "@angular/common";
import { NgxSpinnerService, NgxSpinnerModule } from "ngx-spinner";

import { File, filterObjectFields, hash } from "(src)/app/core/headers";
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

declare var bootstrap: any;

@Component({
	selector: "books-panel",
	standalone: true,
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
	@Input() files!: File[];
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

	constructor(
		private bookService: BooksService,
		private fileCheckService: FileCheckService,
		private spinner: NgxSpinnerService
	) { }

	ngOnInit(): void {
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
		}
	}

	onSelectFile(file: File): void {
		this.selectedFile = file;
		this.bookDetailsModal.show();
	}

	openEditModal(): void {
		this.bookDetailsModal.hide();
		this.editBookDetailsModal.show();
	}

	checkFileExists(file: File): Observable<boolean> {
		return from(this.fileCheckService.checkFileExists(file.coverId))
			.pipe(catchError(() => of(false)));
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
		const webDetails: any = {
			id: file.id,
			details: {
				title: file.webDetails?.title ?? "",
				cover_i: file.webDetails?.cover_i ?? "",
				publisher: file.webDetails?.publisher ?? [],
				author_name: file.webDetails?.author_name ?? [], // string[]
				publish_date: file.webDetails?.publish_date ?? [], // string[]
				publish_year: file.webDetails?.publish_year ?? [], // number[]
				subject: file.webDetails?.subject ?? [], // string[]
				description: file.webDetails?.description ?? "",
				first_sentence: file.webDetails?.first_sentence ?? [] // string[]
			},
			customDetails: false
		};

		return hash(JSON.stringify(webDetails));
	}

	onUpdateOptions($event: File) {
		this.searchDetailsModal.hide();
		this.spinner.show();
		this.bookService.updateBookDetails($event);
	}

	clearUpdateMessage() {
		this.updateMessage = undefined;
		this.bookService.onBooksList();
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

			// console.info(hash(JSON.stringify(selectedFileDetails)));
			// console.info(selectedFileDetails);
			//
			// console.info(hash(JSON.stringify($event["details"])));
			// console.info($event["details"]);
			//
			// console.info(this.selectedFile.customDetails);
			// console.info($event["customDetails"]);

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
}
