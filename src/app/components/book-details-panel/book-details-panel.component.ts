import { Component, Input } from "@angular/core";
import { File } from "(src)/app/core/headers";
import { AuthorPipe } from "(src)/app/pipes/author.pipe";
import { TitlePipe } from "(src)/app/pipes/title.pipe";
import { DescriptionPipe } from "(src)/app/pipes/description.pipe";
import { SubjectPipe } from "(src)/app/pipes/subject.pipe";

@Component({
	selector: "book-details-panel",
	standalone: true,
	imports: [
		AuthorPipe,
		TitlePipe,
		DescriptionPipe,
		SubjectPipe
	],
	templateUrl: "./book-details-panel.component.html",
	styleUrl: "./book-details-panel.component.scss"
})
export class BookDetailsPanelComponent {
	@Input() file!: File;
}
