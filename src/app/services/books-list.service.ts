import { Injectable } from "@angular/core";
import { BehaviorSubject, distinctUntilChanged } from "rxjs";
import { IAdapter } from "ngx-ui-scroll";
import { File } from "(src)/app/core/headers";

export interface BooksQuery {
	parentHash?: string;
	search?: string;
}

const isEqual = (a: BooksQuery, b: BooksQuery): boolean => {
	return (a.parentHash ?? undefined) === (b.parentHash ?? undefined) &&
		(a.search ?? undefined) === (b.search ?? undefined);
};

@Injectable({
	providedIn: "root"
})
export class BooksListService {
	private readonly state = new BehaviorSubject<BooksQuery>({parentHash: undefined});
	private epoch = 0;

	/** Lectura síncrona del estado actual (para Datasource.get) */
	getSnapshot(): BooksQuery { return this.state.value; }

	getEpoch(): number { return this.epoch; }

	/** Suscribe el adapter: cada cambio real → reload(1) */
	bindTo(adapter: IAdapter<File>) {
		this.epoch++;
		adapter.reload(1);

		this.state
			.pipe(distinctUntilChanged(isEqual))
			.subscribe(() => {
				this.epoch++;
				adapter.reload(1);
			});
	}

	setDirectory(parentHash?: string) {
		const next: BooksQuery = {...this.state.value, parentHash: parentHash || undefined, search: undefined};
		this.state.next(next);
	}

	setSearch(search?: string) {
		const s = search?.trim() || undefined;
		const next: BooksQuery = {...this.state.value, search: s};
		this.state.next(next);
	}

	// clearSearch() { this.setSearch(undefined); }

	resetFromRoute(params: { parentHash?: string; search?: string } | string | undefined) {
		const cur = this.state.value;
		const parentHash = typeof params === "string" ? params : params?.parentHash;
		const search = typeof params === "string" ? undefined : params?.search;

		const next: BooksQuery = {
			parentHash: parentHash ?? cur.parentHash,
			search: search ?? cur.search
		};

		if (!isEqual(cur, next)) this.state.next(next);
	}
}
