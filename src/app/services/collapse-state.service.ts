import { Injectable } from "@angular/core";

import { Directory } from "(src)/app/core/headers";

@Injectable({
	providedIn: "root"
})
export class CollapseStateService {
	private _collapseStates: { [key: string]: boolean } = {};
	private lastDirectory?: Directory;
	private _initialized: boolean = false;
	private _lastHash?: string;
	private _pendingHash?: string;

	constructor() {}

	initializeCollapseStates(directory?: Directory): void {
		if (directory && !this._initialized) {
			this.lastDirectory = directory;
			this._initialized = true;

			function initialize(_collapseStates: Record<string, boolean>, directory: Directory, nestingLevel: number = 0) {
				_collapseStates[directory.hash] = nestingLevel >= 1;
				directory.directories.forEach(dir => {
					initialize(_collapseStates, dir, nestingLevel + 1);
				});
			}

			initialize(this._collapseStates, directory);

			if (this._pendingHash) {
				this.toggleCollapseState(this._pendingHash);
			}
		}
	}

	setPendingHash(hash?: string): void {
		if (hash) {
			this._pendingHash = hash;
		}
	}

	get collapseStates(): { [key: string]: boolean } {
		return this._collapseStates;
	}

	clearStates(): void {
		this._collapseStates = {};
		this._initialized = false;
		this._lastHash = undefined;
		this._pendingHash = undefined;
	}

	set initialized(value: boolean) {
		this._initialized = value;
	}

	get lastHash(): string | undefined {
		return this._lastHash;
	}

	toggleCollapseState(hash: string): void {
		this._lastHash = hash;
		let path = [] as string[];
		if (this.lastDirectory) {
			path = this.searchTreePath(this.lastDirectory, hash);
		}

		if (path.length) {
			const clickedHash = path[path.length - 1];
			const clickedHashState = this._collapseStates[clickedHash];
			Object.keys(this._collapseStates).forEach((hash: string) => this._collapseStates[hash] = true);
			path.forEach((p: string) => this._collapseStates[p] = false);
			if (!clickedHashState) {
				this._collapseStates[path[path.length - 1]] = true;
			}
		}
	}

	private searchTreePath(directory: Directory, hash: string): string[] {
		function searchDirPath(directory: Directory, hash: string, path: string[]): string[] | undefined {
			path.push(directory.hash);
			if (directory.hash === hash) {
				return path;
			}

			for (const dir of directory.directories) {
				const result = searchDirPath(dir, hash, JSON.parse(JSON.stringify(path)));
				if (result) {
					return result;
				}
			}

			return undefined;
		}

		const path = searchDirPath(directory, hash, []);

		return path || [];
	}
}
