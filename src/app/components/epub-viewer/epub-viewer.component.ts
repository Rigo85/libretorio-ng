import {
	Component,
	ElementRef,
	HostListener,
	Input,
	OnChanges, OnInit,
	Renderer2,
	SimpleChanges,
	ViewChild
} from "@angular/core";
import { NgForOf, NgIf } from "@angular/common";
// import Hammer from "hammerjs";

import { ErrorMessageComponent } from "(src)/app/components/error-message/error-message.component";
import { onClose } from "(src)/app/components/helpers/utils";
import { ErrorMessageService } from "(src)/app/services/error-message.service";
import { NgxSpinnerModule, NgxSpinnerService } from "ngx-spinner";
import { FileKind } from "(src)/app/core/headers";

declare var ePub: any;

@Component({
	selector: "epub-viewer",
	standalone: true,
	imports: [
		ErrorMessageComponent,
		NgForOf,
		NgIf,
		NgxSpinnerModule
	],
	templateUrl: "./epub-viewer.component.html",
	styleUrl: "./epub-viewer.component.scss"
})
export class EpubViewerComponent implements OnChanges, OnInit {
	@Input() epubSrc!: string;
	@ViewChild("tocList", {static: true}) tocList!: ElementRef;
	@Input() fileKind!: FileKind;
	onClose = onClose;
	private book: any;
	private rendition: any;
	toc: any[] = [];
	tocHidden = true;
	optionsHidden = true;
	theme = "dark-theme";
	fontSize = 120;
	percentage = 0;

	constructor(
		private elementRef: ElementRef,
		private renderer: Renderer2,
		private errorMessageService: ErrorMessageService,
		private spinner: NgxSpinnerService) {}

	ngOnChanges(changes: SimpleChanges): void {
		if (changes["epubSrc"] && changes["epubSrc"].currentValue !== changes["epubSrc"].previousValue) {
			this.loadEpub(this.epubSrc).catch((error: any) => {
				console.error("Error loading epub: ", error);
				this.handleError(`Error loading epub: "${this.epubSrc}"`);
			});
		}
	}

	ngOnInit() {
		this.fontSize = localStorage.getItem("fontSize") ? parseInt(localStorage.getItem("fontSize") as string, 10) : 120;
	}

	private async loadEpub(src: string) {
		if (!src) {
			return;
		}

		const viewerElement = this.elementRef.nativeElement.querySelector("#viewer");
		if (!viewerElement) {
			console.error("Viewer element not found.");
			return;
		}

		viewerElement.innerHTML = "";

		this.book = ePub();

		try {
			await this.book.open(this.fileKind === FileKind.FILE ? src : `${src}/OEBPS/content.opf`);

			this.spinner.show();
			await this.book.locations.generate(1024);
			this.spinner.hide();

			await this.createAndDisplayRendition(viewerElement);
			await this.book.ready;
			this.bookReady();
		} catch (error) {
			this.spinner.hide();
			console.error("Error opening book: ", error);
			this.handleError("Error opening book: File not found or cannot be loaded.");
		}
	}

	private async createAndDisplayRendition(viewerElement: HTMLElement) {
		this.rendition = this.book.renderTo(viewerElement, {
			manager: "continuous",
			flow: "scrolled",
			// spread: "none",
			width: "100%",
			height: "100%",
			stylesheet: this.theme === "dark-theme" ? "/css/dark-theme.css" : "/css/light-theme.css"
		});

		try {
			// NOTE: Ej. de como aplicar hooks al ePUB.js
			// this.rendition.hooks.content.register(this.addSwipeDetection.bind(this));
			// this.rendition.hooks.content.register(this.addClickEventListener.bind(this));

			this.rendition.themes.register("dark-theme", "/css/themes.css");
			// this.rendition.themes.register("light-theme", "/css/themes.css");

			this.rendition.themes.select(this.theme);
			this.rendition.themes.fontSize(`${this.fontSize}%`);

			this.rendition.on("relocated", this.onRelocated.bind(this));

			await this.rendition.display();
		} catch (error) {
			console.error("Error displaying book: ", error);
			this.handleError("Error displaying book.");
		}
	}

