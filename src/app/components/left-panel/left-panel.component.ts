import { Component, OnInit } from "@angular/core";
import { DirectoryTreeComponent } from "(src)/app/components/directory-tree/directory-tree.component";
import { Directory } from "(src)/app/core/headers";
import { NgOptimizedImage } from "@angular/common";
import { LeftPanelUpdateService } from "(src)/app/services/left-panel-update.service";

@Component({
	selector: "left-panel",
	standalone: true,
	imports: [
		DirectoryTreeComponent,
		NgOptimizedImage
	],
	templateUrl: "./left-panel.component.html",
	styleUrl: "./left-panel.component.scss"
})
export class LeftPanelComponent implements OnInit {
	directory?: Directory;

	constructor(private leftPanelUpdateService: LeftPanelUpdateService) { }

	ngOnInit(): void {
		this.leftPanelUpdateService.directoriesMessage$.subscribe((directories) => {
			this.directory = directories;
		});
	}

}
