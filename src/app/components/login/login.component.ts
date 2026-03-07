import { Component, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { Subscription } from "rxjs";
import { AuthService } from "(src)/app/services/auth.service";
import { Router } from "@angular/router";

@Component({
	selector: "app-login",
	imports: [CommonModule, ReactiveFormsModule],
	templateUrl: "./login.component.html",
	styleUrl: "./login.component.scss"
})
export class LoginComponent implements OnDestroy {

	error = "";
	loginForm: FormGroup;
	private loginSub?: Subscription;

	constructor(private fb: FormBuilder, private authService: AuthService, private router: Router) {
		this.loginForm = this.fb.group({
			email: ["", Validators.required],
			password: ["", Validators.required]
		});
	}

	onSubmit() {
		if (this.loginForm.invalid) {
			this.error = "Please fill in all required fields.";
			return;
		}

		const {email, password} = this.loginForm.value;
		this.error = "";

		this.loginSub?.unsubscribe();
		this.loginSub = this.authService.login(email, password).subscribe({
			next: () => {
				// console.info("Login successful.");

				this.router.navigate(["/"]);
			},
			error: (err) => {
				console.error("Login failed.", err);

				this.error = "Login failed.";
			}
		});
	}

	ngOnDestroy(): void {
		this.loginSub?.unsubscribe();
	}

}
