import {inject, Injectable, OnDestroy, signal} from '@angular/core';
import {Location} from '@angular/common';
import {NavigationEnd, Router} from '@angular/router';
import {filter} from 'rxjs';

export function libraryPath(url:string):string|undefined {
  const path=url.split(/[?#]/,1)[0];
  if(path==='/')return '/';
  const match=/^\/parent\/([^/]+)(?:\/id\/[^/]+)?$/.exec(path);
  return match?`/parent/${match[1]}`:undefined;
}

@Injectable({providedIn:'root'})
export class LibraryNavigationService implements OnDestroy {
  private router=inject(Router);
  private location=inject(Location);
  readonly inHome=signal(false);
  readonly returnPath=signal('/');
  private observe=(url:string)=>{
    if(url.startsWith('/auth')){this.returnPath.set('/');this.inHome.set(false);return;}
    this.inHome.set(url.split(/[?#]/,1)[0]==='/inicio');
    const path=libraryPath(url);if(path)this.returnPath.set(path);
  };
  private unlisten=this.location.onUrlChange(this.observe);
  private subscription=this.router.events.pipe(filter(event=>event instanceof NavigationEnd))
    .subscribe(event=>this.observe(event.urlAfterRedirects));
  constructor(){this.observe(this.location.path()||'/');}
  ngOnDestroy(){this.unlisten();this.subscription.unsubscribe();}
}
