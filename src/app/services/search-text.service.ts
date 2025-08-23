import { Injectable } from "@angular/core";
import { BehaviorSubject } from "rxjs";

@Injectable({
	providedIn: "root"
})
export class SearchTextService {
	private searchTextSource = new BehaviorSubject<string>("")
	// searchText$ = this.searchTextSource.asObservable();

	private resetSource = new BehaviorSubject<boolean>(false);
	reset$ = this.resetSource.asObservable();

	get searchText(): string {
		return this.searchTextSource.getValue();
	}

	setSearchText(value: string, needReset: boolean = false): void {
		this.searchTextSource.next(value);
		if (needReset) {
			this.resetSource.next(true);
		}
	}

	constructor() { }
}
