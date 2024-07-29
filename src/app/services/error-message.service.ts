import { Injectable } from "@angular/core";
import { Subject } from "rxjs";

import { DialogMessage } from "(src)/app/core/headers";

@Injectable({
	providedIn: "root"
})
export class ErrorMessageService {

	private messageSubject: Subject<DialogMessage> = new Subject<DialogMessage>();
	public message$ = this.messageSubject.asObservable();

	constructor() { }

	public open(message: string) {
		this.messageSubject.next({cmd: "OPEN", caption: message});
	}
}
