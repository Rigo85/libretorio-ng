declare var stringSimilarity: any;

export interface File {
	id: number;
	name: string;
	parentPath: string;
	parentHash: string;
	size: string;
	coverId: string;
	localDetails?: any;
	webDetails?: any;
}

export interface Directory {
	name: string;
	hash: string;
	directories: Directory[];
}

export interface ScanResult {
	directories?: Directory;
	files: File[];
}

export function cleanFilename(filename: string, lowerCase: boolean = true): string {
	const _filename = filename
		.replace(/\.[^/.]+$/, "")
		.replace(/[^a-zA-ZñÑáéíóúÁÉÍÓÚ0-9 ]/g, " ")
		.replace(/\s+/g, " ");

	return lowerCase ? _filename.toLowerCase() : _filename;
}

export function cleanTitle(title: string, lowerCase: boolean = true): string {
	const _title = title
		.replace(/[^a-zA-ZñÑáéíóúÁÉÍÓÚ0-9 ]/g, " ")
		.replace(/\s+/g, " ");

	return lowerCase ? _title.toLowerCase() : _title;
}

export function getTitle(file: File): string {
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
