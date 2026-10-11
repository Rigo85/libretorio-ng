import { ComponentFixture, TestBed } from '@angular/core/testing';
import {provideRouter,Router} from '@angular/router';
import {EMPTY} from 'rxjs';
import { HeaderPanelComponent } from './header-panel.component';
import {BooksService} from '../../services/books.service';
import {AuthService} from '../../services/auth.service';
import {ReadingService} from '../../services/reading.service';
import {LibraryNavigationService} from '../../services/library-navigation.service';
import {NgxSpinnerService} from 'ngx-spinner';
import {UserManagementService} from '../../services/user-management.service';

describe('HeaderPanelComponent', () => {
  let component: HeaderPanelComponent;
  let fixture: ComponentFixture<HeaderPanelComponent>;
  let sidebar: HTMLElement;
  let width: PropertyDescriptor | undefined;
  let books: jasmine.SpyObj<BooksService>;

  beforeEach(async () => {
    width=Object.getOwnPropertyDescriptor(window,'innerWidth');
    sidebar=document.createElement('aside');sidebar.id='sidebar';document.body.append(sidebar);
    books=jasmine.createSpyObj('BooksService',['onBooksList','onSearchText','logAction']);
    spyOn(window,'ResizeObserver').and.returnValue({observe(){},unobserve(){},disconnect(){}});
    await TestBed.configureTestingModule({
      imports: [HeaderPanelComponent],
      providers:[provideRouter([{path:'cuenta',component:HeaderPanelComponent}]),
        {provide:UserManagementService,useValue:{identity:()=>Promise.resolve({userManagementEnabled:false})}},
        {provide:BooksService,useValue:books},
        {provide:AuthService,useValue:{logout:()=>EMPTY}},
        {provide:ReadingService,useValue:{identity:()=>Promise.resolve(undefined)}},
        {provide:LibraryNavigationService,useValue:{inHome:()=>false,returnPath:()=>'/'}},
        {provide:NgxSpinnerService,useValue:{show(){},hide(){}}}
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HeaderPanelComponent);
    component = fixture.componentInstance;
  });

  afterEach(()=>{fixture?.destroy();sidebar.remove();if(width)Object.defineProperty(window,'innerWidth',width);});
  function viewport(value:number){Object.defineProperty(window,'innerWidth',{value,configurable:true});}
  function checked(){fixture.detectChanges();expect(()=>fixture.checkNoChanges()).not.toThrow();}
  function expanded(value:boolean){
    expect(component.sidebarExpanded).toBe(value);
    expect(sidebar.classList.contains('d-none')).toBe(!value);
    expect(fixture.nativeElement.querySelector('#sidebarToggle').getAttribute('aria-expanded')).toBe(String(value));
  }
  for(const size of [390,767,768,1440])it(`initializes aria-expanded before the first check at ${size}px`,()=>{
    viewport(size);expect(()=>checked()).not.toThrow();expanded(size>=768);
    expect(fixture.nativeElement.querySelector('#sidebarToggle').classList.contains('d-none')).toBe(size>=768);
  });
  it('opens and closes the sidebar on mobile without navigating or requesting books',()=>{
    viewport(390);checked();
    const button:HTMLButtonElement=fixture.nativeElement.querySelector('#sidebarToggle');
    button.click();checked();expanded(true);expect(button.classList.contains('d-none')).toBeFalse();
    button.click();checked();expanded(false);
    expect(TestBed.inject(Router).url).toBe('/');expect(books.onBooksList).not.toHaveBeenCalled();
  });
  it('keeps the original breakpoint behavior when resizing',()=>{
    viewport(1440);checked();expanded(true);
    viewport(390);window.dispatchEvent(new Event('resize'));checked();expanded(false);
    viewport(900);window.dispatchEvent(new Event('resize'));checked();expanded(true);
    expect(books.onBooksList).not.toHaveBeenCalled();
  });
  it('dismisses mobile folders from backdrop and Escape without requesting or navigating',()=>{
    viewport(390);checked();component.toggleSidebar();checked();
    fixture.nativeElement.querySelector('.sidebar-backdrop').click();checked();expanded(false);
    component.toggleSidebar();checked();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));checked();expanded(false);
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('#sidebarToggle'));
    expect(TestBed.inject(Router).url).toBe('/');expect(books.onBooksList).not.toHaveBeenCalled();
  });
  function accountButton():HTMLButtonElement{return fixture.nativeElement.querySelector('.account-toggle');}
  it('never overlaps Account and the mobile folder drawer',()=>{
    viewport(390);checked();accountButton().click();checked();expect(component.accountOpen).toBeTrue();
    component.toggleSidebar();checked();expanded(true);expect(component.accountOpen).toBeFalse();
    accountButton().click();checked();expanded(false);expect(component.accountOpen).toBeTrue();
    expect(books.onBooksList).not.toHaveBeenCalled();
  });
  it('typing and clearing do not send requests; Enter commits a separate search route',()=>{
    checked();const navigate=spyOn(TestBed.inject(Router),'navigate').and.resolveTo(true);
    component.searchText='Asimov';component.searchText='';expect(books.onBooksList).not.toHaveBeenCalled();expect(books.onSearchText).not.toHaveBeenCalled();
    component.searchText='  Asimov  ';component.handleEnter();expect(navigate).toHaveBeenCalledWith(['/buscar'],{queryParams:{q:'Asimov'}});
    expect(books.onSearchText).not.toHaveBeenCalled();
  });
  function actions():HTMLElement{return fixture.nativeElement.querySelector('#account-actions');}
  it('always exposes logout even when management permissions cannot load',async()=>{
    spyOn(TestBed.inject(UserManagementService),'identity').and.rejectWith(new Error('unavailable'));
    checked();await fixture.whenStable();checked();
    accountButton().click();checked();
    expect(accountButton().getAttribute('aria-expanded')).toBe('true');
    expect(actions().hidden).toBeFalse();
    expect(actions().querySelectorAll('a').length).toBe(0);
    const logout=spyOn(TestBed.inject(AuthService),'logout').and.returnValue(EMPTY);
    actions().querySelector('button')!.click();checked();
    expect(logout).toHaveBeenCalledTimes(1);expect(actions().hidden).toBeTrue();
  });
  it('groups administrative links only in account without requesting catalogue data',async()=>{
    checked();await fixture.whenStable();component.managementEnabled=true;component.canManageUsers=true;component.readingAvailable=true;checked();
    accountButton().click();checked();
    expect(Array.from(actions().querySelectorAll('a')).map(a=>a.getAttribute('href'))).toEqual(['/cuenta','/usuarios']);
    expect(fixture.nativeElement.querySelector('.primary-nav').textContent).not.toContain('Usuarios');
    expect(books.onBooksList).not.toHaveBeenCalled();expect(TestBed.inject(Router).url).toBe('/');
  });
  it('does not render administration for a normal account',async()=>{
    checked();await fixture.whenStable();component.managementEnabled=true;checked();
    expect(actions().querySelectorAll('a').length).toBe(1);
    expect(actions().textContent).not.toContain('Gestionar usuarios');
  });
  it('closes on Escape and restores focus to the account trigger',()=>{
    checked();accountButton().click();checked();actions().querySelector('button')!.focus();
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));checked();
    expect(actions().hidden).toBeTrue();expect(document.activeElement).toBe(accountButton());
  });
  it('closes on outside click but not on clicks inside the panel',()=>{
    checked();accountButton().click();checked();actions().click();checked();expect(actions().hidden).toBeFalse();
    document.body.click();checked();expect(actions().hidden).toBeTrue();
  });
  it('closes when focus leaves account but allows moving within its actions',()=>{
    checked();accountButton().click();checked();
    accountButton().focus();actions().querySelector('button')!.focus();checked();expect(actions().hidden).toBeFalse();
    fixture.nativeElement.querySelector('input').focus();checked();expect(actions().hidden).toBeTrue();
  });
  it('closes on route navigation',async()=>{
    checked();accountButton().click();checked();
    await TestBed.inject(Router).navigateByUrl('/cuenta');checked();expect(actions().hidden).toBeTrue();
  });
});
