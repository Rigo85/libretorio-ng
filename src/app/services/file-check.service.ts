import { Injectable } from "@angular/core";
import { catchError, map, Observable, of, throwError } from "rxjs";

import { HttpClient } from "@angular/common/http";
import { CacheService } from "(src)/app/services/cache.service";

@Injectable({
	providedIn: "root"
})
export class FileCheckService {

	constructor(private http: HttpClient, private cacheService: CacheService) { }

	checkFileExists(id: string | number, webDetails: boolean = false): Observable<boolean> {
		let url: string;
		if (webDetails) {
			url = `/temp_covers/${id}.jpg`;
		} else {
			url = `/covers/${id}.jpg`;
		}

		if (id === "no-cover") {
			return of(false);
		}

		const cachedResult = this.cacheService.checkInCache(url);

		if (cachedResult !== undefined) {
			return of(cachedResult);
		} else {
			return this.http.head(url, {observe: "response"}).pipe(
				map(response => {
					const exists = response.status === 200;
					this.cacheService.addToCache(url, exists);
					return exists;
				}),
				catchError(() => {
					this.cacheService.addToCache(url, false);
					return of(false);
				})
			);
		}
	}
}
