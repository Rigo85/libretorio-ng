import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { catchError, map, Observable, of, switchMap } from "rxjs";

@Injectable({providedIn: "root"})
export class AuthService {
	constructor(private http: HttpClient) {}

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
