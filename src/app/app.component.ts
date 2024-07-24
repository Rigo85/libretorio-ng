import { AfterViewInit, Component, HostListener, OnInit } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { map, Observable, startWith, tap } from "rxjs";
import { AsyncPipe, NgIf } from "@angular/common";

import { ThemeTogglerComponent } from "(src)/app/components/theme-toggler/theme-toggler.component";
import { SidebarTogglerComponent } from "(src)/app/components/sidebar-toggler/sidebar-toggler.component";
import { LeftPanelComponent } from "(src)/app/components/left-panel/left-panel.component";
import { HeaderPanelComponent } from "(src)/app/components/header-panel/header-panel.component";
import { BooksPanelComponent } from "(src)/app/components/books-panel/books-panel.component";
import { FooterPanelComponent } from "(src)/app/components/footer-panel/footer-panel.component";
import { BooksService } from "(src)/app/services/books.service";
import { ScanResult } from "(src)/app/core/headers";
import { CollapseStateService } from "(src)/app/services/collapse-state.service";

declare var bootstrap: any;

@Component({
	selector: "app-root",
	standalone: true,
	imports: [
		RouterOutlet,
		ThemeTogglerComponent,
		SidebarTogglerComponent,
		LeftPanelComponent,
		HeaderPanelComponent,
		BooksPanelComponent,
		FooterPanelComponent,
		NgIf,
		AsyncPipe
	],
	templateUrl: "./app.component.html",
	styleUrl: "./app.component.scss"
})
export class AppComponent implements OnInit, AfterViewInit {
	title = "Libretorio";
	public scanResult$!: Observable<ScanResult>;

	constructor(private bookService: BooksService, private collapseStateService: CollapseStateService) {
		this.bookService.onBooksList();
	}

	ngAfterViewInit(): void {
		this.handleSidebar();
	}

	ngOnInit(): void {
		this.initializeTooltips();

		this.scanResult$ = this.bookService.incomingMessage$.pipe(
			map((msg) => msg.data as ScanResult),
			tap((scanResult) => {
				this.collapseStateService.initializeCollapseStates(scanResult.directories);
			}),
			startWith({files: []})
		);
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

	initializeTooltips(): void {
		const tooltipTriggerList = Array.from(document.querySelectorAll("[data-bs-toggle=\"tooltip\"]"));
		tooltipTriggerList.forEach(tooltipTriggerEl => {
			new bootstrap.Tooltip(tooltipTriggerEl);
		});
	}
}
