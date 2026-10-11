import { TestBed } from "@angular/core/testing";
import { HTTP_INTERCEPTORS, HttpClient, provideHttpClient, withInterceptorsFromDi, withXhr } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { XsrfInterceptor } from "./xsrf.interceptor";

describe("XsrfInterceptor", () => {
	let http: HttpClient;
	let controller: HttpTestingController;

	beforeEach(() => {
		TestBed.configureTestingModule({providers: [
			provideHttpClient(withXhr(), withInterceptorsFromDi()),
			provideHttpClientTesting(),
			{provide: HTTP_INTERCEPTORS, useClass: XsrfInterceptor, multi: true}
		]});
		http = TestBed.inject(HttpClient);
		controller = TestBed.inject(HttpTestingController);
	});

	afterEach(() => controller.verify());

	it("preserves a fresh token supplied by login/logout", () => {
		for (const action of ["login", "logout", "login"]) {
			http.post(`/api/${action}`, {}, {headers: {"X-CSRF-Token": `${action}-fresh`}}).subscribe();
			controller.expectNone("/api/csrf-token");
			const req = controller.expectOne(`/api/${action}`);
			expect(req.request.headers.get("X-CSRF-Token")).toBe(`${action}-fresh`);
			expect(req.request.withCredentials).toBeTrue();
			req.flush({});
		}
	});

	it("fetches a new token for each mutation that has no explicit token", () => {
		for (const token of ["session-a", "session-b"]) {
			http.post("/api/login", {}).subscribe();
			const csrf = controller.expectOne("/api/csrf-token");
			expect(csrf.request.withCredentials).toBeTrue();
			csrf.flush({csrfToken: token});
			const req = controller.expectOne("/api/login");
			expect(req.request.headers.get("X-CSRF-Token")).toBe(token);
			req.flush({});
		}
	});

	it("does not send a mutation when token acquisition fails or retain that failure", () => {
		let status: number | undefined;
		http.post("/api/login", {}).subscribe({error: err => status = err.status});
		controller.expectOne("/api/csrf-token").flush({}, {status: 503, statusText: "Unavailable"});
		controller.expectNone("/api/login");
		expect(status).toBe(503);
		http.post("/api/login", {}).subscribe();
		controller.expectOne("/api/csrf-token").flush({csrfToken: "new"});
		controller.expectOne("/api/login").flush({});
	});

	it("does not fetch tokens for reads or leak them to external URLs", () => {
		http.get("/api/me").subscribe();
		controller.expectOne("/api/me").flush({});
		http.post("https://example.invalid/api/upload", {}).subscribe();
		const external = controller.expectOne("https://example.invalid/api/upload");
		expect(external.request.headers.has("X-CSRF-Token")).toBeFalse();
		expect(external.request.withCredentials).toBeFalse();
		external.flush({});
		controller.expectNone("/api/csrf-token");
	});
});
