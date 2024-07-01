import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SidebarTogglerComponent } from './sidebar-toggler.component';

describe('SidebarTogglerComponent', () => {
  let component: SidebarTogglerComponent;
  let fixture: ComponentFixture<SidebarTogglerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SidebarTogglerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SidebarTogglerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
