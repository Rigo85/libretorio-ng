import { Pipe, PipeTransform } from "@angular/core";
import { File } from "(src)/app/core/headers";

@Pipe({
	name: "title",
	standalone: true
})
export class TitlePipe implements PipeTransform {

	transform(value: File): string {

		// si tiene desconocido de autor y tiene webDetails entonces retorna el título de webDetails.
		return value.localDetails?.title ?? value.name;
	}

}
