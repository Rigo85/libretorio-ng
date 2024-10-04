import { Pipe, PipeTransform } from "@angular/core";
import { File } from "(src)/app/core/headers";

@Pipe({
	name: "fullPath",
	standalone: true
})
export class FullPathPipe implements PipeTransform {
	transform(file: File): string {
		const parentPath = file.parentPath.split("dist/public")[1];
		return `${parentPath}/${file.name}`;
	}
}
