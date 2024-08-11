import { Injectable } from "@angular/core";
import { catchError, retry, Subject, throwError } from "rxjs";
import { WebSocketSubject } from "rxjs/internal/observable/dom/WebSocketSubject";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";

import { File, FileKind } from "(src)/app/core/headers";

interface IncomingMessage {
	event: string;
	data: any;
}

@Injectable({
	providedIn: "root"
})
export class BooksService {

	private webSocket!: WebSocketSubject<IncomingMessage>;

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

	constructor() {
		// TODO: Change the IP address to the server's IP address.
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
					} else if (msg.event === "update") {
						this.updateIncomingMessages.next(msg);
					} else if (msg.event === "decompress") {
						this.decompressIncomingMessages.next(msg);
					} else if (msg.event === "convert_to_pdf") {
						this.convertToPdfIncomingMessages.next(msg);
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

	public updateBookDetails(file: File) {
		this.sendMessage({event: "update", data: file});
	}

	public onSearchText(searchText: string) {
		this.sendMessage({event: "search_text", data: {searchText}});
	}

	public decompressFile(filePath: string, id: string, fileKind: FileKind) {
		this.sendMessage({event: "decompress", data: {filePath, id, fileKind}});
	}

	public convertToPdf(filePath: string, coverId: string) {
		this.sendMessage({event: "convert_to_pdf", data: {filePath, id: coverId}});
	}
}
