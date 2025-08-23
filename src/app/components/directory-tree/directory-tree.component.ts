import { Component, Input } from "@angular/core";
import { NgForOf, NgIf, Location } from "@angular/common";

import { Directory } from "(src)/app/core/headers";
import { BooksService } from "(src)/app/services/books.service";
import { CollapseStateService } from "(src)/app/services/collapse-state.service";
import { SearchTextService } from "(src)/app/services/search-text.service";
import { CurrentClickDirectoryService } from "(src)/app/services/current-click-directory.service";

@Component({
	selector: "directory-tree",
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
		private searchTextService: SearchTextService,
		private location: Location,
		private currentClickDir: CurrentClickDirectoryService) { }

	onClick(hash?: string) {
		if (!hash) return;
		this.collapseStateService.toggleCollapseState(hash);
		this.searchTextService.setSearchText("", false);
		this.isCollapsed(hash);
		console.info(`Click on directory: ${hash}`);
		this.bookService.onBooksList(hash);
		this.location.go(`/parent/${encodeURIComponent(hash)}`);
		this.currentClickDir.lastClickedDirectory = hash;
	}

	isCollapsed(hash: string | undefined): boolean {
		if (!hash) return false;
		return this.collapseStateService.collapseStates[hash];
	}

	trackByHash(index: number, subDir: Directory): string {
		return subDir?.hash ?? "";
	}
}
