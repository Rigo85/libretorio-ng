import { Injectable } from "@angular/core";
import {
	HttpInterceptor, HttpRequest, HttpHandler, HttpEvent
} from "@angular/common/http";
import { Observable, switchMap } from "rxjs";
import { HttpClient } from "@angular/common/http";

@Injectable()
export class XsrfInterceptor implements HttpInterceptor {
	constructor(private http: HttpClient) {}

	intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
		if (req.url.startsWith("/api/") && ["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
			if (req.headers.has("X-CSRF-Token")) {
				return next.handle(req.clone({withCredentials: true}));
			}

			return this.http.get<{ csrfToken: string }>("/api/csrf-token", {withCredentials: true}).pipe(
				switchMap(({csrfToken}) => {
					const cloned = req.clone({
						setHeaders: {"X-CSRF-Token": csrfToken},
						withCredentials: true
					});
					return next.handle(cloned);
				})
			);
		}

		return next.handle(req);
	}
}
