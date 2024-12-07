import { Routes } from "@angular/router";
import { BooksPanelComponent } from "(src)/app/components/books-panel/books-panel.component";

export const routes: Routes = [
	{path: "", component: BooksPanelComponent},
	{path: "parent/:parentHash", component: BooksPanelComponent},
	{path: "parent/:parentHash/id/:coverId", component: BooksPanelComponent}
];
