import { Component, Input, ChangeDetectionStrategy } from "@angular/core";
import { Location } from "@angular/common";

import { Directory } from "(src)/app/core/headers";
import { BooksService } from "(src)/app/services/books.service";
import { CollapseStateService } from "(src)/app/services/collapse-state.service";
import { SearchTextService } from "(src)/app/services/search-text.service";
import { CurrentClickDirectoryService } from "(src)/app/services/current-click-directory.service";
import { Router } from '@angular/router';
import {libraryPath} from '../../services/library-navigation.service';

@Component({
	selector: "directory-tree",
	imports: [],
	templateUrl: "./directory-tree.component.html",
	changeDetection: ChangeDetectionStrategy.Eager,
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
		private currentClickDir: CurrentClickDirectoryService,
		private router: Router) { }

	onClick(hash?: string) {
		if (!hash) return;
		this.collapseStateService.toggleCollapseState(hash);
		this.searchTextService.setSearchText("", false);
		this.isCollapsed(hash);
		console.info(`Click on directory: ${hash}`);
		if(libraryPath(this.router.url)===undefined) {
			this.currentClickDir.lastClickedDirectory = hash;
			void this.router.navigate(['/parent',hash]);
			return;
		}
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
