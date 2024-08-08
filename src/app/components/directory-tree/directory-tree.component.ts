import { Component, Input } from "@angular/core";
import { NgForOf } from "@angular/common";
import { Directory } from "(src)/app/core/headers";
import { BooksService } from "(src)/app/services/books.service";
import { CollapseStateService } from "(src)/app/services/collapse-state.service";
import { UrlParamsService } from "(src)/app/services/url-params.service";

@Component({
	selector: "directory-tree",
	standalone: true,
	imports: [
		NgForOf
	],
	templateUrl: "./directory-tree.component.html",
	styleUrl: "./directory-tree.component.scss"
})
export class DirectoryTreeComponent {
	@Input() directory?: Directory;
	@Input() nestingLevel: number = 0;

	constructor(
		private bookService: BooksService,
		private collapseStateService: CollapseStateService,
		private urlParamsService: UrlParamsService) { }

	onClick(hash?: string) {
		if (!hash) return;
		this.urlParamsService.wasClicked = true;
		this.collapseStateService.toggleCollapseState(hash);
		this.bookService.onBooksList(hash);
	}

	isCollapsed(hash: string | undefined): boolean {
		if (!hash) return false;
		return this.collapseStateService.collapseStates[hash];
	}
}
