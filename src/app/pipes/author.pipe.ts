import { Pipe, PipeTransform } from "@angular/core";
import { File } from "(src)/app/core/headers";

@Pipe({
	name: "author",
	standalone: true
})
export class AuthorPipe implements PipeTransform {

	transform(value: File): string {

		const result = (value.localDetails ?? {"author(s)": "Desconocido"})["author(s)"];

		return result.replace(/\s*\[.+]/, "");
	}

}
