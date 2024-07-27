import { AfterViewInit, Component, HostListener } from "@angular/core";
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
export class HeaderPanelComponent implements AfterViewInit {
	searchText: string = "";

	constructor(private booksService: BooksService, private collapseState: CollapseStateService) {}

	ngAfterViewInit(): void {
		this.handleSidebar();
	}

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

	@HostListener("window:resize", ["$event"])
	onResize(): void {
		this.handleSidebar();
	}

	handleSidebar(): void {
		const sidebar = document.getElementById("sidebar");
		const sidebarToggle = document.getElementById("sidebarToggle");

		if (window.innerWidth < 768) {
			sidebar?.classList.add("d-none");
			sidebarToggle?.classList.remove("d-none");
		} else {
			sidebar?.classList.remove("d-none");
			sidebarToggle?.classList.add("d-none");
		}
	}

	toggleSidebar(): void {
		const sidebar = document.getElementById("sidebar");
		sidebar?.classList.toggle("d-none");
	}
}
