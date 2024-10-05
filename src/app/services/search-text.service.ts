import { Injectable } from "@angular/core";
import { BehaviorSubject } from "rxjs";

@Injectable({
	providedIn: "root"
})
export class SearchTextService {
	private searchTextSource = new BehaviorSubject<string>("");
	searchText$ = this.searchTextSource.asObservable();

	get searchText(): string {
		return this.searchTextSource.getValue();
	}

	set searchText(value: string) {
		this.searchTextSource.next(value);
	}

	constructor() { }
}
