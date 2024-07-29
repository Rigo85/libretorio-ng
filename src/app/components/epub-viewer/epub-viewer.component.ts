import { Component, ElementRef, Input, OnChanges, SimpleChanges } from "@angular/core";

import { ErrorMessageComponent } from "(src)/app/components/error-message/error-message.component";
import { onClose } from "(src)/app/components/helpers/utils";
import { ErrorMessageService } from "(src)/app/services/error-message.service";

declare var ePub: any;

@Component({
	selector: "epub-viewer",
	standalone: true,
	imports: [
		ErrorMessageComponent
	],
	templateUrl: "./epub-viewer.component.html",
	styleUrl: "./epub-viewer.component.scss"
})
export class EpubViewerComponent implements OnChanges {
	@Input() epubSrc!: string;
	onClose = onClose;

	constructor(private elementRef: ElementRef, private errorMessageService: ErrorMessageService) {}

	ngOnChanges(changes: SimpleChanges): void {
		if (changes["epubSrc"] && changes["epubSrc"].currentValue !== changes["epubSrc"].previousValue) {
			console.info("epubSrc changed:", this.epubSrc);
			this.loadEpub(this.epubSrc);
		}
	}

	private loadEpub(src: string) {
		if (!src) {
			return;
		}

		const viewerElement = this.elementRef.nativeElement.querySelector("#viewer");
		if (!viewerElement) {
			console.error("Viewer element not found.");
			return;
		}

		viewerElement.innerHTML = "";

		const book = ePub();

		book.open(src)
			.then(() => {
				const rendition = book.renderTo(viewerElement, {
					width: "100%",
					height: "100%"
				});
				rendition.display().then(() => {
					console.log("Book displayed successfully.");
				}).catch((err: any) => {
					console.error("Error displaying book", err);
					this.handleError("Error displaying book");
				});
			})
			.catch((err: any) => {
				console.error("Error opening book", err);
				this.handleError("Error opening book: File not found or cannot be loaded.");
			});
	}

	private handleError(message: string) {
		this.errorMessageService.open(message);
	}
}

// export interface RenditionOptions {
// 	width?: number | string;
// 	height?: number | string;
// 	ignoreClass?: string;
// 	manager?: string | Function | object;
// 	view?: string | Function | object;
// 	flow?: string;
// 	layout?: string;
// 	spread?: string;
// 	minSpreadWidth?: number;
// 	stylesheet?: string;
// 	resizeOnOrientationChange?: boolean;
// 	script?: string;
// 	infinite?: boolean;
// 	overflow?: string;
// 	snap?: boolean | object;
// 	defaultDirection?: string;
// 	allowScriptedContent?: boolean;
// }
