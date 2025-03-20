import { Component, Renderer2 } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { AsyncPipe, NgIf } from "@angular/common";

import { ThemeTogglerComponent } from "(src)/app/components/theme-toggler/theme-toggler.component";
import { LeftPanelComponent } from "(src)/app/components/left-panel/left-panel.component";
import { HeaderPanelComponent } from "(src)/app/components/header-panel/header-panel.component";
import { BooksPanelComponent } from "(src)/app/components/books-panel/books-panel.component";
import { FooterPanelComponent } from "(src)/app/components/footer-panel/footer-panel.component";

@Component({
	selector: "app-root",
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
export class AppComponent {

	constructor(private renderer: Renderer2) {
		this.renderer.setAttribute(document.body, "data-bs-theme", "dark");
	}
}
