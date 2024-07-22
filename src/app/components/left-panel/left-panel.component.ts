import { Component, Input } from "@angular/core";
import { DirectoryTreeComponent } from "(src)/app/components/directory-tree/directory-tree.component";
import { Directory } from "(src)/app/core/headers";
import { NgOptimizedImage } from "@angular/common";

@Component({
  selector: 'left-panel',
  standalone: true,
	imports: [
		DirectoryTreeComponent,
		NgOptimizedImage
	],
  templateUrl: './left-panel.component.html',
  styleUrl: './left-panel.component.scss'
})
export class LeftPanelComponent {
	@Input() directory?: Directory;

}
