import { AfterViewInit, Component, Injector, Input } from "@angular/core";
import { catchError, from, map, Observable, of } from "rxjs";
import { AsyncPipe, NgIf } from "@angular/common";

import { File } from "(src)/app/core/headers";
import { ExtensionPipe } from "(src)/app/pipes/extension.pipe";
import { AuthorPipe } from "(src)/app/pipes/author.pipe";
import { TitlePipe } from "(src)/app/pipes/title.pipe";
import { BookDetailsPanelComponent } from "(src)/app/components/book-details-panel/book-details-panel.component";
import {
	EditBookDetailsPanelComponent
} from "(src)/app/components/edit-book-details-panel/edit-book-details-panel.component";
import { FileCheckService } from "(src)/app/services/file-check.service";

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
		NgIf
	],
	templateUrl: "./books-panel.component.html",
	styleUrl: "./books-panel.component.scss"
})
export class BooksPanelComponent implements AfterViewInit {
	@Input() files!: File[];
	selectedFile?: File;
	bookDetailsModal: any;
	editBookDetailsModal: any;

	constructor(private fileCheckService: FileCheckService) { }

	ngAfterViewInit(): void {
		const bookDetailsModalElement = document.getElementById("bookDetailsModal");
		const editBookDetailsModalElement = document.getElementById("editBookDetailsModal");

		if (bookDetailsModalElement && editBookDetailsModalElement) {
			this.bookDetailsModal = new bootstrap.Modal(bookDetailsModalElement);
			this.editBookDetailsModal = new bootstrap.Modal(editBookDetailsModalElement);
		}
	}

	onSelectFile(file: File): void {
		this.selectedFile = file;
		this.bookDetailsModal.show();
	}

	openEditModal() {
		this.bookDetailsModal.hide();
		this.editBookDetailsModal.show();
	}

	checkFileExists(file: File): Observable<boolean> {
		return from(this.fileCheckService.checkFileExists(file))
			.pipe(
				catchError(error => of(false))
			);
	}
}
