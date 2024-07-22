import { AfterViewInit, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from "@angular/core";
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { AsyncPipe, NgForOf, NgIf, NgOptimizedImage } from "@angular/common";
import { catchError, from, Observable, of } from "rxjs";

import { FileCheckService } from "(src)/app/services/file-check.service";
import { TitlePipe } from "(src)/app/pipes/title.pipe";
import { File, filterObjectFields } from "(src)/app/core/headers";

@Component({
	selector: "edit-book-details-panel",
	standalone: true,
	imports: [
		ReactiveFormsModule,
		NgForOf,
		AsyncPipe,
		TitlePipe,
		NgIf,
		NgOptimizedImage
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
		return from(this.fileCheckService.checkFileExists(file.coverId))
			.pipe(catchError(() => of(false)));
	}

	onInput() {
		let objectFromFields = this.getObjectFromFields();

		const webDetailsOptions: any = {
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

		for (const field of this.webDetailsFields) {
			if (Array.isArray(this.stepFields[field])) {
				webDetailsOptions[field] = objectFromFields[field].split("; ").filter((s: string) => s).map((s: string) => s.trim());
			} else {
				webDetailsOptions[field] = objectFromFields[field];
			}
		}

		if (webDetailsOptions["cover_i"] && typeof webDetailsOptions["cover_i"] === "string") {
			webDetailsOptions["cover_i"] = parseInt(webDetailsOptions["cover_i"], 10);
		}

		if (webDetailsOptions["publish_year"].length) {
			webDetailsOptions["publish_year"] = webDetailsOptions["publish_year"].map((s: any) => parseInt(`${s.trim()}`, 10));
		}

		this.updateOptions.emit(webDetailsOptions);
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
}
