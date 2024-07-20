import { ComponentFixture, TestBed } from '@angular/core/testing';

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
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
