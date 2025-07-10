import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from "@angular/common/http";
import { Router } from "@angular/router";
import { AuthService } from "(src)/app/services/auth.service";
import { catchError, Observable, throwError } from "rxjs";
import { Injectable } from "@angular/core";

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
	constructor(private router: Router, private authService: AuthService) {}

	intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
		return next.handle(req).pipe(
			catchError((error) => {
				if (error.status === 401) {
					console.warn("Expired session detected in HTTP response");
					this.authService.logout().subscribe({
						next: () => {
							this.router.navigate(["/auth/login"], {replaceUrl: true});
						},
						error: () => {
							this.router.navigate(["/auth/login"], {replaceUrl: true});
						}
					});
				}
				return throwError(() => error);
			})
		);
	}
}

