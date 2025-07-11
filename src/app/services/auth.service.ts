import { Injectable, OnDestroy } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { catchError, map, Observable, of, Subject, switchMap, takeUntil } from "rxjs";
import { Router } from "@angular/router";
import { BooksService } from "(src)/app/services/books.service";
import { CollapseStateService } from "(src)/app/services/collapse-state.service";

@Injectable({providedIn: "root"})
export class AuthService implements OnDestroy {
	private destroy$ = new Subject<void>();

	constructor(
		private http: HttpClient,
		private router: Router,
		private booksService: BooksService,
		private collapseStateService: CollapseStateService
	) {
		this.listenForSessionExpired();
		this.startSessionMonitor();
	}

	private startSessionMonitor(): void {
		const sessionCheckInterval = 5 * 60 * 1000;

		setInterval(() => {
			this.isLoggedIn().subscribe({
				next: (isLoggedIn) => {
					if (!isLoggedIn) {
						console.warn("Session expired or invalid, redirecting to login");
						this.router.navigate(["/auth/login"], {replaceUrl: true});
					}
				},
				error: () => {
					console.error("Error checking session status");
					this.router.navigate(["/auth/login"], {replaceUrl: true});
				}
			});
		}, sessionCheckInterval);
	}

	private listenForSessionExpired(): void {
		this.booksService.sessionExpiredIncomingMessage$
			.pipe(takeUntil(this.destroy$))
			.subscribe((msg) => {
				console.warn("Session expired:", msg.data.message);

				this.logout().subscribe({
					next: () => {
						console.log("Successful logout after expiration");
						setTimeout(() => {
							this.router.navigate(["/auth/login"], {replaceUrl: true});
						}, 100);
					},
					error: (err) => {
						console.error("Error closing session after expiration:", err);
						this.router.navigate(["/auth/login"], {replaceUrl: true});
					}
				});
			});
	}

	ngOnDestroy(): void {
		this.destroy$.next();
		this.destroy$.complete();
	}

	getCsrfToken(): Observable<string> {
		return this.http
			.get<{ csrfToken: string }>("/api/csrf-token", {withCredentials: true})
			.pipe(map(r => r.csrfToken));
	}

	login(email: string, password: string): Observable<void> {
		return this.getCsrfToken().pipe(
			switchMap(token =>
				this.http.post<void>(
					"/api/login",
					{email, password},
					{
						headers: {"X-CSRF-Token": token},
						withCredentials: true,
						observe: "response",
						responseType: "text" as "json"
					}
				).pipe(
					map(response => {
						// console.info("Login successful", response);
						return;
					})
				)
			),
			catchError(error => {
				console.error("Login failed", error);
				throw error;
			})
		);
	}

	logout(): Observable<void> {
		this.collapseStateService.clearStates();
		this.booksService.disconnect();

		return this.getCsrfToken().pipe(
			switchMap(token =>
				this.http.post<void>(
					"/api/logout",
					{},
					{headers: {"X-CSRF-Token": token}, withCredentials: true}
				)
			)
		);
	}

	isLoggedIn(): Observable<boolean> {
		return this.http
			.get<{ authenticated: boolean }>("/api/me", {withCredentials: true})
			.pipe(
				map(response => response.authenticated),
				catchError(() => of(false))
			);
	}

	isAdmin(): Observable<boolean> {
		return this.http
			.get<{ authenticated: boolean, isAdmin: boolean }>("/api/me", {withCredentials: true})
			.pipe(
				map(response => response.isAdmin),
				catchError(() => of(false))
			);
	}
}
