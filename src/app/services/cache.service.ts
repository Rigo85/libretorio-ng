import { Injectable } from "@angular/core";

@Injectable({
	providedIn: "root"
})
export class CacheService {
	private cache = new Map<string, boolean>();

	checkInCache(url: string): boolean | undefined {
		return this.cache.get(url);
	}

	private readonly MAX_SIZE = 500;

	addToCache(url: string, exists: boolean): void {
		if (this.cache.size >= this.MAX_SIZE) {
			this.cache.delete(this.cache.keys().next().value!);
		}
		this.cache.set(url, exists);
	}

	// removeFromCache(url: string): void {
	// 	this.cache.delete(url);
	// }
}
