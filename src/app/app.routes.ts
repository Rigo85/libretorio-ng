import { Routes } from "@angular/router";
import { BooksPanelComponent } from "(src)/app/components/books-panel/books-panel.component";
import { LoginComponent } from "(src)/app/components/login/login.component";
import { AuthGuard } from "(src)/app/guards/auth.guard";
import { AuthLayoutComponent } from "(src)/app/layouts/auth-layout/auth-layout.component";
import { MainLayoutComponent } from "(src)/app/layouts/main-layout/main-layout.component";
import {userManagementGuard} from './guards/user-management.guard';

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
			{path: "inicio", loadComponent: () => import('./components/reading-home/reading-home.component').then(m=>m.ReadingHomeComponent)},
			{path: "buscar", loadComponent: () => import('./components/catalogue-search/catalogue-search.component').then(m=>m.CatalogueSearchComponent)},
			{path: "usuarios", canActivate:[userManagementGuard], data:{admin:true}, loadComponent:()=>import('./components/users/users.component').then(m=>m.UsersComponent)},
			{path: "cuenta", canActivate:[userManagementGuard], loadComponent:()=>import('./components/users/account-password.component').then(m=>m.AccountPasswordComponent)},
			{path: "", component: BooksPanelComponent},
			{path: "parent/:parentHash", component: BooksPanelComponent},
			{path: "parent/:parentHash/id/:coverId", component: BooksPanelComponent}
		]
	},
	{path: "**", redirectTo: "auth/login"}
];
