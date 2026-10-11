import { HttpErrorResponse, HttpHandler, HttpRequest } from "@angular/common/http";
import { throwError } from "rxjs";
import { AuthService } from "../services/auth.service";
import { AuthInterceptor } from "./auth.interceptor";

describe("AuthInterceptor", () => {
	let auth: jasmine.SpyObj<AuthService>;
	let interceptor: AuthInterceptor;
	const unauthorized: HttpHandler = {handle: () => throwError(() => new HttpErrorResponse({status: 401}))};

	beforeEach(() => {
		auth = jasmine.createSpyObj<AuthService>("AuthService", ["logout", "expireSession"]);
		interceptor = new AuthInterceptor(auth);
	});

	it("does not recursively log out for authentication endpoint failures", () => {
		for (const url of ["/api/login", "/api/logout", "/api/csrf-token"]) {
			interceptor.intercept(new HttpRequest("GET", url), unauthorized).subscribe({error: () => {}});
		}
		expect(auth.logout).not.toHaveBeenCalled();
		expect(auth.expireSession).not.toHaveBeenCalled();
	});

	it("expires locally without sending logout with a newer cookie from another tab", () => {
		for (const url of ["/api/me", "/api/another"]) {
			interceptor.intercept(new HttpRequest("GET", url), unauthorized).subscribe({error: () => {}});
		}
		expect(auth.logout).not.toHaveBeenCalled();
		expect(auth.expireSession).toHaveBeenCalledTimes(2);
	});

	it("preserves the session on a temporary server failure", () => {
		const unavailable = {handle: () => throwError(() => new HttpErrorResponse({status:503}))};
		interceptor.intercept(new HttpRequest("GET", "/api/me"), unavailable).subscribe({error: () => {}});
		expect(auth.expireSession).not.toHaveBeenCalled();
	});
});
