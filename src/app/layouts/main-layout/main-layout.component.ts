import { Component } from "@angular/core";
import { FooterPanelComponent } from "(src)/app/components/footer-panel/footer-panel.component";
import { RouterOutlet } from "@angular/router";
import { HeaderPanelComponent } from "(src)/app/components/header-panel/header-panel.component";
import { LeftPanelComponent } from "(src)/app/components/left-panel/left-panel.component";

@Component({
	selector: "app-main-layout",
	imports: [
		FooterPanelComponent,
		RouterOutlet,
		HeaderPanelComponent,
		LeftPanelComponent
	],
	templateUrl: "./main-layout.component.html",
	styleUrl: "./main-layout.component.scss"
})
export class MainLayoutComponent {

}
