import { Injectable, OnDestroy } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { catchError, finalize, map, Observable, of, Subject, switchMap, takeUntil, timeout } from "rxjs";
import { Router } from "@angular/router";
import { BooksService } from "(src)/app/services/books.service";
import { CollapseStateService } from "(src)/app/services/collapse-state.service";
import { StopPlayingService } from "./stop-playing.service";
import { SessionActivityService } from "./session-activity.service";
import { ReadingService } from './reading.service';

declare var bootstrap: any;

@Injectable({providedIn: "root"})
export class AuthService implements OnDestroy {
	private destroy$ = new Subject<void>();
	private sessionMonitorInterval?: ReturnType<typeof setInterval>;
	private checkingSession = false;
	private expired = false;

	constructor(
		private http: HttpClient,
		private router: Router,
		private booksService: BooksService,
		private collapseStateService: CollapseStateService,
		private stopPlayingService: StopPlayingService,
		private sessionActivity: SessionActivityService,
		private reading: ReadingService
	) {
		this.listenForSessionExpired();
		this.startSessionMonitor();
	}

	private startSessionMonitor(): void {
		const sessionCheckInterval = 5 * 60 * 1000;

		this.sessionMonitorInterval = setInterval(() => {
			if (this.checkingSession || this.expired || this.router.url?.startsWith('/auth')) return;
			this.checkingSession = true;
			this.http.get<{authenticated: boolean}>("/api/me?passive=1", {withCredentials: true}).pipe(
				timeout(10_000), takeUntil(this.destroy$), finalize(() => this.checkingSession = false)
			).subscribe({
				next: (response) => {
					if (!response.authenticated) {
						console.warn("Session expired or invalid, redirecting to login");
						this.expireSession();
					}
				},
				error: error => {
					if (error.status === 401) {
						this.expireSession();
					} else console.warn("Session check temporarily unavailable; preserving playback");
				}
			});
		}, sessionCheckInterval);
	}

	private listenForSessionExpired(): void {
		this.booksService.sessionExpiredIncomingMessage$
			.pipe(takeUntil(this.destroy$))
			.subscribe((msg) => {
				console.warn("Session expired:", msg.data.message);
				this.expireSession();
			});
	}

	ngOnDestroy(): void {
		clearInterval(this.sessionMonitorInterval);
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
						this.reading.stop();
						this.expired = false;
						this.sessionActivity.reset();
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

	private closeAllModals(): void {
		(document.activeElement as HTMLElement)?.blur();
		document.querySelectorAll<HTMLElement>(".modal").forEach(el => {
			const instance = bootstrap.Modal.getInstance(el);
			if (instance) instance.dispose();
			el.classList.remove("show");
			el.style.display = "none";
			el.setAttribute("aria-hidden", "true");
			el.removeAttribute("aria-modal");
		});
		document.querySelectorAll(".modal-backdrop").forEach(el => el.remove());
		document.body.classList.remove("modal-open");
		document.body.style.removeProperty("overflow");
		document.body.style.removeProperty("padding-right");
	}

	private cleanupSession(): void {
		this.reading.stop();
		this.sessionActivity.stop();
		this.stopPlayingService.stopPlayingAudio();
		this.closeAllModals();
		this.collapseStateService.clearStates();
		this.booksService.disconnect();
	}

	expireSession(): void {
		if (this.expired) return;
		this.expired = true;
		this.cleanupSession();
		this.router.navigate(["/auth/login"], {replaceUrl: true});
	}

	logout(): Observable<void> {
		this.cleanupSession();

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
			.get<{ authenticated: boolean }>("/api/me?passive=1", {withCredentials: true})
			.pipe(
				map(response => {
					if (response.authenticated) this.expired = false;
					return response.authenticated;
				}),
				catchError(() => of(false))
			);
	}

	isAdmin(): Observable<boolean> {
		return this.http
			.get<{ authenticated: boolean, isAdmin: boolean }>("/api/me?passive=1", {withCredentials: true})
			.pipe(
				map(response => response.isAdmin),
				catchError(() => of(false))
			);
	}
}
