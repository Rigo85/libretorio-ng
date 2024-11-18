import { Injectable } from "@angular/core";
import { BehaviorSubject } from "rxjs";

@Injectable({
	providedIn: "root"
})
export class StopPlayingService {
	private stopPlaying = new BehaviorSubject<boolean>(false);
	stopPlaying$ = this.stopPlaying.asObservable();

	constructor() { }

	stopPlayingAudio() {
		this.stopPlaying.next(true);
	}
}
