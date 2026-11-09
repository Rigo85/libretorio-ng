import { Injectable, OnDestroy, signal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { catchError, defer, finalize, map, Observable, of, ReplaySubject, share, Subject, switchMap, takeUntil, tap, throwError, timeout } from "rxjs";
import { Router } from "@angular/router";
import { BooksService } from "(src)/app/services/books.service";
import { CollapseStateService } from "(src)/app/services/collapse-state.service";
import { StopPlayingService } from "./stop-playing.service";
import { SessionActivityService } from "./session-activity.service";
import { ReadingService } from './reading.service';
import { SearchTextService } from './search-text.service';

declare var bootstrap: any;
const logoutStorageKey = 'libretorio:logout-unconfirmed';
const logoutUnconfirmed = 'No se pudo confirmar el cierre de sesión. La sesión podría seguir activa en el servidor.';

@Injectable({providedIn: "root"})
export class AuthService implements OnDestroy {
	private destroy$ = new Subject<void>();
	private sessionMonitorInterval?: ReturnType<typeof setInterval>;
	private checkingSession = false;
	private expired = false;
	private sessionGeneration = 0;
	readonly logoutPending = signal(false);
	readonly logoutWarning = signal('');
	private logoutRequest?: Observable<void>;

	constructor(
		private http: HttpClient,
		private router: Router,
		private booksService: BooksService,
		private collapseStateService: CollapseStateService,
		private stopPlayingService: StopPlayingService,
		private sessionActivity: SessionActivityService,
		private reading: ReadingService,
		private searchText: SearchTextService
	) {
		try { if(sessionStorage.getItem(logoutStorageKey))this.logoutWarning.set(logoutUnconfirmed); } catch {}
		this.listenForSessionExpired();
		this.startSessionMonitor();
	}

	private startSessionMonitor(): void {
		const sessionCheckInterval = 5 * 60 * 1000;

		this.sessionMonitorInterval = setInterval(() => {
			if (this.checkingSession || this.expired || this.logoutPending() || this.logoutWarning() || this.router.url?.startsWith('/auth')) return;
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
		return defer(() => this.logoutPending()
			? throwError(() => new Error('Logout is still pending')) : this.getCsrfToken()).pipe(
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
						this.searchText.setSearchText('', false);
						this.reading.stop();
						this.expired = false;
						++this.sessionGeneration;
						this.setLogoutUnconfirmed(false);
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
		this.searchText.setSearchText('', false);
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
		++this.sessionGeneration;
		this.cleanupSession();
		this.router.navigate(["/auth/login"], {replaceUrl: true});
	}

	logout(): Observable<void> {
		if(this.logoutRequest)return this.logoutRequest;
		const request = defer(() => {
			++this.sessionGeneration;
			this.logoutPending.set(true);
			this.expired = true;
			this.setLogoutUnconfirmed(true);
			this.cleanupSession();
			return this.getCsrfToken().pipe(switchMap(token => this.http.post<void>(
				'/api/logout', {}, {headers: {'X-CSRF-Token': token}, withCredentials: true}
			)));
		}).pipe(
			// One deadline covers both CSRF bootstrap and the logout response.
			timeout(10_000),
			takeUntil(this.destroy$),
			catchError(error => {
				if(error.status === 401 && ['SESSION_EXPIRED','SESSION_INVALIDATED'].includes(error.error?.code))return of(undefined);
				return throwError(() => error);
			}),
			tap({
				next: () => this.finishLogout(true),
				error: () => this.finishLogout(false)
			}),
			finalize(() => {
				this.logoutPending.set(false);
				if(this.logoutRequest === request)this.logoutRequest = undefined;
			}),
			// Navigation can destroy the caller; a bounded logout must still finish.
			share({connector: () => new ReplaySubject<void>(1), resetOnComplete: false, resetOnError: false, resetOnRefCountZero: false})
		);
		this.logoutRequest = request;
		return request;
	}

	private setLogoutUnconfirmed(value: boolean): void {
		this.logoutWarning.set(value ? logoutUnconfirmed : '');
		try {
			if(value)sessionStorage.setItem(logoutStorageKey, '1');
			else sessionStorage.removeItem(logoutStorageKey);
		} catch {}
	}

	private finishLogout(confirmed: boolean): void {
		this.setLogoutUnconfirmed(!confirmed);
		void Promise.resolve(this.router.navigate(['/auth/login'], {replaceUrl: true})).catch(() => {
			this.logoutWarning.set(confirmed ? 'Sesión cerrada. Recarga la página para entrar.' : logoutUnconfirmed);
		});
	}

	isLoggedIn(): Observable<boolean> {
		if(this.logoutPending() || this.logoutWarning())return of(false);
		const generation = this.sessionGeneration;
		return this.http
			.get<{ authenticated: boolean }>("/api/me?passive=1", {withCredentials: true})
			.pipe(
				map(response => {
					if(generation !== this.sessionGeneration || this.logoutPending() || this.logoutWarning())return false;
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
