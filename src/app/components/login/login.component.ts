import { Component, OnDestroy, ChangeDetectionStrategy } from "@angular/core";

import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { finalize, Subscription } from "rxjs";
import { AuthService } from "(src)/app/services/auth.service";
import { Router } from "@angular/router";

@Component({
	selector: "app-login",
	imports: [ReactiveFormsModule],
	templateUrl: "./login.component.html",
	changeDetection: ChangeDetectionStrategy.Eager,
	styleUrl: "./login.component.scss"
})
export class LoginComponent implements OnDestroy {

	error = "";
	loginForm: FormGroup;
	private loginSub?: Subscription;
	private logoutSub?: Subscription;
	loggingIn = false;

	constructor(private fb: FormBuilder, public authService: AuthService, private router: Router) {
		this.loginForm = this.fb.group({
			email: ["", Validators.required],
			password: ["", Validators.required]
		});
	}

	onSubmit() {
		if(this.loggingIn || this.authService.logoutPending())return;
		if (this.loginForm.invalid) {
			this.error = "Please fill in all required fields.";
			return;
		}

		const {email, password} = this.loginForm.value;
		this.error = "";

		this.loginSub?.unsubscribe();
		this.loggingIn = true;
		this.loginSub = this.authService.login(email, password).pipe(finalize(() => this.loggingIn=false)).subscribe({
			next: () => {
				// console.info("Login successful.");

				this.router.navigate(["/inicio"]);
			},
			error: (err) => {
				console.error("Login failed.", err);

				this.error = "Login failed.";
			}
		});
	}

	ngOnDestroy(): void {
		this.loginSub?.unsubscribe();
		this.logoutSub?.unsubscribe();
	}

	retryLogout(): void {
		if(this.loggingIn || this.authService.logoutPending())return;
		this.logoutSub?.unsubscribe();
		this.logoutSub = this.authService.logout().subscribe({error: () => {}});
	}

}
