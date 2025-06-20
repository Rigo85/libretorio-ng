import { Component, Renderer2 } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { LeftPanelComponent } from "(src)/app/components/left-panel/left-panel.component";
import { HeaderPanelComponent } from "(src)/app/components/header-panel/header-panel.component";
import { FooterPanelComponent } from "(src)/app/components/footer-panel/footer-panel.component";

@Component({
	selector: "app-root",
	imports: [
		RouterOutlet,
		LeftPanelComponent,
		HeaderPanelComponent,
		FooterPanelComponent
	],
	templateUrl: "./app.component.html",
	styleUrl: "./app.component.scss"
})
export class AppComponent {

	constructor(private renderer: Renderer2) {
		this.renderer.setAttribute(document.body, "data-bs-theme", "dark");
	}
}
