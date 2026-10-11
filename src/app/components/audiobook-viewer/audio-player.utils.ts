export interface ChapterPosition {
	title: string;
	startTimeInSeconds: number;
	endTimeInSeconds?: number;
}

export interface AudioTimeline {
	start: number;
	duration: number;
	chapterIndex: number;
}

export function chapterBounds(chapter: ChapterPosition | undefined, fileDuration?: number): {start: number; end: number} | undefined {
	if (!chapter) return undefined;
	const start = chapter.startTimeInSeconds;
	const end = chapter.endTimeInSeconds;
	if (!Number.isFinite(start) || start < 0 || end === undefined || !Number.isFinite(end) || end <= start) return undefined;
	const boundedEnd = Number.isFinite(fileDuration) && fileDuration! > 0 ? Math.min(end, fileDuration!) : end;
	return boundedEnd > start ? {start, end: boundedEnd} : undefined;
}

export function audioTimeline(chapters: ChapterPosition[] | undefined, time: number, fileDuration: number): AudioTimeline {
	const duration = Number.isFinite(fileDuration) && fileDuration > 0 ? fileDuration : 0;
	let index = chapterAt(chapters, time);
	// At the end of the file, keep the last chapter at 100% instead of changing scales.
	if (index < 0 && duration > 0 && time === duration && chapters?.length &&
		chapterBounds(chapters[chapters.length - 1], duration)?.end === duration) index = chapters.length - 1;
	const bounds = chapterBounds(chapters?.[index], duration);
	if (bounds && time >= bounds.start && (time < bounds.end || time === duration && bounds.end === duration)) {
		return {start: bounds.start, duration: bounds.end - bounds.start, chapterIndex: index};
	}
	return {start: 0, duration, chapterIndex: -1};
}

export function formatAudioTime(value: number): string {
	const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
	const h = Math.floor(seconds / 3600);
	const m = Math.floor(seconds % 3600 / 60);
	const s = String(seconds % 60).padStart(2, "0");
	return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export function chapterAt(chapters: ChapterPosition[] | undefined, time: number): number {
	if (!chapters || !Number.isFinite(time)) return -1;
	for (let i = chapters.length - 1; i >= 0; i--) {
		const chapter = chapters[i];
		if (time >= chapter.startTimeInSeconds &&
			(chapter.endTimeInSeconds === undefined || time < chapter.endTimeInSeconds)) return i;
	}
	return -1;
}

export function restoredPosition(value: unknown, tracks: {src: string}[]): {index: number; time: number} | undefined {
	if (!value || typeof value !== "object") return undefined;
	const record = value as {src?: unknown; trackIndex?: unknown; currentTime?: unknown};
	const index = typeof record.src === "string" ? tracks.findIndex(track => track.src === record.src) : record.trackIndex;
	if (!Number.isInteger(index) || (index as number) < 0 || (index as number) >= tracks.length ||
		typeof record.currentTime !== "number" || !Number.isFinite(record.currentTime) || record.currentTime < 0) return undefined;
	return {index: index as number, time: record.currentTime};
}
