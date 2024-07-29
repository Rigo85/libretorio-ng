import { NgIf } from "@angular/common";
import { Component, Input } from "@angular/core";
import { NgxExtendedPdfViewerModule } from "ngx-extended-pdf-viewer";

import { onClose } from "(src)/app/components/helpers/utils";
import { ErrorMessageComponent } from "(src)/app/components/error-message/error-message.component";
import { ErrorMessageService } from "(src)/app/services/error-message.service";

@Component({
	selector: "pdf-viewer",
	standalone: true,
	imports: [
		NgIf,
		NgxExtendedPdfViewerModule,
		ErrorMessageComponent
	],
	templateUrl: "./pdf-viewer.component.html",
	styleUrl: "./pdf-viewer.component.scss"
})
export class PdfViewerComponent {
	@Input() pdfSrc!: string;
	onClose = onClose;

	constructor(private errorMessageService: ErrorMessageService) {}

	handleError($event: any) {
		this.errorMessageService.open("There was an error loading the PDF. Please ensure the file is a valid PDF document.");
	}
}
