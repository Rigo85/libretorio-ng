import {TestBed} from '@angular/core/testing';
import {Location} from '@angular/common';
import {NavigationEnd, Router} from '@angular/router';
import {Subject} from 'rxjs';
import {LibraryNavigationService,libraryPath} from './library-navigation.service';
import {DirectoryTreeComponent} from '../components/directory-tree/directory-tree.component';

describe('Library navigation boundaries',()=>{
  it('remembers only catalogue routes, never a modal or external URL',()=>{
    expect(libraryPath('/parent/a/id/book?x=1')).toBe('/parent/a');
    expect(libraryPath('/parent/a%20b')).toBe('/parent/a%20b');
    expect(libraryPath('/')).toBe('/');
    for(const value of ['/inicio','/auth/login','https://example.com','//example.com','/parent/a/extra'])expect(libraryPath(value)).toBeUndefined();
  });
  it('preserves the folder across Inicio and resets it on logout',()=>{
    const events=new Subject<NavigationEnd>();let changed!:(url:string)=>void;
    TestBed.configureTestingModule({providers:[
      {provide:Router,useValue:{events}},
      {provide:Location,useValue:{path:()=>'/parent/first/id/book',onUrlChange:(fn:any)=>{changed=fn;return ()=>{};}}}
    ]});
    const service=TestBed.inject(LibraryNavigationService);
    expect(service.returnPath()).toBe('/parent/first');
    changed('/parent/second');events.next(new NavigationEnd(1,'/inicio','/inicio'));
    expect(service.inHome()).toBeTrue();expect(service.returnPath()).toBe('/parent/second');
    changed('/auth/login');expect(service.returnPath()).toBe('/');
  });
  function tree(url:string){
    const books=jasmine.createSpyObj('books',['onBooksList']);
    const collapse=jasmine.createSpyObj('collapse',['toggleCollapseState']);collapse.collapseStates={};
    const search=jasmine.createSpyObj('search',['setSearchText']);
    const location=jasmine.createSpyObj('location',['go']);
    const router={url,navigate:jasmine.createSpy('navigate').and.resolveTo(true)};
    const component=new DirectoryTreeComponent(books,collapse,search,location,{} as any,router as any);
    return {component,books,location,router};
  }
  it('mounts the catalogue from Inicio without sending a duplicate list request',()=>{
    const t=tree('/inicio');t.component.onClick('folder');
    expect(t.router.navigate).toHaveBeenCalledOnceWith(['/parent','folder']);
    expect(t.books.onBooksList).not.toHaveBeenCalled();expect(t.location.go).not.toHaveBeenCalled();
  });
  it('leaves the existing in-catalogue click path intact',()=>{
    const t=tree('/parent/old/id/book');t.component.onClick('folder');
    expect(t.router.navigate).not.toHaveBeenCalled();
    expect(t.books.onBooksList).toHaveBeenCalledOnceWith('folder');
    expect(t.location.go).toHaveBeenCalledOnceWith('/parent/folder');
  });
});
