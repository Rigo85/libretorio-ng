import { DestroyRef, Injectable } from "@angular/core";
import { BehaviorSubject, catchError, filter, Observable, retry, Subject, take, throwError, timeout } from "rxjs";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { webSocket, WebSocketSubject } from "rxjs/webSocket";
import { File, FileKind } from "(src)/app/core/headers";

interface IncomingMessage {
	event: string;
	data: any;
	requestId?: string;
	code?: string;
}

export interface PreparedPdfResponse {
	success: "OK" | "ERROR";
	pdfPath?: string;
	code?: string;
}

@Injectable({
	providedIn: "root"
})
export class BooksService {

	// region attributes
	private webSocket!: WebSocketSubject<IncomingMessage>;
	private intentionalDisconnect = false;

	private connectionStatus = new BehaviorSubject<boolean>(false);
	public connectionStatus$ = this.connectionStatus.asObservable();

	private sessionExpiredIncomingMessages = new Subject<IncomingMessage>();
	public sessionExpiredIncomingMessage$ = this.sessionExpiredIncomingMessages.asObservable();

	private heartbeatTimer!: any;

	private incomingMessages = new Subject<IncomingMessage>();
	public incomingMessage$ = this.incomingMessages.asObservable();

	private searchDetailsIncomingMessages = new Subject<IncomingMessage>();
	public searchDetailsIncomingMessage$ = this.searchDetailsIncomingMessages.asObservable();

	private updateIncomingMessages = new Subject<IncomingMessage>();
	public updateIncomingMessage$ = this.updateIncomingMessages.asObservable();

	private decompressIncomingMessages = new Subject<IncomingMessage>();
	public decompressIncomingMessage$ = this.decompressIncomingMessages.asObservable();

	private convertToPdfIncomingMessages = new Subject<IncomingMessage>();
	public convertToPdfIncomingMessage$ = this.convertToPdfIncomingMessages.asObservable();

	private audioBookIncomingMessages = new Subject<IncomingMessage>();
	public audioBookIncomingMessage$ = this.audioBookIncomingMessages.asObservable();

	// endregion

	constructor(private destroyRef: DestroyRef) {}

	private startHeartbeat(): void {
		this.heartbeatTimer = setInterval(() => {
			this.sendMessage({event: "ping", data: null});
		}, 20_000);
	}

	public cleanup() {
		clearInterval(this.heartbeatTimer);
		if (this.webSocket) {
			this.webSocket.complete();
			this.webSocket.unsubscribe();
		}
		this.incomingMessages.complete();
		this.searchDetailsIncomingMessages.complete();
		this.updateIncomingMessages.complete();
		this.decompressIncomingMessages.complete();
		this.convertToPdfIncomingMessages.complete();
		this.audioBookIncomingMessages.complete();
		this.sessionExpiredIncomingMessages.complete();
	}

	public disconnect(): void {
		this.intentionalDisconnect = true;
		if (this.webSocket) {
			this.webSocket.complete();
			this.webSocket.unsubscribe();
		}
		clearInterval(this.heartbeatTimer);
		this.connectionStatus.next(false);
	}

	public ensureConnected(): void {
		if (!this.webSocket || this.webSocket.closed) this.connect();
	}

