import { Injectable } from "@angular/core";
import { Directory } from "(src)/app/core/headers";

@Injectable({
	providedIn: "root"
})
export class CollapseStateService {
	private _collapseStates: { [key: string]: boolean } = {};

	initializeCollapseStates(directory?: Directory, nestingLevel: number = 0): void {
		if (directory) {
			this._collapseStates[directory.hash] = nestingLevel >= 1;
			directory.directories.forEach(dir => {
				this.initializeCollapseStates(dir, nestingLevel + 1);
			});
		}
	}

	get collapseStates(): { [key: string]: boolean } {
		return this._collapseStates;
	}

	toggleCollapseState(hash: string): void {
		this._collapseStates[hash] = !this._collapseStates[hash];
	}
}
