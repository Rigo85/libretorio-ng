import { Component, Renderer2 } from "@angular/core";
import { RouterOutlet } from "@angular/router";

@Component({
	selector: "app-root",
	imports: [
		RouterOutlet
	],
	templateUrl: "./app.component.html",
	styleUrl: "./app.component.scss"
})
export class AppComponent {

	constructor(private renderer: Renderer2) {
		this.renderer.setAttribute(document.body, "data-bs-theme", "dark");
	}
}
