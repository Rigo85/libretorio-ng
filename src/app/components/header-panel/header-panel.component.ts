import { Component } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { BooksService } from "(src)/app/services/books.service";
import { CollapseStateService } from "(src)/app/services/collapse-state.service";

@Component({
	selector: "header-panel",
	standalone: true,
	imports: [
		FormsModule
	],
	templateUrl: "./header-panel.component.html",
	styleUrl: "./header-panel.component.scss"
})
export class HeaderPanelComponent {
	searchText: string = "";

	constructor(private booksService: BooksService, private collapseState: CollapseStateService) {}

	onKeyDown($event: KeyboardEvent) {
		if ($event.key === "Enter") {
			$event.preventDefault();
			this.handleEnter();
		} else if ($event.key === "Escape") {
			this.handleEscape();
		}
	}

	handleEnter(): void {
		this.booksService.onSearchText(this.searchText);
		this.collapseState.initialized = false;
		// TODO: revisar el loading modal.
		this.searchText = "";
	}

	handleEscape(): void {
		this.searchText = "";
	}
}
