import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from "@angular/common/http";
import { AuthService } from "(src)/app/services/auth.service";
import { catchError, Observable, throwError } from "rxjs";
import { Injectable } from "@angular/core";

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
	constructor(private authService: AuthService) {}

	intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
		return next.handle(req).pipe(
			catchError((error) => {
				const isAuthenticationRequest = /^\/api\/(login|logout|csrf-token)(?:[/?]|$)/.test(req.url);
				if (error.status === 401 && !isAuthenticationRequest) {
					console.warn("Expired session detected in HTTP response");
					// Local expiration must not POST logout using a newer cookie from another tab.
					this.authService.expireSession();
				}
				return throwError(() => error);
			})
		);
	}
}
