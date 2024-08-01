import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ComicViewerComponent } from './comic-viewer.component';

describe('ComicViewerComponent', () => {
  let component: ComicViewerComponent;
  let fixture: ComponentFixture<ComicViewerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ComicViewerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ComicViewerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
