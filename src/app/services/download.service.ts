import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";

@Injectable({
	providedIn: "root"
})
export class DownloadService {

	constructor(private http: HttpClient) { }

	checkFileAvailable(url: string): Observable<string> {
		return this.http.head(url, {responseType: "text"});
	}
}
