import { TestBed } from '@angular/core/testing';

import { CollapseStateService } from './collapse-state.service';

describe('CollapseStateService', () => {
  let service: CollapseStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CollapseStateService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
