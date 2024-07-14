export interface File {
	id: number;
	name: string;
	parentPath: string;
	parentHash: string;
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
