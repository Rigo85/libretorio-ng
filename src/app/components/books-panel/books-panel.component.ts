import { Component, Input } from "@angular/core";
import { File } from "(src)/app/core/headers";
import { ExtensionPipe } from "(src)/app/pipes/extension.pipe";
import { AuthorPipe } from "(src)/app/pipes/author.pipe";
import { TitlePipe } from "(src)/app/pipes/title.pipe";

@Component({
  selector: 'books-panel',
  standalone: true,
	imports: [
		ExtensionPipe,
		AuthorPipe,
		TitlePipe
	],
  templateUrl: './books-panel.component.html',
  styleUrl: './books-panel.component.scss'
})
export class BooksPanelComponent {
	@Input() files!: File[];

	protected readonly JSON = JSON;
}
