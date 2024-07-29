import { Component, Input, OnInit } from "@angular/core";

import { ErrorMessageService } from "(src)/app/services/error-message.service";
import { DialogMessage } from "(src)/app/core/headers";

declare var bootstrap: any;

@Component({
	selector: "error-message",
	standalone: true,
	imports: [],
	templateUrl: "./error-message.component.html",
	styleUrl: "./error-message.component.scss"
})
export class ErrorMessageComponent implements OnInit {
	@Input() onClose!: () => void;
	errorMessage: string = "";

	constructor(private errorMessageService: ErrorMessageService) {}

	ngOnInit(): void {
		this.errorMessageService.message$.subscribe((message: DialogMessage) => {
			if (message.cmd === "OPEN") {
				this.errorMessage = message.caption;
				this.open();
			}
		});
	}

	open() {
		const modalElement = document.getElementById("errorModal");
		if (modalElement) {
			const modal = new bootstrap.Modal(modalElement);
			modalElement.addEventListener("hidden.bs.modal", this.onClose ?? (() => {}));

			modal.show();
		}
	}
}
