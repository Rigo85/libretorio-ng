import { Injectable } from "@angular/core";

@Injectable({
	providedIn: "root"
})
export class CurrentClickDirectoryService {

	private _lastClickedDirectory?: string;

	constructor() { }

	set lastClickedDirectory(directory: string | undefined) {
		this._lastClickedDirectory = directory;
	}

	get lastClickedDirectory(): string | undefined {
		return this._lastClickedDirectory;
	}
}
