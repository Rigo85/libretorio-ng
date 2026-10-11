import {TestBed} from '@angular/core/testing';
import {UsersComponent} from './users.component';
import {UserManagementService} from '../../services/user-management.service';
import {AuthService} from '../../services/auth.service';

describe('UsersComponent',()=>{
  let api:any,auth:any;
  beforeEach(()=>{
    api={list:jasmine.createSpy().and.resolveTo({items:[],next:null}),save:jasmine.createSpy().and.resolveTo({})};
    auth={expireSession:jasmine.createSpy()};
    TestBed.configureTestingModule({imports:[UsersComponent],providers:[{provide:UserManagementService,useValue:api},{provide:AuthService,useValue:auth}]});
  });
  it('does not retain prior pages and ignores superseded responses',async()=>{
    const fixture=TestBed.createComponent(UsersComponent),c=fixture.componentInstance;
    let resolve!:(v:any)=>void;api.list.and.returnValue(new Promise(r=>resolve=r));const old=c.load();
    api.list.and.resolveTo({items:[{id:'new'}],next:null});await c.load('next');resolve({items:[{id:'old'}],next:'stale'});await old;
    expect(c.items.map(x=>x.id)).toEqual(['new']);expect(c.next).toBeNull();fixture.destroy();
  });
  it('checks password confirmation without making an HTTP write',async()=>{
    const fixture=TestBed.createComponent(UsersComponent),c=fixture.componentInstance;c.edit();c.password='long secret';c.confirmation='other';
    await c.save();expect(api.save).not.toHaveBeenCalled();expect(c.error).toContain('no coinciden');fixture.destroy();
  });
  it('uses explicit revision and clears secrets after a failed write',async()=>{
    const fixture=TestBed.createComponent(UsersComponent),c=fixture.componentInstance;c.edit({id:'user',email:'u@e.com',isAdmin:false,isActive:true,createdAt:'',revision:3});
    c.adminPassword='private';api.save.and.rejectWith({error:{code:'USER_CHANGED'}});await c.save();
    expect(api.save.calls.mostRecent().args[2].expectedRevision).toBe(3);expect(c.adminPassword).toBe('');expect(c.error).toContain('cuenta cambió');expect(c.editing).toBeTrue();fixture.destroy();
  });
  it('closes the current session after a successful self-revocation',async()=>{
    const fixture=TestBed.createComponent(UsersComponent),c=fixture.componentInstance;c.edit({id:'self',email:'u@e.com',isAdmin:true,isActive:true,createdAt:'',revision:0});
    api.save.and.resolveTo({selfRevoked:true});await c.save();expect(auth.expireSession).toHaveBeenCalled();fixture.destroy();
  });
  it('never exposes a delete action',()=>{
    const fixture=TestBed.createComponent(UsersComponent);fixture.componentInstance.edit({id:'user',email:'u@e.com',isAdmin:false,isActive:true,createdAt:'',revision:0});fixture.detectChanges();
    const choices=Array.from(fixture.nativeElement.querySelectorAll('#user-action option')) as HTMLOptionElement[];
    expect(choices.map(x=>x.value)).toEqual(['edit','password','revoke']);fixture.destroy();
  });
});
