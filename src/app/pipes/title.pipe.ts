import { Pipe, PipeTransform } from "@angular/core";
import { File, getTitle } from "(src)/app/core/headers";


@Pipe({
	name: "title",
	standalone: true
})
export class TitlePipe implements PipeTransform {

	transform(file: File): string {
		return getTitle(file);
	}

}
