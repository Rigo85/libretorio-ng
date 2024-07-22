import { ComponentFixture, TestBed } from '@angular/core/testing';

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
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
