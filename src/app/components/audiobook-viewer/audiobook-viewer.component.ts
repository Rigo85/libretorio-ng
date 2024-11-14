import { Component, Input, OnChanges, OnInit, SimpleChanges } from "@angular/core";
import { NgxSpinnerModule, NgxSpinnerService } from "ngx-spinner";

import { onClose } from "(src)/app/components/helpers/utils";
import { ErrorMessageComponent } from "(src)/app/components/error-message/error-message.component";
import { BooksService } from "(src)/app/services/books.service";
import { AudioBookMetadata } from "(src)/app/core/headers";
import { NgForOf } from "@angular/common";

@Component({
	selector: "audiobook-viewer",
	standalone: true,
	imports: [
		NgxSpinnerModule,
		ErrorMessageComponent,
		NgForOf
	],
	templateUrl: "./audiobook-viewer.component.html",
	styleUrl: "./audiobook-viewer.component.scss"
})
export class AudiobookViewerComponent implements OnChanges, OnInit {
	@Input() audiobookSrc!: string;
	onClose = onClose;
	audioFiles: AudioBookMetadata[] = [];

	constructor(
		private spinner: NgxSpinnerService,
		private booksService: BooksService) {}

	ngOnChanges(changes: SimpleChanges) {
		if (changes["audiobookSrc"] && changes["audiobookSrc"].currentValue !== changes["audiobookSrc"].previousValue) {
			this.loadAudiobook(this.audiobookSrc);
		}
	}

	ngOnInit() {
		this.booksService.audioBookIncomingMessage$.subscribe((message) => {
			const data = message.data.map((file: AudioBookMetadata) => {
				return {
					...file,
					src: file?.src?.split("dist/public")[1]
				};
			});
			console.log(data);
			this.audioFiles = data;
			this.spinner.hide();
		});
	}

	private loadAudiobook(url: string): void {
		if (!url) {
			return;
		}

		this.spinner.show();
		this.booksService.getAudioBook(url);
	}
}
