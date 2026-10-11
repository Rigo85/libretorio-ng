import { Component, ChangeDetectionStrategy, ElementRef, OnDestroy, inject } from "@angular/core";
import {LibraryNavigationService} from '../../services/library-navigation.service';
import { SessionActivityService } from "(src)/app/services/session-activity.service";
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
	changeDetection: ChangeDetectionStrategy.Eager,
	styleUrl: "./main-layout.component.scss"
})
export class MainLayoutComponent implements OnDestroy {
	readonly navigation=inject(LibraryNavigationService);
	private detachActivity: () => void;
	constructor(element: ElementRef<HTMLElement>, public sessionActivity: SessionActivityService) {
		sessionActivity.reset();
		this.detachActivity = sessionActivity.observe(element.nativeElement);
	}
	ngOnDestroy(): void {
		this.detachActivity();
		this.sessionActivity.stop();
	}
}
