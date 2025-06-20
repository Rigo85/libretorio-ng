import CryptoJS from "crypto-js";

declare var stringSimilarity: any;

export enum FileKind {
	/* eslint-disable @typescript-eslint/naming-convention */
	FILE = "FILE",
	COMIC_MANGA = "COMIC-MANGA",
	EPUB = "EPUB",
	AUDIOBOOK = "AUDIOBOOK",
	NONE = "NONE"
	/* eslint-enable @typescript-eslint/naming-convention */
}

export interface AudioBookMetadata {
	title: string;
	src: string;
	type: string;
	length: string;
}

export interface File {
	id: number;
	name: string;
	parentPath: string;
	parentHash: string;
	size: string;
	coverId: string;
	localDetails?: any;
	webDetails?: any;
	customDetails?: boolean;
	fileKind: FileKind;
}

export interface Directory {
	name: string;
	hash: string;
	directories: Directory[];
}

export interface ScanResult {
	directories?: Directory;
	files: File[];
	total: number;
}

export interface OpenLibraryBook {
	key: string;
	redirects?: string;
	title?: string;
	subtitle?: string;
	alternative_title?: string;
	alternative_subtitle?: string;
	cover_i?: number;
	ebook_access?: string;
	edition_count?: number;
	edition_key?: string[];
	format?: string;
	by_statement?: string;
	publish_date?: string | string[];
	lccn?: string;
	ia?: string[];
	oclc?: string;
	isbn?: string;
	contributor?: string[];
	publish_place?: string[];
	publisher?: string[];
	first_sentence?: string;
	author_key?: string[];
	author_name?: string[];
	author_alternative_name?: string[];
	subject?: string[];
	person?: string[];
	place?: string[];
	time?: string[];
	has_fulltext?: boolean;
	title_suggest?: string;
	publish_year?: number[];
	language?: string[];
	number_of_pages_median?: number;
	ia_count?: number;
	publisher_facet?: string[];
	author_facet?: string[];
	first_publish_year?: number;
	ratings_count?: number;
	readinglog_count?: number;
	want_to_read_count?: number;
	currently_reading_count?: number;
	already_read_count?: number;
	subject_key?: string[];
	person_key?: string[];
	place_key?: string[];
	time_key?: string[];
	lcc?: string[];
	ddc?: string[];
	lcc_sort?: string;
	ddc_sort?: string;
	id_project_gutenberg?: string[];
	id_librivox?: string[];
	id_standard_ebooks?: string[];
	id_openstax?: string[];
	description?: string;
}

export interface DialogMessage {
	cmd: string;
	caption: string;
}

export interface DecompressPages {
	pages: any[];
	pageIndex: number;
	currentPagesLength: number;
	totalPages: number;
	index: number;
}

export function cleanFilename(filename: string, lowerCase: boolean = true): string {
	const _filename = filename
		.normalize("NFC")
		.replace(/\.[^/.]+$/, "")
		.replace(/[‘’]/g, "'")
		.replace(/[^a-zA-ZÀ-ÿ0-9' ]+/g, " ")
		.replace(/\s+/g, " ");

	return lowerCase ? _filename.toLowerCase() : _filename;
}

export function cleanTitle(title: string, lowerCase: boolean = true): string {
	const _title = title
		.normalize("NFC")
		.replace(/[‘’]/g, "'")
		.replace(/[^a-zA-ZÀ-ÿ0-9' ]+/g, " ")
		.replace(/\s+/g, " ");

	return lowerCase ? _title.toLowerCase() : _title;
}

export function getTitle(file: File): string {
	let title;

	if (file.customDetails) {
		title = cleanTitle(file.webDetails?.title ?? "", false);
	} else {
		const archiveName = cleanAnnaArchiveSuffixFromTitle(file.name);
		const filename = cleanFilename(archiveName);
		const localTitle = cleanTitle(file.localDetails?.title ?? "");
		const webTitle = cleanTitle(file.webDetails?.title ?? "");

		if (stringSimilarity.compareTwoStrings(filename, localTitle) >= 0.5) {
			title = cleanTitle(file.localDetails?.title ?? "", false);
		} else if (stringSimilarity.compareTwoStrings(filename, webTitle) >= 0.5) {
			title = cleanTitle(file.webDetails?.title ?? "", false);
		} else {
			title = cleanFilename(archiveName, false);
		}
	}

	return title;
}

export function cleanAnnaArchiveSuffixFromTitle(title: string): string {
	return title.includes("Anna’s Archive") ?
		title.split(" -- ")[0].trim() :
		title
		;
}

export function filterObjectFields(objToFilter: Record<string, any>, fieldFilter: string[]): any {
	const obj = objToFilter ?? {};
	const filter = fieldFilter ?? [];

	return Object.fromEntries(
		Object.entries(obj)
			.filter(entry => filter.includes(entry[0]))
	);
}

export function hash(str: string): string {
	return CryptoJS.SHA256(str).toString(CryptoJS.enc.Hex);
}

export function getExtension(file: File): string {
	const split = file.name.split(".");
	let result;
	if (file.name.includes(".") && split.length > 1 && split[split.length - 1].length < 5) {
		result = split[split.length - 1].toLowerCase();
	} else {
		result = "N/A";
	}

	return result;
}
