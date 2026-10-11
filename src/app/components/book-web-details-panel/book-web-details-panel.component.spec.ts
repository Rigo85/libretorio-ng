import { ComponentFixture, TestBed } from '@angular/core/testing';
import {FileCheckService} from '../../services/file-check.service';
import {of} from 'rxjs';

import { BookWebDetailsPanelComponent } from './book-web-details-panel.component';

describe('BookWebDetailsPanelComponent', () => {
  let component: BookWebDetailsPanelComponent;
  let fixture: ComponentFixture<BookWebDetailsPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BookWebDetailsPanelComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BookWebDetailsPanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('openLibraryBook', {key: '/works/local', title: 'Local book'});
    spyOn(TestBed.inject(FileCheckService), 'checkFileExists').and.returnValue(of(false));
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
