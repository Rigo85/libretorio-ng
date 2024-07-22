import { Component, Input, OnChanges, SimpleChanges } from "@angular/core";
import { File } from "(src)/app/core/headers";
import { AuthorPipe } from "(src)/app/pipes/author.pipe";
import { TitlePipe } from "(src)/app/pipes/title.pipe";
import { DescriptionPipe } from "(src)/app/pipes/description.pipe";
import { SubjectPipe } from "(src)/app/pipes/subject.pipe";
import { AsyncPipe, NgIf } from "@angular/common";
import { FileCheckService } from "(src)/app/services/file-check.service";
import { catchError, from, Observable, of } from "rxjs";

@Component({
	selector: "book-details-panel",
	standalone: true,
	imports: [
		AuthorPipe,
		TitlePipe,
		DescriptionPipe,
		SubjectPipe,
		NgIf,
		AsyncPipe
	],
	templateUrl: "./book-details-panel.component.html",
	styleUrl: "./book-details-panel.component.scss"
})
export class BookDetailsPanelComponent implements OnChanges {
	@Input() file!: File;

	constructor(private fileCheckService: FileCheckService) {}

	ngOnChanges(changes: SimpleChanges): void {
		//
    }

	checkFileExists(file: File): Observable<boolean> {
		return from(this.fileCheckService.checkFileExists(file.coverId))
			.pipe(
				catchError(error => of(false))
			);
	}
}
