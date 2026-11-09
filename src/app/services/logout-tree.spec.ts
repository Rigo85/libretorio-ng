import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {provideHttpClientTesting, HttpTestingController} from '@angular/common/http/testing';
import {Location} from '@angular/common';
import {Router} from '@angular/router';
import {Subject} from 'rxjs';
import {DirectoryTreeComponent} from '../components/directory-tree/directory-tree.component';
import {CollapseStateService} from './collapse-state.service';
import {BooksService} from './books.service';
import {AuthService} from './auth.service';
import {ReadingService} from './reading.service';
import {SessionActivityService} from './session-activity.service';
import {StopPlayingService} from './stop-playing.service';
import {Directory} from '../core/headers';

describe('Logout with the real directory tree', () => {
  for(const url of ['/inicio','/parent/group1','/buscar?q=test'])it(`does not expand the catalogue while logout waits from ${url}`, async () => {
    sessionStorage.removeItem('libretorio:logout-unconfirmed');
    TestBed.configureTestingModule({imports:[DirectoryTreeComponent],providers:[
      provideHttpClient(),provideHttpClientTesting(),
      {provide:Router,useValue:{url,navigate:()=>Promise.resolve(true)}},
      {provide:Location,useValue:{}},
      {provide:BooksService,useValue:{sessionExpiredIncomingMessage$:new Subject(),disconnect(){}}},
      {provide:ReadingService,useValue:{stop(){}}},
      {provide:SessionActivityService,useValue:{stop(){}}},
      {provide:StopPlayingService,useValue:{stopPlayingAudio(){}}}
    ]});
    // JIT needs the recursive component registered explicitly; production uses AOT.
    TestBed.overrideComponent(DirectoryTreeComponent,{add:{imports:[DirectoryTreeComponent]}});
    await TestBed.compileComponents();
    const root:Directory={name:'root',hash:'root',directories:Array.from({length:3},(_,i)=>({
      name:'group '+i,hash:'group'+i,directories:Array.from({length:700},(_,j)=>({name:'folder '+j,hash:`f${i}-${j}`,directories:[]}))
    }))};
    const state=TestBed.inject(CollapseStateService),auth=TestBed.inject(AuthService),http=TestBed.inject(HttpTestingController);
    const fixture=TestBed.createComponent(DirectoryTreeComponent);
    try {
      state.initializeCollapseStates(root);fixture.componentRef.setInput('directory',root);fixture.detectChanges();
      const nodes=()=>fixture.nativeElement.querySelectorAll('button').length;
      expect(nodes()).toBe(4);
      state.toggleCollapseState('group1');fixture.detectChanges();expect(nodes()).toBe(704);
      auth.logout().subscribe();fixture.detectChanges();expect(nodes()).toBe(1);
      expect((state as any)._initialized).toBeFalse();expect((state as any).lastDirectory).toBeUndefined();
      expect(fixture.componentInstance.isCollapsed('unknown')).toBeTrue();
      expect(fixture.componentInstance.isCollapsed(undefined)).toBeTrue();
      http.expectOne('/api/csrf-token').flush({csrfToken:'token'});http.expectOne('/api/logout').flush({success:true});
      // Next login and a deep link must still open exactly the requested branch.
      state.setPendingHash('f2-5');state.initializeCollapseStates(root);fixture.detectChanges();
      expect(nodes()).toBe(704);expect(state.lastHash).toBe('f2-5');
      expect(fixture.componentInstance.isCollapsed('group2')).toBeFalse();
      expect(fixture.componentInstance.isCollapsed('group1')).toBeTrue();
      expect(fixture.componentInstance.isCollapsed('f2-5')).toBeFalse();
    } finally {fixture.destroy();auth.ngOnDestroy();sessionStorage.removeItem('libretorio:logout-unconfirmed');}
    http.verify();
  });
});
