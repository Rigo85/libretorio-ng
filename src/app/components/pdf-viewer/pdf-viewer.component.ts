import { NgIf } from "@angular/common";
import { Component, Input } from "@angular/core";
import { NgxExtendedPdfViewerModule } from "ngx-extended-pdf-viewer";

declare var bootstrap: any;

@Component({
	selector: "pdf-viewer",
	standalone: true,
	imports: [
		NgIf,
		NgxExtendedPdfViewerModule
	],
	templateUrl: "./pdf-viewer.component.html",
	styleUrl: "./pdf-viewer.component.scss"
})
export class PdfViewerComponent {
	@Input() pdfSrc!: string;
	errorMessage: string = "";

	handleError($event: any) {
		this.errorMessage = "There was an error loading the PDF. Please ensure the file is a valid PDF document.";

		const modalElement = document.getElementById("errorModal");
		if (modalElement) {
			const modal = new bootstrap.Modal(modalElement);
			modalElement.addEventListener("hidden.bs.modal", this.onClose);

			modal.show();
		}
	}

	onClose() {
		const modalElement = document.getElementById("readModal");
		if (modalElement) {
			const modalInstance = bootstrap.Modal.getInstance(modalElement);
			if (modalInstance) {
				modalInstance.hide();
			} else {
				console.info("Modal instance not found, creating a new one");
				const newModalInstance = new bootstrap.Modal(modalElement);
				newModalInstance.hide();
			}
		} else {
			console.info("Modal element not found.");
		}
	}
}
