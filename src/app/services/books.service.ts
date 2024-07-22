import { Injectable } from "@angular/core";
import { catchError, Observable, retry, Subject, throwError } from "rxjs";
import { WebSocketSubject } from "rxjs/internal/observable/dom/WebSocketSubject";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";

interface IncomingMessage {
	event: string;
	data: any;
}

@Injectable({
	providedIn: "root"
})
export class BooksService {

	private webSocket!: WebSocketSubject<IncomingMessage>;

	private incomingMessages: Subject<IncomingMessage> = new Subject<IncomingMessage>();
	public incomingMessage$: Observable<IncomingMessage> = this.incomingMessages.asObservable();

	private searchDetailsIncomingMessages: Subject<IncomingMessage> = new Subject<IncomingMessage>();
	public searchDetailsIncomingMessage$: Observable<IncomingMessage> = this.searchDetailsIncomingMessages.asObservable();

	constructor() {
		this.webSocket = new WebSocketSubject<IncomingMessage>("ws://192.168.0.16:3005");

		this.webSocket
			.pipe(
				catchError(err => {
					console.error("WebSocket error occurred:", err);
					return throwError(() => {
						console.error("Error in the WebSocket:", err);
					});
				}),
				retry({delay: 3_000}),
				takeUntilDestroyed()
			)
			.subscribe({
				next: (msg: IncomingMessage) => {
					if (msg.event === "list") {
						this.incomingMessages.next(msg);
					} else if (msg.event === "search_details") {
						this.searchDetailsIncomingMessages.next(msg);
					}
				},
				error: err => console.error(err),
				complete: () => console.log("Closed connection.")
			});
	}

	private sendMessage(msg: IncomingMessage): void {
		this.webSocket.next(msg);
	}

	public onBooksList(parentHash?: string): void {
		this.sendMessage({event: "ls", data: {parentHash}}); // Send message to server
	}

	public onSearchOptions($event: { title: string; author: string }) {
		this.sendMessage({event: "search", data: $event});
	}
}
