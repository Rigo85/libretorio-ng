import { Component, OnInit } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { catchError, map, Observable, shareReplay, startWith, tap } from "rxjs";
import { AsyncPipe, NgIf } from "@angular/common";

import { ThemeTogglerComponent } from "(src)/app/components/theme-toggler/theme-toggler.component";
import { LeftPanelComponent } from "(src)/app/components/left-panel/left-panel.component";
import { HeaderPanelComponent } from "(src)/app/components/header-panel/header-panel.component";
import { BooksPanelComponent } from "(src)/app/components/books-panel/books-panel.component";
import { FooterPanelComponent } from "(src)/app/components/footer-panel/footer-panel.component";
import { BooksService } from "(src)/app/services/books.service";
import { ScanResult } from "(src)/app/core/headers";
import { CollapseStateService } from "(src)/app/services/collapse-state.service";

@Component({
	selector: "app-root",
	standalone: true,
	imports: [
		RouterOutlet,
		ThemeTogglerComponent,
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
export class AppComponent implements OnInit {
	title = "Libretorio";
	public scanResult$!: Observable<ScanResult>;

	constructor(
		private bookService: BooksService,
		private collapseStateService: CollapseStateService) {
	}

	ngOnInit(): void {
		this.bookService.onBooksList();
		this.scanResult$ = this.bookService.incomingMessage$.pipe(
			catchError((err) => {
				console.error("WebSocket error occurred:", err);
				return [];
			}),
			map((msg) => msg.data as ScanResult),
			tap((scanResult) => {
				this.collapseStateService.initializeCollapseStates(scanResult.directories);
			}),
			startWith({files: []}),
			shareReplay(1)
		);

		this.scanResult$.subscribe();
	}
}
