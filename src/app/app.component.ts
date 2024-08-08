import { Component, OnInit } from "@angular/core";
import { ActivatedRoute, RouterOutlet } from "@angular/router";
import { catchError, map, Observable, startWith, tap } from "rxjs";
import { AsyncPipe, NgIf } from "@angular/common";
import { NgxSpinnerService, NgxSpinnerModule } from "ngx-spinner";

import { ThemeTogglerComponent } from "(src)/app/components/theme-toggler/theme-toggler.component";
import { LeftPanelComponent } from "(src)/app/components/left-panel/left-panel.component";
import { HeaderPanelComponent } from "(src)/app/components/header-panel/header-panel.component";
import { BooksPanelComponent } from "(src)/app/components/books-panel/books-panel.component";
import { FooterPanelComponent } from "(src)/app/components/footer-panel/footer-panel.component";
import { BooksService } from "(src)/app/services/books.service";
import { ScanResult } from "(src)/app/core/headers";
import { CollapseStateService } from "(src)/app/services/collapse-state.service";
import { UrlParamsService } from "(src)/app/services/url-params.service";
import { File } from "(src)/app/core/headers";

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
		AsyncPipe,
		NgxSpinnerModule
	],
	templateUrl: "./app.component.html",
	styleUrl: "./app.component.scss"
})
export class AppComponent implements OnInit {
	title = "Libretorio";
	public scanResult$!: Observable<ScanResult>;

	constructor(
		private bookService: BooksService,
		private collapseStateService: CollapseStateService,
		private route: ActivatedRoute,
		private urlParamsService: UrlParamsService,
		private spinner: NgxSpinnerService) {
	}

	ngOnInit(): void {
		this.route.queryParams.subscribe((params) => {
			const parentHash: string = params["parent"]?.trim();
			const fileCoverId: string = params["file"]?.trim();

			this.spinner.show();

			if (parentHash) {
				this.urlParamsService.hasUrlParams = true;
				this.urlParamsService.parentHash = parentHash;
				this.urlParamsService.id = fileCoverId;
				this.bookService.onBooksList(parentHash);
			} else {
				this.bookService.onBooksList();
			}
		});

		this.scanResult$ = this.bookService.incomingMessage$.pipe(
			catchError((err) => {
				console.error("WebSocket error occurred:", err);
				this.spinner.hide();
				return [];
			}),
			map((msg) => msg.data as ScanResult),
			tap((scanResult) => {
				this.collapseStateService.initializeCollapseStates(scanResult.directories);

				if (this.urlParamsService.hasUrlParams) {
					this.urlParamsService.hasUrlParams = false;
					this.collapseStateService.toggleCollapseState(this.urlParamsService.parentHash);
					if (this.urlParamsService.id) {
						const file = scanResult.files.find((file: File) => file.coverId === this.urlParamsService.id);
						if (file) {
							this.urlParamsService.setSelectedFile(file);
						} else {
							console.info(`File with coverId "${this.urlParamsService.id}" not found`);
						}
					}
				}

				this.spinner.hide();
			}),
			startWith({files: []})
		);
	}
}
