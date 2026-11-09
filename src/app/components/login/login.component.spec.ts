import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LoginComponent } from './login.component';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { of, throwError, Subject } from 'rxjs';
import {signal} from '@angular/core';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let auth: jasmine.SpyObj<AuthService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['login','logout'], {logoutPending:signal(false),logoutWarning:signal('')});
    auth.login.and.returnValue(of(undefined));
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    router.navigate.and.resolveTo(true);
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [{provide: AuthService, useValue: auth}, {provide: Router, useValue: router}]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('opens Inicio after successful authentication', () => {
    component.loginForm.setValue({email: 'login@example.test', password: 'test-password'});
    component.onSubmit();
    expect(auth.login).toHaveBeenCalledOnceWith('login@example.test', 'test-password');
    expect(router.navigate).toHaveBeenCalledOnceWith(['/inicio']);
  });

  it('does not authenticate or navigate with an incomplete form', () => {
    component.onSubmit();
    expect(auth.login).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(component.error).not.toBe('');
  });

  it('stays on login when authentication fails', () => {
    spyOn(console, 'error');
    auth.login.and.returnValue(throwError(() => ({status: 401})));
    component.loginForm.setValue({email: 'login@example.test', password: 'wrong-password'});
    component.onSubmit();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(component.error).toBe('Login failed.');
  });

  it('does not redirect for a response arriving after destruction', () => {
    const response = new Subject<void>();
    auth.login.and.returnValue(response);
    component.loginForm.setValue({email: 'login@example.test', password: 'test-password'});
    component.onSubmit();
    fixture.destroy();
    response.next();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('shows an uncertain logout and offers explicit retry without an automatic request', () => {
    auth.logoutWarning.set('No se pudo confirmar el cierre de sesión.');
    auth.logout.and.returnValue(throwError(()=>new Error('offline')));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain('No se pudo confirmar');
    expect(auth.logout).not.toHaveBeenCalled();
    fixture.nativeElement.querySelector('[role=alert] button').click();
    expect(auth.logout).toHaveBeenCalledTimes(1);expect(router.navigate).not.toHaveBeenCalled();
    expect(auth.logoutWarning()).not.toBe('');
  });

  it('prevents login and duplicate retry while a logout is pending', () => {
    auth.logoutPending.set(true);fixture.detectChanges();
    component.loginForm.setValue({email:'test@example.test',password:'password'});
    component.onSubmit();component.retryLogout();
    expect(auth.login).not.toHaveBeenCalled();expect(auth.logout).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('button[type=submit]').disabled).toBeTrue();
    expect(fixture.nativeElement.querySelector('[role=status]').textContent).toContain('Cerrando sesión');
  });

  it('does not retry logout during an explicit new login', () => {
    const pending=new Subject<void>();auth.login.and.returnValue(pending);
    component.loginForm.setValue({email:'test@example.test',password:'password'});
    component.onSubmit();component.retryLogout();component.onSubmit();
    expect(auth.logout).not.toHaveBeenCalled();expect(auth.login).toHaveBeenCalledTimes(1);
    pending.complete();expect(component.loggingIn).toBeFalse();
  });
});
