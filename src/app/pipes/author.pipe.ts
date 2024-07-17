import { Pipe, PipeTransform } from "@angular/core";
import { File } from "(src)/app/core/headers";

@Pipe({
	name: "author",
	standalone: true
})
export class AuthorPipe implements PipeTransform {

	transform(file: File): string {

		let localAuthor = (file.localDetails ?? {"author(s)": undefined})["author(s)"] ?? "";
		localAuthor = (localAuthor.replace(/\s*\[.+]/, "")).trim();
		localAuthor = ["desconocido", "unknown"].includes(localAuthor.toLowerCase()) ? "" : localAuthor;
		const webAuthor = (file.webDetails?.author_name?.join(", ") || "").trim();

		let author;

		if (!localAuthor && !webAuthor) {
			author = "Unknown author";
		} else if (!localAuthor) {
			author = webAuthor;
		} else if (!webAuthor) {
			author = localAuthor;
		} else {
			author = `${localAuthor} (${webAuthor})`;
		}

		return author;
	}

}
