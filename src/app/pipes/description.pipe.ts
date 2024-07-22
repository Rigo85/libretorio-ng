import { Pipe, PipeTransform } from "@angular/core";
import { File } from "(src)/app/core/headers";

@Pipe({
	name: "desc",
	standalone: true
})
export class DescriptionPipe implements PipeTransform {

	transform(file: File): string {
		if(file.customDetails){
			const webDescription = file.webDetails?.description ?? "";
			const webFirstSentence = file.webDetails?.first_sentence?.at(0) ?? "";

			return webDescription || webFirstSentence;
		}else{
			const localDescription = file.localDetails?.comments ?? "";
			const webDescription = file.webDetails?.description ?? "";
			const webFirstSentence = file.webDetails?.first_sentence?.at(0) ?? "";

			return localDescription || webDescription || webFirstSentence;
		}
	}

}
