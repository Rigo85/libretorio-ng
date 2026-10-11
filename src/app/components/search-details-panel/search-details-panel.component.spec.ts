import { ComponentFixture, TestBed } from '@angular/core/testing';
import {bookFixture} from '../../testing/book-fixture';
import {FileCheckService} from '../../services/file-check.service';
import {of} from 'rxjs';

import { SearchDetailsPanelComponent } from './search-details-panel.component';

describe('SearchDetailsPanelComponent', () => {
  let component: SearchDetailsPanelComponent;
  let fixture: ComponentFixture<SearchDetailsPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SearchDetailsPanelComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SearchDetailsPanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('file', bookFixture());
    spyOn(TestBed.inject(FileCheckService), 'checkFileExists').and.returnValue(of(false));
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('rebuilds search fields and clears results when the book changes', () => {
    component.searchDetails = [{key: 'previous-result'}];
    fixture.componentRef.setInput('file', {...bookFixture(), name: 'another.pdf'});
    fixture.detectChanges();
    expect(component.fields.controls.find(control => control.get('name')?.value === 'name')?.get('value')?.value).toBe('another.pdf');
    expect(component.searchDetails).toEqual([]);
  });
});
