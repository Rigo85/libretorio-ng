import {TestBed, fakeAsync, tick} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {PlaybackSessionService} from './playback-session.service';
import {StopPlayingService} from './stop-playing.service';
import {SessionActivityService} from './session-activity.service';

describe('Playback session activity', () => {
  let service: PlaybackSessionService;
  let http: HttpTestingController;
  let stop: jasmine.Spy;
  const url = '/api/session/activity';
  beforeEach(() => {
    stop = jasmine.createSpy('stopPlayingAudio');
    TestBed.configureTestingModule({providers:[provideHttpClient(), provideHttpClientTesting(), PlaybackSessionService,
      {provide:StopPlayingService, useValue:{stopPlayingAudio:stop}}]});
    service = TestBed.inject(PlaybackSessionService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {service.ngOnDestroy(); http.verify();});
  function advance() {service.progress(0, true); service.progress(1, true);}
  it('renews only on progress, at most once per minute, including after 75 minutes', fakeAsync(() => {
    service.progress(0, false); tick(60_000); http.expectNone(url);
    advance();
    const request = http.expectOne(url);
    expect(request.request.withCredentials).toBeTrue(); expect(request.request.body).toEqual({activity:'audio'});
    request.flush(null, {status:204,statusText:'No Content'});
    for (let minute = 0; minute < 75; minute++) {
      service.progress(minute*60+2, true); http.expectNone(url);
      tick(60_000); service.progress(minute*60+3, true); http.expectOne(url).flush(null);
    }
    service.progress(4503, false); tick(3_600_000); http.expectNone(url);
    expect(stop).not.toHaveBeenCalled();
  }));
  it('does not renew stalled playback without advancing media time', fakeAsync(() => {
    advance(); http.expectOne(url).flush(null);
    tick(3_600_000); service.progress(1, true); http.expectNone(url);
    expect(stop).not.toHaveBeenCalled();
  }));
  it('preserves playback on transient errors and recovers on the next progress attempt', fakeAsync(() => {
    advance(); http.expectOne(url).flush({}, {status:503,statusText:'Unavailable'});
    expect(stop).not.toHaveBeenCalled(); expect(service.warning()).not.toBe('');
    tick(60_000); service.progress(61, true); http.expectOne(url).flush(null);
    expect(service.warning()).toBe('');
  }));
  it('stops on revoked/expired session and never renews it', fakeAsync(() => {
    advance(); http.expectOne(url).flush({}, {status:401,statusText:'Unauthorized'});
    expect(stop).toHaveBeenCalledTimes(1);
    tick(60_000); service.progress(61,true); http.expectNone(url);
  }));
  it('does not pretend an old backend supports renewal', fakeAsync(() => {
    advance(); http.expectOne(url).flush({}, {status:404,statusText:'Not Found'});
    tick(60_000); service.progress(61,true); http.expectNone(url);
    expect(service.warning()).toContain('requiere actualizarse');
  }));
  it('bounds pending requests and stops producing activity when the player closes', fakeAsync(() => {
    advance(); const first = http.expectOne(url);
    tick(10_001); expect(first.cancelled).toBeTrue(); expect(stop).not.toHaveBeenCalled();
    tick(60_000); service.progress(71,true); const second = http.expectOne(url);
    service.ngOnDestroy(); second.flush(null);
    tick(60_000); service.progress(131,true); http.expectNone(url);
  }));
  it('shares the rate limit with reader interactions', fakeAsync(() => {
    TestBed.inject(SessionActivityService).renew('interaction'); http.expectOne(url).flush(null);
    advance(); http.expectNone(url);
    tick(60_000); service.progress(61, true); http.expectOne(url).flush(null);
  }));
});
