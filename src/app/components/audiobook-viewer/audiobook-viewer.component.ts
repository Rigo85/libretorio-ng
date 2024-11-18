import { Component, ElementRef, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, ViewChild } from "@angular/core";
import { NgxSpinnerModule, NgxSpinnerService } from "ngx-spinner";
import { NgForOf, NgIf } from "@angular/common";

import { onClose } from "(src)/app/components/helpers/utils";
import { ErrorMessageComponent } from "(src)/app/components/error-message/error-message.component";
import { BooksService } from "(src)/app/services/books.service";
import { AudioBookMetadata } from "(src)/app/core/headers";
import { StopPlayingService } from "(src)/app/services/stop-playing.service";

@Component({
	selector: "audiobook-viewer",
	standalone: true,
	imports: [
		NgxSpinnerModule,
		ErrorMessageComponent,
		NgForOf,
		NgIf
	],
	templateUrl: "./audiobook-viewer.component.html",
	styleUrl: "./audiobook-viewer.component.scss"
})
export class AudiobookViewerComponent implements OnChanges, OnInit, OnDestroy {
	@Input() audiobookSrc!: string;
	onClose = onClose;
	playlist: AudioBookMetadata[] = [];
	currentTrackIndex = 0;
	currentTrack?: AudioBookMetadata;
	private audio = new Audio();
	isPlaying = false;
	isRepeating = false;
	isContinuous = true;
	currentTime = 0;
	duration = 0;
	@ViewChild("playlistContainer", {static: false}) scrollElement!: ElementRef;

	constructor(
		private spinner: NgxSpinnerService,
		private booksService: BooksService,
		private stopPlayingService: StopPlayingService) {}

	ngOnChanges(changes: SimpleChanges) {
		if (changes["audiobookSrc"] && changes["audiobookSrc"].currentValue !== changes["audiobookSrc"].previousValue) {
			this.loadAudiobook(this.audiobookSrc);
		}
	}

	ngOnInit() {
		this.booksService.audioBookIncomingMessage$.subscribe((message) => {
			this.playlist = message.data.map((file: AudioBookMetadata) => {
				return {
					...file,
					src: file?.src?.split("dist/public")[1]
				};
			});
			this.currentTrackIndex = 0;
			this.currentTrack = this.playlist[this.currentTrackIndex];
			this.audio.src = this.currentTrack.src;
			// console.info(this.currentTrack.src);
			this.spinner.hide().catch(console.error);

			this.scrollTop();
		});

		this.stopPlayingService.stopPlaying$.subscribe((message) => {
			if (message) {
				this.audio.pause();
				this.isPlaying = false;
			}
		});

		this.audio.addEventListener("timeupdate", this.updateTime);
		this.audio.addEventListener("loadedmetadata", this.updateDuration);
		this.audio.addEventListener("ended", this.onTrackEnd);
	}

	ngOnDestroy() {
		this.isPlaying = false;
		this.audio.removeEventListener("timeupdate", this.updateTime);
		this.audio.removeEventListener("loadedmetadata", this.updateDuration);
		this.audio.removeEventListener("ended", this.onTrackEnd);
	}

	private loadAudiobook(url: string): void {
		if (!url) {
			return;
		}

		this.spinner.show().catch(console.error);
		this.booksService.getAudioBook(url);
	}

	togglePlayPause() {
		this.isPlaying ?
			this.audio.pause() :
			this.audio.play().catch((error: any) => {
				console.error("Error playing the audiobook.", error);
			});
		this.isPlaying = !this.isPlaying;
	}

	seek(event: Event) {
		const input = event.target as HTMLInputElement;
		this.audio.currentTime = Number(input.value);
	}

	updateTime = () => {
		this.currentTime = this.audio.currentTime;
	};

	updateDuration = () => {
		this.duration = this.audio.duration;
	};

	onTrackEnd = () => {
		if (this.isContinuous) {
			this.next();
		} else {
			this.isPlaying = false;
		}
	};

	previous() {
		if (this.currentTrackIndex > 0) {
			this.selectTrack(this.currentTrackIndex - 1);
		}
	}

	next() {
		if (this.isRepeating) {
			this.currentTrackIndex = (this.currentTrackIndex + 1) % this.playlist.length;
			this.selectTrack(this.currentTrackIndex);

			if (!this.isPlaying) {
				this.audio.play().catch((error: any) => {
					console.error("Error playing the audiobook.", error);
				});
				this.isPlaying = true;
			}
		} else if (this.currentTrackIndex < this.playlist.length - 1) {
			this.selectTrack(this.currentTrackIndex + 1);

			if (!this.isPlaying) {
				this.audio.play().catch((error: any) => {
					console.error("Error playing the audiobook.", error);
				});
				this.isPlaying = true;
			}
		}
	}

	selectTrack(index: number) {
		this.currentTrackIndex = index;
		this.currentTrack = this.playlist[this.currentTrackIndex];
		this.audio.src = this.currentTrack.src;
		this.audio.load();
		if (this.isPlaying) {
			this.audio.play().catch((error: any) => {
				console.error("Error playing the audiobook.", error);
			});
		}
	}

	toggleRepeat() {
		this.isRepeating = !this.isRepeating;
	}

	toggleContinuousPlay() {
		this.isContinuous = !this.isContinuous;
	}

	formatTime(seconds: number): string {
		// const minutes = Math.floor(seconds / 60);
		// const secs = Math.floor(seconds % 60);
		// return `${minutes}:${secs < 10 ? "0" : ""}${secs}`;
		if (isNaN(seconds) || !seconds) return "0:00";

		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = Math.round(seconds % 60);

		const hours: string = h > 0 ? String(h).padStart(2, "0") + ":" : "";
		const minutes: string = (h > 0 || m > 0) ? String(m).padStart(2, "0") + ":" : "";
		const secs = String(s).padStart(2, "0");

		return hours + minutes + secs;
	}

	private scrollTop() {
		if (this.scrollElement?.nativeElement) {
			setTimeout(() => {
				this.scrollElement.nativeElement.scrollTop = 0;
			}, 100);
		}
	}
}