	public connect(): void {
		if (this.webSocket && !this.webSocket.closed) {
			this.webSocket.complete();
			this.webSocket.unsubscribe();
		}
		clearInterval(this.heartbeatTimer);

		this.intentionalDisconnect = false;
		const wsUrl = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/`;
		this.webSocket = webSocket<IncomingMessage>({
			url: wsUrl,
			deserializer: e => JSON.parse(e.data),
			openObserver: {
				next: () => {
					// console.log("WebSocket opened.");
					this.connectionStatus.next(true);
				}
			},
			closeObserver: {
				next: () => {
					// console.log("WebSocket closed.");
					this.connectionStatus.next(false);
				}
			}
		});

		this.startHeartbeat();

		this.webSocket
			.pipe(
				catchError(err => {
					if (!this.intentionalDisconnect) {
						console.error("WebSocket error:", err);
					}
					this.intentionalDisconnect = false;
					return throwError(() => err);
				}),
				retry({delay: 3_000}),
				takeUntilDestroyed(this.destroyRef)
			)
			.subscribe({
				next: msg => this.routeIncoming(msg),
				error: err => console.error(err),
				complete: () => console.log("Connection closed.")
			});
	}

	private routeIncoming(msg: IncomingMessage) {
		switch (msg.event) {
			case "list":
				this.incomingMessages.next(msg);
				break;
			case "search_details":
				this.searchDetailsIncomingMessages.next(msg);
				break;
			case "update":
				this.updateIncomingMessages.next(msg);
				break;
			case "decompress":
				this.decompressIncomingMessages.next(msg);
				break;
			case "convert_to_pdf":
				this.convertToPdfIncomingMessages.next(msg);
				break;
			case "get_audio_book":
				this.audioBookIncomingMessages.next(msg);
				break;
			case "session_expired":
				this.sessionExpiredIncomingMessages.next(msg);
				break;
		}
	}

	private sendMessage(msg: IncomingMessage): void {
		if (this.webSocket && !this.webSocket?.closed) {
			this.webSocket.next(msg);
		} else {
			console.warn("WebSocket is closed. Cannot send any message.");
			// console.info(msg);
		}
	}

	public onBooksList(parentHash?: string, cleanUp: boolean = false, offset: number = 0, limit: number = 50): void {
		console.info(`Requesting book list for parentHash=${parentHash}, offset=${offset}, limit=${limit}, cleanUp=${cleanUp}`);
		this.sendMessage({event: "ls", data: {parentHash, offset, limit, cleanUp}});
	}

	public onSearchOptions($event: { title: string; author: string }) {
		this.sendMessage({event: "search", data: $event});
	}

	public updateBookDetails(file: File) {
		this.sendMessage({event: "update", data: file});
	}

	public onSearchText(searchText: string, offset: number = 0, limit: number = 50) {
		this.sendMessage({event: "search_text", data: {searchText, offset, limit}});
	}

	public loadComic(id: string) {
		this.sendMessage({event: "decompress", data: {id}});
	}

	public getPreparedPdf(filePath: string, coverId: string): Observable<PreparedPdfResponse> {
		return new Observable<PreparedPdfResponse>(subscriber => {
			if (!this.connectionStatus.value) {
				subscriber.error(new Error("WebSocket disconnected"));
				return;
			}
			const requestId = crypto.randomUUID();
			// Subscribe before sending; IDs keep a late reply from opening another book.
			const subscription = this.convertToPdfIncomingMessage$.pipe(
				filter(message => message.data?.requestId === requestId || message.data?.requestId === undefined),
				take(1),
				timeout(10_000)
			).subscribe({
				next: message => {
					if (message.data?.requestId === undefined) subscriber.error(new Error('PDF_BACKEND_UPDATE_REQUIRED'));
					else subscriber.next(message.data);
				},
				error: error => subscriber.error(error),
				complete: () => subscriber.complete()
			});
			this.sendMessage({event: "convert_to_pdf", data: {filePath, id: coverId, requestId}});
			return () => subscription.unsubscribe();
		});
	}

	public getMorePages(id: string, index: number) {
		this.sendMessage({event: "get_more_pages", data: {id, index}});
	}

	public getComicPages(archiveId: number, id: string, index: number, sourceRevision?: string): Observable<any> {
		return new Observable(subscriber => {
			if (!this.connectionStatus.value) { subscriber.error(new Error('COMIC_DISCONNECTED')); return; }
			const requestId = crypto.randomUUID();
			const subscription = this.decompressIncomingMessage$.pipe(
				filter(message => message.data?.requestId === requestId), take(1), timeout(20000)
			).subscribe({
				next: message => {
					if (message.data.archiveId !== archiveId || message.data.id !== id) subscriber.error(new Error('COMIC_REPLY_MISMATCH'));
					else subscriber.next(message.data);
				}, error: error => subscriber.error(error), complete: () => subscriber.complete()
			});
			this.sendMessage({event: 'get_more_pages', data: {archiveId, id, index, requestId, sourceRevision}});
			return () => subscription.unsubscribe();
		});
	}

	public getAudioBook(filePath: string, requestId?: string) {
		this.sendMessage({event: "get_audio_book", data: {filePath, requestId}});
	}

	public logAction(
		action: string,
		entityName: string = "",
		entityId: string | number | undefined = undefined,
		changes: Record<string, any> = {}): void {
		const data = {
			action,
			entityName,
			entityId,
			changes
		};

		this.sendMessage({event: "log_action", data});
	}
}
