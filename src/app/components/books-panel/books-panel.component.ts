import { AfterViewInit, Component, Input } from "@angular/core";
import { catchError, from, Observable, of } from "rxjs";
import { AsyncPipe, NgIf } from "@angular/common";
import { NgxSpinnerService, NgxSpinnerModule } from "ngx-spinner";

import { File } from "(src)/app/core/headers";
import { ExtensionPipe } from "(src)/app/pipes/extension.pipe";
import { AuthorPipe } from "(src)/app/pipes/author.pipe";
import { TitlePipe } from "(src)/app/pipes/title.pipe";
import { BookDetailsPanelComponent } from "(src)/app/components/book-details-panel/book-details-panel.component";
import {
	EditBookDetailsPanelComponent
} from "(src)/app/components/edit-book-details-panel/edit-book-details-panel.component";
import { FileCheckService } from "(src)/app/services/file-check.service";
import { SearchDetailsPanelComponent } from "(src)/app/components/search-details-panel/search-details-panel.component";

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
		NgxSpinnerModule
	],
	templateUrl: "./books-panel.component.html",
	styleUrls: ["./books-panel.component.scss"]
})
export class BooksPanelComponent implements AfterViewInit {
	@Input() files!: File[];
	selectedFile?: File;
	bookDetailsModal: any;
	editBookDetailsModal: any;
	searchDetailsModal: any;

	constructor(private fileCheckService: FileCheckService, private spinner: NgxSpinnerService) { }

	ngAfterViewInit(): void {
		const bookDetailsModalElement = document.getElementById("bookDetailsModal");
		const editBookDetailsModalElement = document.getElementById("editBookDetailsModal");
		const searchDetailsModalElement = document.getElementById("searchDetailsModal");

		if (bookDetailsModalElement && editBookDetailsModalElement && searchDetailsModalElement) {
			this.bookDetailsModal = new bootstrap.Modal(bookDetailsModalElement);
			this.editBookDetailsModal = new bootstrap.Modal(editBookDetailsModalElement);
			this.searchDetailsModal = new bootstrap.Modal(searchDetailsModalElement);
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
		return from(this.fileCheckService.checkFileExists(file)).pipe(
			catchError(() => of(false))
		);
	}

	onSearchDetails(): void {
		this.editBookDetailsModal.hide();
		this.searchDetailsModal.show();
	}

	onSearchOptions($event: { title: string; author: string }): void {
		console.log($event);
		this.spinner.show();

		setTimeout(() => {
			this.spinner.hide();
		}, 3000);
	}
}
