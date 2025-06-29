import { DestroyRef, Injectable } from "@angular/core";
import { BehaviorSubject, catchError, Observable, retry, Subject, switchMap, take, throwError } from "rxjs";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { webSocket, WebSocketSubject } from "rxjs/webSocket";
import { HttpClient } from "@angular/common/http";
import { File, FileKind } from "(src)/app/core/headers";

interface IncomingMessage {
	event: string;
	data: any;
}

@Injectable({
	providedIn: "root"
})
export class BooksService {

	// region attributes
	private webSocket!: WebSocketSubject<IncomingMessage>;

	private connectionStatus = new BehaviorSubject<boolean>(false);
	public connectionStatus$ = this.connectionStatus.asObservable();

	private csrfToken$: Observable<string>;

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

	constructor(private http: HttpClient, private destroyRef: DestroyRef) {
		this.csrfToken$ = this.http
			.get<{ csrfToken: string }>("/api/csrf-token", {withCredentials: true})
			.pipe(switchMap(resp => { return [resp.csrfToken]; }));
	}

	private startHeartbeat(): void {
		this.heartbeatTimer = setInterval(() => {
			this.sendMessage({event: "ping", data: null});
		}, 20_000);
	}

	private cleanup() {
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
	}

	public connect(): void {
		this.csrfToken$
			.pipe(take(1))
			.subscribe(csrfToken => {
				// const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
				// const wsUrl = `${wsProtocol}//${window.location.host.split(":")[0]}:3005/?csrfToken=${encodeURIComponent(csrfToken)}`;
				const wsUrl = `wss://libretorio.rji-services.org/?csrfToken=${encodeURIComponent(csrfToken)}`;
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
							console.error("WebSocket error:", err);
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

	public decompressFile(filePath: string, id: string, fileKind: FileKind) {
		this.sendMessage({event: "decompress", data: {filePath, id, fileKind}});
	}

	public convertToPdf(filePath: string, coverId: string) {
		this.sendMessage({event: "convert_to_pdf", data: {filePath, id: coverId}});
	}

	public getMorePages(id: string, index: number) {
		this.sendMessage({event: "get_more_pages", data: {id, index}});
	}

	public getAudioBook(filePath: string) {
		this.sendMessage({event: "get_audio_book", data: {filePath}});
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
