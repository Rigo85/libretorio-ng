import { Injectable } from "@angular/core";
import { Directory } from "(src)/app/core/headers";
import { Subject } from "rxjs";

@Injectable({
	providedIn: "root"
})
export class LeftPanelUpdateService {

	private directoriesMessages = new Subject<Directory>();
	public directoriesMessage$ = this.directoriesMessages.asObservable();

	constructor() { }

	public setDirectories(directories: Directory): void {
		this.directoriesMessages.next(directories);
	}
}
