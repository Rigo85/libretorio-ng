import { ComponentFixture, TestBed } from '@angular/core/testing';

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
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
