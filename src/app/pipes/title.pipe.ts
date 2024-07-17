import { Pipe, PipeTransform } from "@angular/core";
import { cleanFilename, cleanTitle, File } from "(src)/app/core/headers";

declare var stringSimilarity: any;

@Pipe({
	name: "title",
	standalone: true
})
export class TitlePipe implements PipeTransform {

	transform(file: File): string {
		let title = "";
		const filename = cleanFilename(file.name);
		const localTitle = cleanTitle(file.localDetails?.title ?? "");
		const webTitle = cleanTitle(file.webDetails?.title ?? "");

		if (stringSimilarity.compareTwoStrings(filename, localTitle) >= 0.5) {
			title = cleanTitle(file.localDetails?.title ?? "", false);
		} else if (stringSimilarity.compareTwoStrings(filename, webTitle) >= 0.5) {
			title = cleanTitle(file.webDetails?.title ?? "", false);
		} else {
			title = cleanFilename(file.name, false);
		}

		return title;
	}

}
