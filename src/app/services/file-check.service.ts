import { Injectable } from "@angular/core";
import { catchError, map, Observable, of } from "rxjs";

import { File } from "(src)/app/core/headers";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { CacheService } from "(src)/app/services/cache.service";

@Injectable({
	providedIn: "root"
})
export class FileCheckService {

	constructor(private http: HttpClient, private cacheService: CacheService) { }

	checkFileExists(file: File): Observable<boolean> {
		const url = `/covers/${file.coverId}.jpg`;
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
				catchError((error: HttpErrorResponse) => {
					this.cacheService.addToCache(url, false);
					return of(false);
				})
			);
		}
	}
}
