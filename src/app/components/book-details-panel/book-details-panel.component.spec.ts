import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BookDetailsPanelComponent } from './book-details-panel.component';

describe('BookDetailsPanelComponent', () => {
  let component: BookDetailsPanelComponent;
  let fixture: ComponentFixture<BookDetailsPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BookDetailsPanelComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BookDetailsPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
