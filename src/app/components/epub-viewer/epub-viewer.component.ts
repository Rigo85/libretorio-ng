import {
  Component,
  ElementRef,
  NgZone,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Renderer2,
  SimpleChanges,
  ViewChild,
  ChangeDetectionStrategy
} from "@angular/core";
import { ErrorMessageComponent } from "(src)/app/components/error-message/error-message.component";
import { onClose } from "(src)/app/components/helpers/utils";
import { ErrorMessageService } from "(src)/app/services/error-message.service";
import { NgxSpinnerModule, NgxSpinnerService } from "ngx-spinner";
import { FileKind } from "(src)/app/core/headers";

import ePub from "epubjs";
import { SessionActivityService } from "(src)/app/services/session-activity.service";
import { EpubSpeechComponent } from "../epub-speech/epub-speech.component";
import { captureEpubSelection, EpubSelection, EpubSpeechContext } from '../../core/epub-speech-source';
import {ReadingService,ReadingTracker} from '../../services/reading.service';
import {ReadingStatusComponent} from '../reading-status/reading-status.component';
import {DocumentSearch,DocumentHit} from '../../core/document-search';
import {EpubDocumentSearch} from '../../core/epub-document-search';
import {DocumentSearchComponent} from '../document-search/document-search.component';
import {NgTemplateOutlet} from '@angular/common';
import {applyMobileEpubMargins} from '../../core/epub-mobile-margins';

@Component({
	selector: "epub-viewer",
	imports: [
		DocumentSearchComponent,
		NgTemplateOutlet,
		ReadingStatusComponent,
		EpubSpeechComponent,
		ErrorMessageComponent,
		NgxSpinnerModule
	],
	templateUrl: "./epub-viewer.component.html",
	changeDetection: ChangeDetectionStrategy.Eager,
	styleUrl: "./epub-viewer.component.scss"
})
export class EpubViewerComponent implements OnChanges, OnInit, OnDestroy {
	@Input() epubSrc!: string;
	@Input() archiveId?: number | string;
	@ViewChild("tocList", {static: true}) tocList!: ElementRef;
	@Input() fileKind!: FileKind;
	onClose = onClose;
	private book: any;
	private rendition: any;
	private activityListeners = new Map<Document, () => void>();
	toc: any[] = [];
	tocHidden = true;
	optionsHidden = true;
	theme = "dark-theme";
	fontSize = 120;
	percentage = 0;
	speechContext?: EpubSpeechContext;
	speechSelection?: EpubSelection;
	progress?:ReadingTracker;
	historyWarning='';
	search?:DocumentSearch;
	private searchHighlight?:string;
	private searchSelection=0;
	private bookmarkInteraction=false;
	private readingGeneration=0;

	constructor(
		private elementRef: ElementRef,
		private renderer: Renderer2,
		private errorMessageService: ErrorMessageService,
		private sessionActivity: SessionActivityService,
		private zone: NgZone,
		private spinner: NgxSpinnerService,public readingStore:ReadingService) {}

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
		this.clearSearchHighlight();
		this.search?.close();this.search=undefined;
		this.clearActivityListeners();
		const generation=this.readingGeneration;
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
			if (this.archiveId !== undefined) {
				const path = new URL(src, location.origin).pathname;
				this.speechContext = {archiveId: this.archiveId, path, book: this.book,
					resourceRoot: this.fileKind === FileKind.FILE ? undefined : `${path}/OEBPS/`};
			}

			this.spinner.show();
			await this.book.locations.generate(1024);
			this.spinner.hide();
			let progress:ReadingTracker|undefined;
			try{progress=await this.readingStore.begin(this.archiveId,'epub');}
			catch{this.historyWarning='Historial no disponible. Puedes leer sin modificar el marcador.';}
			if(generation!==this.readingGeneration){progress?.dispose(false);return;}
			this.progress=progress;
			if(progress){const prefs=await this.readingStore.settings('epub').catch(()=>undefined);if(generation!==this.readingGeneration)return;this.fontSize=prefs?.fontSize??120;}

