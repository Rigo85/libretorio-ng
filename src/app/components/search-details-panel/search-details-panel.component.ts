import {
	AfterViewInit,
	Component,
	EventEmitter,
	Input,
	OnChanges, Output,
	SimpleChanges
} from "@angular/core";
import { File, getTitle } from "(src)/app/core/headers";
import { AsyncPipe, NgForOf, NgIf, NgOptimizedImage } from "@angular/common";
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { TitlePipe } from "(src)/app/pipes/title.pipe";
import { FileCheckService } from "(src)/app/services/file-check.service";
import { catchError, from, Observable, of } from "rxjs";
import {
	BookWebDetailsPanelComponent
} from "(src)/app/components/book-web-details-panel/book-web-details-panel.component";

declare var bootstrap: any;

@Component({
	selector: "search-details-panel",
	standalone: true,
	imports: [
		AsyncPipe,
		NgForOf,
		NgIf,
		ReactiveFormsModule,
		TitlePipe,
		BookWebDetailsPanelComponent,
		NgOptimizedImage
	],
	templateUrl: "./search-details-panel.component.html",
	styleUrl: "./search-details-panel.component.scss"
})
export class SearchDetailsPanelComponent implements AfterViewInit, OnChanges {
	@Input() file!: File;
	form!: FormGroup;
	@Output() searchOptions = new EventEmitter<{ title: string; author: string; }>();
	@Output() updateOptions = new EventEmitter<File>();
	errorMsg: string = "";
	@Input() searchDetails = [] as any[];
	radioForm: FormGroup;

	constructor(
		private fb: FormBuilder,
		private fileCheckService: FileCheckService
	) {
		this.form = this.fb.group({
			fields: this.fb.array([])
		});
		this.radioForm = this.fb.group({
			selectedOpenLibraryBook: new FormControl(undefined)
		});
	}

	ngOnChanges(changes: SimpleChanges): void {
		if (changes["file"] && !changes["file"].currentValue !== changes["file"].previousValue) {
			const obj = {
				name: this.file.name,
				"current title": getTitle(this.file),
				title: "",
				"author name": ""
			};
			this.setFieldsFromObject(obj);

			this.radioForm.reset({
				selectedOpenLibraryBook: undefined
			});
			this.searchDetails = [];
		}
	}

	ngAfterViewInit(): void {
		const obj = {
			name: this.file.name,
			"current title": getTitle(this.file),
			title: "",
			"author name": ""
		};
		this.setFieldsFromObject(obj);
	}

	get fields() {
		return this.form.get("fields") as FormArray;
	}

	addField(name: string, value: any) {
		this.fields.push(this.fb.group({
			name: new FormControl(name),
			value: new FormControl(value)
		}));
	}

	setFieldsFromObject(obj: any) {
		this.fields.clear();
		for (const key of Object.keys(obj)) {
			this.addField(key, Array.isArray(obj[key]) ? obj[key].join("; ") : obj[key]);
		}
	}

	checkFileExists(file: File): Observable<boolean> {
		return from(this.fileCheckService.checkFileExists(file.coverId))
			.pipe(
				catchError(() => of(false))
			);
	}

	onSearch() {
		let title = this.fields.controls.find((control) => control.get("name")?.value === "title")?.get("value")?.value;
		title = (title ?? "").trim();

		let author = this.fields.controls.find((control) => control.get("name")?.value === "author name")?.get("value")?.value;
		author = (author ?? "").trim();

		if (!title && !author) {
			this.errorMsg = "You must specify a title or the author.";
		} else {
			this.errorMsg = "";
			this.searchOptions.emit({title, author});
		}
	}

	openConfirmModal() {
		const modalElement = document.getElementById("confirmUpdateModal");
		if (modalElement) {
			const modal = new bootstrap.Modal(modalElement);
			modal.show();
		}
	}

	confirmUpdate() {
		const selectedOpenLibraryBook = this.radioForm.get("selectedOpenLibraryBook")?.value;
		if (selectedOpenLibraryBook) {
			this.file.webDetails = JSON.stringify(selectedOpenLibraryBook);
			this.file.customDetails = true;

			this.updateOptions.emit(this.file);
		}

		// Ocultar el modal después de confirmar la actualización
		const modalElement = document.getElementById("confirmUpdateModal");
		if (modalElement) {
			const modal = bootstrap.Modal.getInstance(modalElement);
			modal.hide();
		}
	}

	toUpperCase(value: any): string {
		return value ? value.toString().toUpperCase() : "";
	}
}
