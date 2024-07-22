import { Pipe, PipeTransform } from "@angular/core";
import { File } from "(src)/app/core/headers";

@Pipe({
	name: "sub",
	standalone: true
})
export class SubjectPipe implements PipeTransform {

	transform(file: File): string {
		if (file.customDetails) {
			const webSubject = (file.webDetails?.subject || []).join(", ").trim();

			return webSubject || "";
		} else {
			const localSubject = (file.localDetails?.tags || "").trim();
			const webSubject = (file.webDetails?.subject || []).join(", ").trim();

			return localSubject || webSubject || "";
		}
	}

}