			await this.createAndDisplayRendition(viewerElement);
			await this.book.ready;
			this.search=new DocumentSearch(new EpubDocumentSearch(this.book),()=>this.zone.run(()=>{}));
			this.bookReady();
			if(this.progress)this.progress.ready=true;
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
			const rendition = this.rendition;
			rendition.hooks.content.register((contents: {document: Document; cfiFromRange(range: Range): string}) => {
				if (this.rendition !== rendition || this.activityListeners.has(contents.document)) return;
				applyMobileEpubMargins(contents.document, rendition.manager?.layout?.name);
				for (const [doc, detach] of this.activityListeners) {
					if (!doc.defaultView?.frameElement?.isConnected) { detach(); this.activityListeners.delete(doc); }
				}
				const detachActivity = this.sessionActivity.observe(contents.document);
				const bookmarkInput=(event:Event)=>this.allowBookmarkCapture(event);
				for(const name of ['wheel','touchmove','pointerdown','keydown'])contents.document.addEventListener(name,bookmarkInput,{passive:true});
				const selectionChanged = () => {
					if (this.rendition !== rendition) return;
					if (!this.speechContext) return;
					let selection: EpubSelection | undefined;
					try { selection = captureEpubSelection(contents, this.speechContext); }
					catch { selection = undefined; }
					this.zone.run(() => this.speechSelection = selection);
				};
				contents.document.addEventListener('selectionchange', selectionChanged);
				this.activityListeners.set(contents.document, () => {
					for(const name of ['wheel','touchmove','pointerdown','keydown'])contents.document.removeEventListener(name,bookmarkInput);
					detachActivity(); contents.document.removeEventListener('selectionchange', selectionChanged);
				});
			});
			rendition.hooks.unloaded.register((view: {document: Document}) => {
				this.activityListeners.get(view.document)?.();
				this.activityListeners.delete(view.document);
			});
			this.rendition.on("attached", () => {
				const container = viewerElement.querySelector(".epub-container");
				// Continuous EPUB.js already compensates for sections inserted above the viewport.
				if (container) this.renderer.setStyle(container, "overflow-anchor", "none");
			});

			// NOTE: Ej. de como aplicar hooks al ePUB.js
			// this.rendition.hooks.content.register(this.addSwipeDetection.bind(this));
			// this.rendition.hooks.content.register(this.addClickEventListener.bind(this));

			this.rendition.themes.register("dark-theme", "/css/themes.css");
			// this.rendition.themes.register("light-theme", "/css/themes.css");

			this.rendition.themes.select(this.theme);
			this.rendition.themes.fontSize(`${this.fontSize}%`);

			this.rendition.on("relocated", this.onRelocated.bind(this));

			await this.rendition.display(this.progress?.restored?.cfi);
		} catch (error) {
			console.error("Error displaying book: ", error);
			if(this.progress){this.progress.blocked=true;this.progress.status.set('No se pudo recuperar la ubicacion guardada.');}
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
		if((event.target as Element)?.closest?.('input,textarea,select,[contenteditable],dialog,document-search'))return;
		if (event.key === "ArrowLeft") {
			this.rendition?.prev();
		} else if (event.key === "ArrowRight") {
			this.rendition?.next();
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
			if (!this.book) return;
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
		if(this.progress?.ready)this.readingStore.changeSettings('epub',{fontSize:this.fontSize});
		if (this.rendition) {
			this.rendition.themes.fontSize(`${inputElement.value}%`);
		}
	}

	async searchResult(hit:DocumentHit){
		if(!hit.cfi||!this.rendition)return;
		this.clearSearchHighlight();
		const rendition=this.rendition,selection=this.searchSelection;
		this.tocHidden=true;this.optionsHidden=true;this.bookmarkInteraction=true;
		try{
			await rendition.display(hit.cfi);
			if(rendition!==this.rendition||selection!==this.searchSelection)return;
			rendition.annotations.highlight(hit.cfi,{},undefined,'reader-search-hit',{'fill':'#f0c64c','fill-opacity':'0.4','mix-blend-mode':'normal','pointer-events':'none'});
			this.searchHighlight=hit.cfi;
		}catch{if(selection===this.searchSelection&&this.search)this.search.error='No se pudo localizar esta coincidencia.';}
	}
	clearSearchHighlight(){
		++this.searchSelection;
		if(this.searchHighlight)this.rendition?.annotations?.remove(this.searchHighlight,'highlight');
		this.searchHighlight=undefined;
	}
	private onRelocated(location: any) {
		if (!this.book) return;
		const percent = this.book.locations.percentageFromCfi(location.start.cfi);
		this.percentage = Math.floor(percent * 100);
		const section=location.start.href?.split('#')[0];
		if(section&&this.bookmarkInteraction){try{this.progress?.capture({version:1,cfi:location.start.cfi,section:decodeURI(section),percent:this.percentage});}catch{}}
	}
	@HostListener('wheel',['$event'])
	@HostListener('touchmove',['$event'])
	@HostListener('pointerdown',['$event'])
	@HostListener('keydown',['$event'])
	allowBookmarkCapture(event:Event){if(event.isTrusted)this.bookmarkInteraction=true;}

	ngOnDestroy(): void {
		this.clearSearchHighlight();
		this.search?.close();this.search=undefined;
		this.clearActivityListeners();
		this.rendition = null;
		this.book = null;
		this.toc = [];
	}

	private clearActivityListeners(): void {
		++this.readingGeneration;this.progress?.dispose();this.progress=undefined;this.bookmarkInteraction=false;this.historyWarning='';
		this.speechSelection = undefined;
		this.speechContext = undefined;
		for (const detach of this.activityListeners.values()) detach();
		this.activityListeners.clear();
	}
}
