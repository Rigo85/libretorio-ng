import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BooksPanelComponent } from './books-panel.component';

describe('BooksPanelComponent', () => {
  let component: BooksPanelComponent;
  let fixture: ComponentFixture<BooksPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BooksPanelComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BooksPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
