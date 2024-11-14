import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AudiobookViewerComponent } from './audiobook-viewer.component';

describe('AudiobookViewerComponent', () => {
  let component: AudiobookViewerComponent;
  let fixture: ComponentFixture<AudiobookViewerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AudiobookViewerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AudiobookViewerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