	private bookReady() {
		// const overlay = this.elementRef.nativeElement.querySelector("#overlay");
		//
		// if (overlay) {
		// 	this.addSwipeDetection(overlay);
		// } else {
		// 	console.error("Overlay element not found.");
		// }

		this.loadToc();
	}

	@HostListener("document:keyup", ["$event"])
	handleKeyUp(event: KeyboardEvent) {
		if (event.key === "ArrowLeft") {
			this.rendition.prev();
		} else if (event.key === "ArrowRight") {
			this.rendition.next();
		}
	}

	// private addSwipeDetection(element: any) {
	// 	// if (element) {
	// 	// 	const hammer = new Hammer(element);
	// 	// 	hammer.get("swipe").set({direction: Hammer.DIRECTION_HORIZONTAL});
	// 	// 	// hammer.on("swipeleft", () => this.nextPage());
	// 	// 	// hammer.on("swiperight", () => this.prevPage());
	// 	// } else {
	// 	// 	console.error("Could not find the viewer element in iframe.");
	// 	// }
	// }

	private handleError(message: string) {
		this.errorMessageService.open(message);
	}

	private loadToc() {
		this.book.loaded.navigation.then((toc: any) => {
			this.toc = toc;
			this.renderer.setProperty(this.tocList.nativeElement, "innerHTML", "");

			toc.forEach((chapter: any) => {
				const li = this.renderer.createElement("li");
				const text = this.renderer.createText(chapter.label);
				this.renderer.appendChild(li, text);
				this.renderer.setAttribute(li, "data-href", chapter.href);
				this.renderer.setStyle(li, "cursor", "pointer");
				this.renderer.listen(li, "click", () => {
					this.rendition.display(chapter.href);
					this.toggleToc();
				});
				this.renderer.appendChild(this.tocList.nativeElement, li);
			});

			const tocToggle = this.elementRef.nativeElement.querySelector("#toc-toggle");
			const tocContent = this.elementRef.nativeElement.querySelector("#toc-content");

			if (tocToggle) {
				this.renderer.listen(tocToggle, "click", () => {
					this.renderer.addClass(tocContent, "open");
				});
			} else {
				console.error("#toc-toggle element not found.");
			}
		});
	}

	toggleToc() {
		this.tocHidden = !this.tocHidden;
		if (!this.tocHidden) {
			this.optionsHidden = true;
		}
	}

	toggleOptions() {
		this.optionsHidden = !this.optionsHidden;
		if (!this.optionsHidden) {
			this.tocHidden = true;
		}
	}

	@HostListener("document:click", ["$event"])
	onDocumentClick(event: MouseEvent) {
		const target = event.target as HTMLElement;
		// const overlay = this.elementRef.nativeElement.querySelector("#overlay");

		if (!target.closest(".navbar") && !target.closest(".custom-offcanvas") && !this.tocHidden) {
			this.tocHidden = true;
		}

		// if (overlay && overlay.contains(target)) {
		// 	const rect = overlay.getBoundingClientRect();
		// 	const clickX = event.clientX - rect.left;
		// 	const viewerWidth = rect.width;
		//
		// 	if (clickX < viewerWidth / 2) {
		// 		this.prevPage();
		// 	} else {
		// 		this.nextPage();
		// 	}
		// }
	}

	// private isMobileDevice(): boolean {
	// 	return window.matchMedia("(pointer: coarse)").matches;
	// }

	// private nextPage() {
	// 	if (this.rendition) {
	// 		this.rendition.next();
	// 	}
	// }
	//
	// private prevPage() {
	// 	if (this.rendition) {
	// 		this.rendition.prev();
	// 	}
	// }

	onFontSizeChange(event: Event) {
		const inputElement = event.target as HTMLInputElement;
		this.fontSize = parseInt(inputElement.value || "120", 10);
		localStorage.setItem("fontSize", inputElement.value);
		if (this.rendition) {
			this.rendition.themes.fontSize(`${inputElement.value}%`);
		}
	}

	private onRelocated(location: any) {
		const percent = this.book.locations.percentageFromCfi(location.start.cfi);
		this.percentage = Math.floor(percent * 100);
	}
}
