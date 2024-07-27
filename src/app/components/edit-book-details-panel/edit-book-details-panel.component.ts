import { AfterViewInit, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from "@angular/core";
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { AsyncPipe, NgForOf, NgIf, NgOptimizedImage } from "@angular/common";
import { catchError, from, Observable, of } from "rxjs";

import { FileCheckService } from "(src)/app/services/file-check.service";
import { TitlePipe } from "(src)/app/pipes/title.pipe";
import { File, filterObjectFields } from "(src)/app/core/headers";
import { ExtensionPipe } from "(src)/app/pipes/extension.pipe";

@Component({
	selector: "edit-book-details-panel",
	standalone: true,
	imports: [
		ReactiveFormsModule,
		NgForOf,
		AsyncPipe,
		TitlePipe,
		NgIf,
		NgOptimizedImage,
		ExtensionPipe
	],
	templateUrl: "./edit-book-details-panel.component.html",
	styleUrl: "./edit-book-details-panel.component.scss"
})
export class EditBookDetailsPanelComponent implements AfterViewInit, OnChanges {
	@Input() file!: File;
	form!: FormGroup;
	@Output() updateOptions = new EventEmitter<any>();

	stepFields: any = {
		title: "",
		cover_i: "", // number
		publisher: [], // string[]
		author_name: [], // string[]
		publish_date: [], // string[]
		publish_year: [], // number[]
		subject: [], // string[]
		description: "",
		first_sentence: [] // string[]
	};

	webDetailsFields: string[] = [
		"title",
		"author_name",
		"subject",
		"description",
		"publisher",
		"cover_i",
		"publish_date",
		"publish_year",
		"first_sentence"
	];

	constructor(private fb: FormBuilder, private fileCheckService: FileCheckService) {
		this.form = this.fb.group({
			fields: this.fb.array([])
		});
	}

	ngOnChanges(changes: SimpleChanges): void {
		if (changes["file"] && !changes["file"].firstChange) {
			this.setFieldsFromObject(this.filterWebDetails({...this.stepFields, ...(this.file?.webDetails ?? {})}));
		}
	}

	ngAfterViewInit(): void {
		this.setFieldsFromObject(this.filterWebDetails({...this.stepFields, ...(this.file?.webDetails ?? {})}));
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

	// removeField(index: number) {
	// 	this.fields.removeAt(index);
	// }

	setFieldsFromObject(obj: any) {
		this.fields.clear();
		for (const key of Object.keys(obj)) {
			const value = Array.isArray(obj[key]) ? obj[key].join("; ") : obj[key];
			this.addField(key, value);
		}
	}

	filterWebDetails(webDetails: Record<string, any>): any {
		return filterObjectFields(webDetails, this.webDetailsFields);
	}

	checkFileExists(file: File): Observable<boolean> {
		return from(this.fileCheckService.checkFileExists(this.getCoverId(file)))
			.pipe(catchError(() => of(false)));
	}

	getCoverId(file: File): string {
		const coverId = `${file.webDetails?.cover_i || "no-cover"}`;
		return !file.customDetails ? file.coverId : coverId;
	}

	onInput() {
		const cbElement = document.getElementById("customDetailsCheckBox") as HTMLInputElement;
		if (cbElement) {
			this.updateChanges(cbElement.checked);
		}
	}

	private getObjectFromFields(): Record<string, any> {
		const obj = {} as Record<string, any>;
		for (const field of this.fields.controls) {
			const name = field.get("name")?.value;
			obj[name] = field.get("value")?.value ?? "";
		}
		return obj;
	}

	toUpperCase(value: any): string {
		return value ? value.toString().toUpperCase() : "";
	}

	onCustomDetailsChange($event: Event) {
		const inputElement = $event.target as HTMLInputElement;
		this.updateChanges(inputElement.checked);
	}

	updateChanges(customDetails: boolean) {
		let objectFromFields = this.getObjectFromFields();

		const webDetailsOptions: any = {
			details: {
				title: "",
				cover_i: "", // number
				publisher: [], // string[]
				author_name: [], // string[]
				publish_date: [], // string[]
				publish_year: [], // number[]
				subject: [], // string[]
				description: "",
				first_sentence: [] // string[]
			},
			customDetails: false
		};

		for (const field of this.webDetailsFields) {
			if (Array.isArray(this.stepFields[field])) {
				webDetailsOptions.details[field] = objectFromFields[field].split("; ").filter((s: string) => s).map((s: string) => s.trim());
			} else {
				webDetailsOptions.details[field] = objectFromFields[field];
			}
		}

		if (webDetailsOptions.details["cover_i"] && typeof webDetailsOptions.details["cover_i"] === "string") {
			webDetailsOptions.details["cover_i"] = parseInt(webDetailsOptions.details["cover_i"], 10);
		}

		if (webDetailsOptions.details["publish_year"].length) {
			webDetailsOptions.details["publish_year"] = webDetailsOptions.details["publish_year"].map((s: any) => parseInt(`${s.trim()}`, 10));
		}

		webDetailsOptions.customDetails = customDetails;

		this.updateOptions.emit(webDetailsOptions);
	}
}
