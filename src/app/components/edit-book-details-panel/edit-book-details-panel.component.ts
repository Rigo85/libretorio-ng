import { AfterViewInit, Component, Input, OnChanges, SimpleChanges } from "@angular/core";
import { File } from "(src)/app/core/headers";
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { AsyncPipe, NgForOf, NgIf } from "@angular/common";
import { FileCheckService } from "(src)/app/services/file-check.service";
import { catchError, from, Observable, of } from "rxjs";
import { TitlePipe } from "(src)/app/pipes/title.pipe";

@Component({
	selector: "edit-book-details-panel",
	standalone: true,
	imports: [
		ReactiveFormsModule,
		NgForOf,
		AsyncPipe,
		TitlePipe,
		NgIf
	],
	templateUrl: "./edit-book-details-panel.component.html",
	styleUrl: "./edit-book-details-panel.component.scss"
})
export class EditBookDetailsPanelComponent implements AfterViewInit, OnChanges {
	@Input() file!: File;
	form!: FormGroup;

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

	removeField(index: number) {
		this.fields.removeAt(index);
	}

	setFieldsFromObject(obj: any) {
		this.fields.clear();
		for (const key of Object.keys(obj)) {
			this.addField(key, Array.isArray(obj[key]) ? obj[key].join(" · ") : obj[key]);
			// "Sep 29, 2016 · Apr 09, 2019 · Oct 24, 2016".split(" · ").filter(s => s).map(s => s.trim())
		}
	}

	filterWebDetails(webDetails: Record<string, any>): any {
		return Object.fromEntries(
			Object.entries(webDetails)
				.filter(entry => this.webDetailsFields.includes(entry[0]))
		);
	}

	checkFileExists(file: File): Observable<boolean> {
		return from(this.fileCheckService.checkFileExists(file))
			.pipe(
				catchError(error => of(false))
			);
	}
}
