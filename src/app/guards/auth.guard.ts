import { CanActivate, Router } from "@angular/router";
import { AuthService } from "(src)/app/services/auth.service";
import { Observable, tap } from "rxjs";
import { Injectable } from "@angular/core";

@Injectable({providedIn: "root"})
export class AuthGuard implements CanActivate {
	constructor(private auth: AuthService, private router: Router) {}

	canActivate(): Observable<boolean> {
		return this.auth.isLoggedIn().pipe(
			tap(loggedIn => {
				if (!loggedIn) this.router.navigate(["/auth/login"]);
			})
		);
	}
}

