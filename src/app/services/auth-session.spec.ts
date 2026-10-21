import {TestBed, fakeAsync, tick} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {Router} from '@angular/router';
import {Subject} from 'rxjs';
import {AuthService} from './auth.service';
import {BooksService} from './books.service';
import {StopPlayingService} from './stop-playing.service';
import {CollapseStateService} from './collapse-state.service';
import {SearchTextService} from './search-text.service';

describe('Authentication during playback', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  let stop: jasmine.Spy;
  let navigate: jasmine.Spy;
  let expired: Subject<any>;
  beforeEach(() => {
    stop = jasmine.createSpy('stop'); navigate = jasmine.createSpy('navigate'); expired = new Subject();
    TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting(),
      {provide:Router,useValue:{navigate}}, {provide:StopPlayingService,useValue:{stopPlayingAudio:stop}},
      {provide:BooksService,useValue:{sessionExpiredIncomingMessage$:expired,disconnect:jasmine.createSpy('disconnect')}},
      {provide:CollapseStateService,useValue:{clearStates:jasmine.createSpy('clearStates')}}]});
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {auth.ngOnDestroy(); http.verify();});
  it('clears the search on expiration and logout without requesting a catalogue reset', () => {
    auth=TestBed.inject(AuthService);
    const search=TestBed.inject(SearchTextService),resets:boolean[]=[];
    const subscription=search.reset$.subscribe(value=>resets.push(value));
    search.setSearchText('previous account');auth.expireSession();expect(search.searchText).toBe('');
    search.setSearchText('another search');auth.logout();expect(search.searchText).toBe('');
    expect(resets).toEqual([false]);subscription.unsubscribe();
  });
  it('clears the search only after login succeeds', () => {
    auth=TestBed.inject(AuthService);
    const search=TestBed.inject(SearchTextService);search.setSearchText('old search');
    auth.login('test@example.test','password').subscribe();
    http.expectOne('/api/csrf-token').flush({csrfToken:'test'});
    expect(search.searchText).toBe('old search');
    http.expectOne('/api/login').flush('');expect(search.searchText).toBe('');
  });
  it('does not log out on a transient server failure', fakeAsync(() => {
    auth = TestBed.inject(AuthService);
    TestBed.inject(SearchTextService).setSearchText('preserved');
    tick(300_000); http.expectOne('/api/me?passive=1').flush({}, {status:503,statusText:'Unavailable'});
    expect(TestBed.inject(SearchTextService).searchText).toBe('preserved');
    expect(stop).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled(); auth.ngOnDestroy();
  }));
  it('stops audio on a confirmed expired HTTP session', fakeAsync(() => {
    auth = TestBed.inject(AuthService);
    tick(300_000); http.expectOne('/api/me?passive=1').flush({}, {status:401,statusText:'Unauthorized'});
    expect(stop).toHaveBeenCalledTimes(1); expect(navigate).toHaveBeenCalled(); auth.ngOnDestroy();
  }));
  it('stops immediately on WebSocket revocation, before navigation', fakeAsync(() => {
    auth = TestBed.inject(AuthService);
    expired.next({data:{message:'revoked'}});
    expect(stop).toHaveBeenCalledTimes(1); tick(100); expect(navigate).toHaveBeenCalled(); auth.ngOnDestroy();
  }));
  it('logout stops audio even before the logout request is sent', () => {
    auth = TestBed.inject(AuthService);
    auth.logout(); expect(stop).toHaveBeenCalledTimes(1);
  });
  it('handles simultaneous expiration reports once without a logout HTTP request', fakeAsync(() => {
    auth = TestBed.inject(AuthService);
    auth.expireSession(); auth.expireSession(); expired.next({data:{message:'expired'}});
    expect(stop).toHaveBeenCalledTimes(1); expect(navigate).toHaveBeenCalledTimes(1);
    tick(600_000); http.expectNone('/api/me?passive=1'); http.expectNone('/api/logout');
  }));
  it('does not poll while on the login screen', fakeAsync(() => {
    Object.assign(TestBed.inject(Router), {url:'/auth/login'});
    auth = TestBed.inject(AuthService); tick(600_000); http.expectNone('/api/me?passive=1');
  }));
  it('times out stalled probes and retries without closing the session', fakeAsync(() => {
    auth = TestBed.inject(AuthService);
    tick(300_000); const stalled = http.expectOne('/api/me?passive=1');
    tick(10_001); expect(stalled.cancelled).toBeTrue(); expect(stop).not.toHaveBeenCalled();
    tick(289_999); http.expectOne('/api/me?passive=1').flush({authenticated:true});
    auth.ngOnDestroy();
  }));
  it('resumes monitoring when the guard verifies a valid session again', fakeAsync(() => {
    auth = TestBed.inject(AuthService); auth.expireSession();
    auth.isLoggedIn().subscribe(value => expect(value).toBeTrue());
    http.expectOne('/api/me?passive=1').flush({authenticated:true});
    tick(300_000); http.expectOne('/api/me?passive=1').flush({authenticated:true});
    auth.ngOnDestroy();
  }));
});
