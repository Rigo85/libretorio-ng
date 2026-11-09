import {TestBed, fakeAsync, tick} from '@angular/core/testing';
import {HttpClient, provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {Router} from '@angular/router';
import {Subject} from 'rxjs';
import {AuthService} from './auth.service';
import {BooksService} from './books.service';
import {StopPlayingService} from './stop-playing.service';
import {CollapseStateService} from './collapse-state.service';
import {ReadingService} from './reading.service';
import {SessionActivityService} from './session-activity.service';
import {SearchTextService} from './search-text.service';

describe('Bounded logout', () => {
  const key='libretorio:logout-unconfirmed';
  let auth:AuthService,http:HttpTestingController,navigate:jasmine.Spy,stop:jasmine.Spy,expired:Subject<any>;
  beforeEach(()=>{
    sessionStorage.removeItem(key);
    navigate=jasmine.createSpy('navigate').and.resolveTo(true);stop=jasmine.createSpy('stop');expired=new Subject();
    TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting(),
      {provide:Router,useValue:{url:'/inicio',navigate}},
      {provide:BooksService,useValue:{sessionExpiredIncomingMessage$:expired,disconnect:jasmine.createSpy('disconnect')}},
      {provide:ReadingService,useValue:{stop:jasmine.createSpy('stopReading')}},
      {provide:SessionActivityService,useValue:{stop:jasmine.createSpy('stopActivity'),reset:jasmine.createSpy('reset')}},
      {provide:StopPlayingService,useValue:{stopPlayingAudio:stop}}
    ]});
    auth=TestBed.inject(AuthService);http=TestBed.inject(HttpTestingController);
  });
  afterEach(()=>{auth.ngOnDestroy();http.verify();sessionStorage.removeItem(key);});
  function csrf(){http.expectOne('/api/csrf-token').flush({csrfToken:'token'});}
  it('coalesces callers into one operation and retains CSRF protection',()=>{
    const first=auth.logout(),second=auth.logout();expect(first).toBe(second);
    const done=jasmine.createSpy('done');first.subscribe(done);second.subscribe(done);
    expect(stop).toHaveBeenCalledTimes(1);expect(auth.logoutPending()).toBeTrue();
    csrf();const request=http.expectOne('/api/logout');
    expect(request.request.headers.get('X-CSRF-Token')).toBe('token');
    expect(request.request.withCredentials).toBeTrue();request.flush({success:true});
    expect(done).toHaveBeenCalledTimes(2);expect(auth.logoutPending()).toBeFalse();
    expect(auth.logoutWarning()).toBe('');expect(sessionStorage.getItem(key)).toBeNull();
    expect(navigate).toHaveBeenCalledOnceWith(['/auth/login'],{replaceUrl:true});
  });
  it('bounds a stalled CSRF request and does not retry automatically',fakeAsync(()=>{
    const failed=jasmine.createSpy('failed');auth.logout().subscribe({error:failed});
    const request=http.expectOne('/api/csrf-token');tick(10_001);
    expect(request.cancelled).toBeTrue();expect(failed).toHaveBeenCalledTimes(1);
    expect(auth.logoutPending()).toBeFalse();expect(auth.logoutWarning()).toContain('No se pudo confirmar');
    expect(sessionStorage.getItem(key)).toBe('1');expect(navigate).toHaveBeenCalledTimes(1);
    tick(300_000);http.expectNone('/api/logout');http.expectNone('/api/csrf-token');http.expectNone('/api/me?passive=1');
  }));
  it('shares one deadline between CSRF and POST, and cancels late responses',fakeAsync(()=>{
    auth.logout().subscribe({error:()=>{}});tick(8_000);csrf();
    const request=http.expectOne('/api/logout');tick(2_001);
    expect(request.cancelled).toBeTrue();expect(auth.logoutWarning()).not.toBe('');
    expect(()=>request.flush({success:true})).toThrow();
    expect(navigate).toHaveBeenCalledTimes(1);
  }));
  for(const status of [0,401,403,500,503])it(`does not claim success on an unrecognized ${status} response`,()=>{
    auth.logout().subscribe({error:()=>{}});csrf();
    const request=http.expectOne('/api/logout');
    if(status===0)request.error(new ProgressEvent('error'));
    else request.flush({error:'failed'},{status,statusText:'Failed'});
    expect(auth.logoutWarning()).not.toBe('');expect(auth.logoutPending()).toBeFalse();
    expect(navigate).toHaveBeenCalledOnceWith(['/auth/login'],{replaceUrl:true});
    auth.isLoggedIn().subscribe(value=>expect(value).toBeFalse());http.expectNone('/api/me?passive=1');
  });
  for(const code of ['SESSION_EXPIRED','SESSION_INVALIDATED'])it(`accepts the server's explicit ${code} confirmation`,()=>{
    const done=jasmine.createSpy('done');auth.logout().subscribe(done);
    http.expectOne('/api/csrf-token').flush({code},{status:401,statusText:'Unauthorized'});
    expect(done).toHaveBeenCalledTimes(1);expect(auth.logoutWarning()).toBe('');
    http.expectNone('/api/logout');
  });
  it('finishes the bounded request even if the initiating component is destroyed',()=>{
    const subscription=auth.logout().subscribe();csrf();const request=http.expectOne('/api/logout');
    subscription.unsubscribe();expect(request.cancelled).toBeFalse();request.flush({success:true});
    expect(auth.logoutPending()).toBeFalse();expect(navigate).toHaveBeenCalledTimes(1);
  });
  it('supports explicit retry after failure and forgets the warning only on confirmation',()=>{
    auth.logout().subscribe({error:()=>{}});
    http.expectOne('/api/csrf-token').flush({}, {status:503,statusText:'Unavailable'});
    const retry=auth.logout();retry.subscribe();csrf();http.expectOne('/api/logout').flush({success:true});
    expect(auth.logoutWarning()).toBe('');expect(sessionStorage.getItem(key)).toBeNull();
    expect(navigate).toHaveBeenCalledTimes(2);
  });
  it('preserves uncertainty across service recreation and clears it after explicit login',()=>{
    auth.logout().subscribe({error:()=>{}});
    http.expectOne('/api/csrf-token').error(new ProgressEvent('error'));
    auth.ngOnDestroy();
    const restored=new AuthService(TestBed.inject(HttpClient),TestBed.inject(Router),TestBed.inject(BooksService),
      TestBed.inject(CollapseStateService),TestBed.inject(StopPlayingService),TestBed.inject(SessionActivityService),
      TestBed.inject(ReadingService),TestBed.inject(SearchTextService));
    expect(restored.logoutWarning()).not.toBe('');
    restored.login('test@example.test','password').subscribe();csrf();http.expectOne('/api/login').flush('');
    expect(restored.logoutWarning()).toBe('');expect(sessionStorage.getItem(key)).toBeNull();restored.ngOnDestroy();
  });
  it('ignores simultaneous expiration events and a stale successful guard response',()=>{
    const allowed=jasmine.createSpy('allowed');auth.isLoggedIn().subscribe(allowed);
    const guard=http.expectOne('/api/me?passive=1');
    auth.logout().subscribe();expired.next({data:{message:'expired'}});auth.expireSession();
    expect(stop).toHaveBeenCalledTimes(1);csrf();http.expectOne('/api/logout').flush({success:true});
    guard.flush({authenticated:true});expect(allowed).toHaveBeenCalledOnceWith(false);
    expect(navigate).toHaveBeenCalledTimes(1);
  });
  it('does not start a new login until the pending logout finishes',()=>{
    spyOn(console,'error');auth.logout().subscribe();
    const failed=jasmine.createSpy('failed');auth.login('test@example.test','password').subscribe({error:failed});
    expect(failed).toHaveBeenCalledTimes(1);csrf();http.expectNone('/api/login');
    http.expectOne('/api/logout').flush({success:true});
  });
});
