import { Injectable } from "@angular/core";

@Injectable({
	providedIn: "root"
})
export class CacheService {
	private cache = new Map<string, boolean>();

	checkInCache(url: string): boolean | undefined {
		return this.cache.get(url);
	}

	addToCache(url: string, exists: boolean): void {
		this.cache.set(url, exists);
	}

	removeFromCache(url: string): void {
		this.cache.delete(url);
	}
}
