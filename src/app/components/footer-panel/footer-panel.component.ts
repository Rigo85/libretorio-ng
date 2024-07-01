import { Component, OnInit } from "@angular/core";

@Component({
	selector: "footer-panel",
	standalone: true,
	imports: [],
	templateUrl: "./footer-panel.component.html",
	styleUrl: "./footer-panel.component.scss"
})
export class FooterPanelComponent implements OnInit {
	currentYear!: number;

	ngOnInit(): void {
		this.currentYear = new Date().getFullYear();
	}
}
