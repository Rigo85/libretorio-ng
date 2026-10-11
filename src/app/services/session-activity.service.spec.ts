import {TestBed, fakeAsync, tick} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {SessionActivityService} from './session-activity.service';

describe('Shared session activity', () => {
  let service: SessionActivityService;
  let http: HttpTestingController;
  const url = '/api/session/activity';
  beforeEach(() => {
    TestBed.configureTestingModule({providers: [provideHttpClient(), provideHttpClientTesting()]});
    service = TestBed.inject(SessionActivityService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { service.stop(); http.verify(); });
  it('does not renew because a reader is merely open, even beyond an hour', fakeAsync(() => {
    tick(75 * 60_000); http.expectNone(url);
    service.interact({isTrusted: true} as Event, {visibilityState: 'visible'} as Document);
    const request = http.expectOne(url);
    expect(request.request.body).toEqual({activity: 'interaction'}); request.flush(null);
  }));
  it('ignores synthetic and hidden-document events', () => {
    service.interact(new Event('pointerdown'), {visibilityState: 'visible'} as Document);
    service.interact({isTrusted: true} as Event, {visibilityState: 'hidden'} as Document);
    http.expectNone(url);
  });
  it('observes inputs, never layout scrolling, and removes listeners', () => {
    const element = document.createElement('div');
    const observe = spyOn(service, 'interact');
    const detach = service.observe(element);
    element.dispatchEvent(new Event('wheel')); expect(observe).toHaveBeenCalledTimes(1);
    element.dispatchEvent(new Event('scroll')); expect(observe).toHaveBeenCalledTimes(1);
    detach(); element.dispatchEvent(new Event('wheel')); expect(observe).toHaveBeenCalledTimes(1);
  });
  it('does not overlap audio and interaction requests; resets on a new login', fakeAsync(() => {
    service.renew('audio'); const old = http.expectOne(url);
    tick(5_000); service.renew('interaction'); http.expectNone(url);
    service.stop(); expect(old.cancelled).toBeTrue();
    service.renew('interaction'); http.expectNone(url);
    service.reset(); service.renew('interaction'); http.expectOne(url).flush(null);
  }));
});
