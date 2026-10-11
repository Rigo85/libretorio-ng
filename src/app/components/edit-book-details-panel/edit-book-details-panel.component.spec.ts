import { ComponentFixture, TestBed } from '@angular/core/testing';
import {bookFixture} from '../../testing/book-fixture';
import {FileCheckService} from '../../services/file-check.service';
import {of} from 'rxjs';

import { EditBookDetailsPanelComponent } from './edit-book-details-panel.component';

describe('EditBookDetailsPanelComponent', () => {
  let component: EditBookDetailsPanelComponent;
  let fixture: ComponentFixture<EditBookDetailsPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditBookDetailsPanelComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EditBookDetailsPanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('file', bookFixture());
    spyOn(TestBed.inject(FileCheckService), 'checkFileExists').and.returnValue(of(false));
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('initializes and replaces metadata fields before checking the view', () => {
    const title = () => component.fields.controls.find(control => control.get('name')?.value === 'title')?.get('value')?.value;
    expect(title()).toBe('Sample book');
    fixture.componentRef.setInput('file', {...bookFixture(), webDetails: {title: 'Another book'}});
    fixture.detectChanges();
    expect(title()).toBe('Another book');
  });
});
