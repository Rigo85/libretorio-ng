import { Pipe, PipeTransform } from "@angular/core";
import { File } from "(src)/app/core/headers";

@Pipe({
	name: "ext",
	standalone: true
})
export class ExtensionPipe implements PipeTransform {

	transform(value: File): string {
		const split = value.name.split(".");
		let result;
		if (value.name.includes(".") && split.length > 1 && split[split.length - 1].length < 5) {
			result = split[split.length - 1].toUpperCase();
		} else {
			result = "(ツ)_/¯";
		}

		return result;
	}
}
