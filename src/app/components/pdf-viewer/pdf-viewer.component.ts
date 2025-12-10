import {NgIf} from "@angular/common";
import {Component, Input, OnInit} from "@angular/core";
import {NgxExtendedPdfViewerModule, pdfDefaultOptions} from "ngx-extended-pdf-viewer";

import {onClose} from "(src)/app/components/helpers/utils";
import {ErrorMessageComponent} from "(src)/app/components/error-message/error-message.component";
import {ErrorMessageService} from "(src)/app/services/error-message.service";

@Component({
    selector: "pdf-viewer",
    imports: [
        NgIf,
        NgxExtendedPdfViewerModule,
        ErrorMessageComponent
    ],
    templateUrl: "./pdf-viewer.component.html",
    styleUrl: "./pdf-viewer.component.scss"
})
export class PdfViewerComponent implements OnInit {
    @Input() pdfSrc!: string;
    onClose = onClose;

    isMobile = false;

    constructor(private errorMessageService: ErrorMessageService) {
    }

    ngOnInit(): void {
        // Simple, dependency-free mobile detection.
        if (typeof window !== "undefined") {
            const ua = navigator.userAgent || "";
            this.isMobile =
                /Android|iPhone|iPad|iPod/i.test(ua) || window.innerWidth <= 768;
        }

        if (this.isMobile) {
            // Global pdf.js tuning.
            // Reduce amount of rendered pages kept in memory.
            pdfDefaultOptions.defaultCacheSize = 5; // default ~50

            // Limit huge images (width * height). 4096x4096 ~= 16 MP.
            // Images más grandes se recortan / no se renderizan completas,
            // pero prevenimos explosiones de memoria.
            // pdfDefaultOptions.maxImageSize = 4096 * 4096;

            // Opcional: también puedes bajar maxCanvasPixels si ves que aún explota:
            // pdfDefaultOptions.maxCanvasPixels = 4096 * 4096;
        }
    }

    get initialZoom(): string {
        return this.isMobile ? "page-fit" : "page-width";
    }

    get viewerHeight(): string {
        return this.isMobile ? "100vh" : "100%";
    }

    handleError($event: any) {
        this.errorMessageService.open("There was an error loading the PDF. Please ensure the file is a valid PDF document.");
    }
}
