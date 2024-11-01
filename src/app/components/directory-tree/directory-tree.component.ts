import { Component, Input, NgZone } from "@angular/core";
import { NgForOf, NgIf } from "@angular/common";

import { Directory } from "(src)/app/core/headers";
import { BooksService } from "(src)/app/services/books.service";
import { CollapseStateService } from "(src)/app/services/collapse-state.service";
import { SearchTextService } from "(src)/app/services/search-text.service";

@Component({
	selector: "directory-tree",
	standalone: true,
	imports: [
		NgForOf,
		NgIf
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
		private searchTextService: SearchTextService) { }

	onClick(hash?: string) {
		if (!hash) return;
		this.collapseStateService.toggleCollapseState(hash);
		this.searchTextService.searchText = "";
		this.bookService.onBooksList(hash);
	}

	isCollapsed(hash: string | undefined): boolean {
		if (!hash) return false;
		return this.collapseStateService.collapseStates[hash];
	}

	trackByHash(index: number, subDir: Directory): string {
		return subDir?.hash ?? "";
	}
}
