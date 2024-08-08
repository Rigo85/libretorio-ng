import { Injectable } from "@angular/core";

import { File } from "(src)/app/core/headers";
import { Subject } from "rxjs";

@Injectable({
	providedIn: "root"
})
export class UrlParamsService {
	private _hasUrlParams: boolean = false;
	private _id?: string;
	private _parentHash!: string;
	private fileMessages = new Subject<File>();
	public fileMessage$ = this.fileMessages.asObservable();

	constructor() { }

	public get hasUrlParams(): boolean {
		return this._hasUrlParams;
	}

	public get id(): string | undefined {
		return this._id;
	}

	public get parentHash(): string {
		return this._parentHash;
	}

	public set hasUrlParams(value: boolean) {
		this._hasUrlParams = value;
	}

	public set id(value: string) {
		this._id = value;
	}

	public set parentHash(value: string) {
		this._parentHash = value;
	}

	public setSelectedFile(file: File): void {
		this.fileMessages.next(file);
	}
}
