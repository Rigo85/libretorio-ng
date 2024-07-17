import { Component, Input } from "@angular/core";
import { File } from "(src)/app/core/headers";
import { ExtensionPipe } from "(src)/app/pipes/extension.pipe";
import { AuthorPipe } from "(src)/app/pipes/author.pipe";
import { TitlePipe } from "(src)/app/pipes/title.pipe";
import { BookDetailsPanelComponent } from "(src)/app/components/book-details-panel/book-details-panel.component";

declare var bootstrap: any;

@Component({
	selector: "books-panel",
	standalone: true,
	imports: [
		ExtensionPipe,
		AuthorPipe,
		TitlePipe,
		BookDetailsPanelComponent
	],
	templateUrl: "./books-panel.component.html",
	styleUrl: "./books-panel.component.scss"
})
export class BooksPanelComponent {
	@Input() files!: File[];
	selectedFile?: File;

	onSelectFile(file: File): void {
		this.selectedFile = file;
		// Utiliza Bootstrap 5 para mostrar el modal
		const modalElement = document.getElementById("bookDetailsModal");
		const modal = new bootstrap.Modal(modalElement);
		modal.show();
	}
}
