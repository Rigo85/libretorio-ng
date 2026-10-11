import { Component, OnInit, ChangeDetectionStrategy } from "@angular/core";

@Component({
	selector: "footer-panel",
	imports: [],
	templateUrl: "./footer-panel.component.html",
	changeDetection: ChangeDetectionStrategy.Eager,
	styleUrl: "./footer-panel.component.scss"
})
export class FooterPanelComponent implements OnInit {
	currentYear!: number;

	ngOnInit(): void {
		this.currentYear = new Date().getFullYear();
	}
}
