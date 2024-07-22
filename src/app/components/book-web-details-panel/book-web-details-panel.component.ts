import { Component, Input } from "@angular/core";
import { AsyncPipe, NgIf } from "@angular/common";

import { OpenLibraryBook } from "(src)/app/core/headers";
import { FileCheckService } from "(src)/app/services/file-check.service";
import { catchError, from, Observable, of } from "rxjs";

@Component({
	selector: "book-web-details-panel",
	standalone: true,
	imports: [
		NgIf,
		AsyncPipe
	],
	templateUrl: "./book-web-details-panel.component.html",
	styleUrl: "./book-web-details-panel.component.scss"
})
export class BookWebDetailsPanelComponent {
	@Input() openLibraryBook!: OpenLibraryBook;

	constructor(private fileCheckService: FileCheckService) {}

	checkFileExists(openLibraryBook: OpenLibraryBook): Observable<boolean> {
		return from(this.fileCheckService.checkFileExists(openLibraryBook.cover_i ?? "no_cover_i", true))
			.pipe(
				catchError(error => of(false))
			);
	}

	get publishDate(): string {
		const dates = this.openLibraryBook.publish_date ?? [];

		if(Array.isArray(dates)) {
			return dates.join("; ");
		} else {
			return dates;
		}
	}

}
