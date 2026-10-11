import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LoginComponent } from './login.component';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { of, throwError, Subject } from 'rxjs';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let auth: jasmine.SpyObj<AuthService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['login']);
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
});
