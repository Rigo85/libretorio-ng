import { Routes } from "@angular/router";
import { BooksPanelComponent } from "(src)/app/components/books-panel/books-panel.component";
import { LoginComponent } from "(src)/app/components/login/login.component";
import { AuthGuard } from "(src)/app/guards/auth.guard";
import { AuthLayoutComponent } from "(src)/app/layouts/auth-layout/auth-layout.component";
import { MainLayoutComponent } from "(src)/app/layouts/main-layout/main-layout.component";

export const routes: Routes = [
	{
		path: "auth",
		component: AuthLayoutComponent,    // Unauthenticated layout
		children: [
			{path: "login", component: LoginComponent},
			// { path: 'register', component: RegisterComponent },
			{path: "", redirectTo: "login", pathMatch: "full"}
		]
	},
	{
		path: "",
		component: MainLayoutComponent,
		canActivate: [AuthGuard],
		children: [
			{path: "", component: BooksPanelComponent},
			{path: "parent/:parentHash", component: BooksPanelComponent},
			{path: "parent/:parentHash/id/:coverId", component: BooksPanelComponent}
		]
	},
	{path: "**", redirectTo: "auth/login"}
];

