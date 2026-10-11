import {ReadingService,ReadingTracker,ReadingContext,ReadingIdentity} from './reading.service';
import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {provideHttpClientTesting,HttpTestingController} from '@angular/common/http/testing';

describe('ReadingService scoped request cancellation',()=>{
  let service:ReadingService,http:HttpTestingController;
  const identity:ReadingIdentity={version:1,userId:'cancel-test',epoch:'epoch'};
  beforeEach(()=>{
    TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting()]});
    service=TestBed.inject(ReadingService);http=TestBed.inject(HttpTestingController);
  });
  afterEach(()=>http.verify());
  it('cancels the history HTTP request without cancelling an independent reader request',async()=>{
    const controller=new AbortController();
    const history=service.request('GET','/history',undefined,identity,controller.signal);
    const request=http.expectOne('/api/reading/history');
    const reader=service.request('GET','/items/1/progress/pdf',undefined,identity);
    const progress=http.expectOne('/api/reading/items/1/progress/pdf');
    controller.abort();expect(request.cancelled).toBeTrue();expect(progress.cancelled).toBeFalse();
    await expectAsync(history).toBeRejected();progress.flush({saved:null});expect(await reader).toEqual({saved:null});
  });
  it('does not dispatch a request which was cancelled while waiting for identity',async()=>{
    let resolve!:(value:ReadingIdentity)=>void;
    spyOn(service,'identity').and.returnValue(new Promise(done=>resolve=done));
    const controller=new AbortController(),pending=service.request('GET','/history',undefined,undefined,controller.signal);
    controller.abort();resolve(identity);await expectAsync(pending).toBeRejected();http.expectNone('/api/reading/history');
  });
});

describe('ReadingTracker isolated progress',()=>{
  const identity:ReadingIdentity={version:1,userId:'unit-reader',epoch:'epoch-a'};
  const context=():ReadingContext=>({sourceRevision:'source-a',sourcePath:'/books/test.pdf',changed:false,saved:null});
  let api:jasmine.SpyObj<ReadingService>,tracker:ReadingTracker;
  beforeEach(()=>{localStorage.removeItem('libretorio:reading:position:unit-reader:10:pdf');api=jasmine.createSpyObj('ReadingService',['request']);api.request.and.resolveTo(context());tracker=new ReadingTracker(api,10,'pdf',identity,()=>{});});
  afterEach(()=>{tracker.dispose(false);localStorage.removeItem('libretorio:reading:position:unit-reader:10:pdf');});
  const position={version:1 as const,page:2,ratio:.5,mode:'original'};
  it('does not save provisional reader positions before restoration',async()=>{
    await tracker.load();tracker.capture(position);await tracker.flush();expect(api.request).toHaveBeenCalledTimes(1);
    tracker.ready=true;api.request.and.resolveTo({revision:1,position});tracker.capture(position);await tracker.flush();
    expect(api.request.calls.mostRecent().args[0]).toBe('PUT');expect(api.request.calls.mostRecent().args[3]).toEqual(identity);
  });
  it('does not mistake PostgreSQL JSON key ordering for a changed position',async()=>{
    api.request.and.resolveTo({...context(),saved:{revision:1,position:{mode:'original',ratio:.5,page:2,version:1}}});
    await tracker.load();tracker.ready=true;tracker.capture(position);await tracker.flush();
    expect(api.request).toHaveBeenCalledTimes(1);expect(tracker.status()).toBe('');
  });
  it('never replaces a changed source or a conflicting server position automatically',async()=>{
    api.request.and.resolveTo({...context(),changed:true,saved:{revision:3,position}});await tracker.load();tracker.ready=true;
    tracker.capture({...position,page:0});await tracker.flush();expect(tracker.blocked).toBeTrue();expect(api.request).toHaveBeenCalledTimes(1);
  });
  it('replays the same operation after a lost response',async()=>{
    await tracker.load();tracker.ready=true;tracker.capture(position);
    api.request.and.rejectWith({status:0});await tracker.flush();const operation=api.request.calls.mostRecent().args[2];
    api.request.and.resolveTo({revision:1,position});await tracker.flush();expect(api.request.calls.mostRecent().args[2]).toEqual(operation);
    expect(tracker.blocked).toBeFalse();expect(tracker.status()).toBe('');
  });
  it('blocks stale writes instead of adopting another device revision',async()=>{
    await tracker.load();tracker.ready=true;tracker.capture(position);api.request.and.rejectWith({status:409});await tracker.flush();
    expect(tracker.blocked).toBeTrue();const calls=api.request.calls.count();await tracker.flush();expect(api.request.calls.count()).toBe(calls);
  });
  it('does not adopt an anonymous or previous-session cached draft',async()=>{
    localStorage.setItem('libretorio:reading:position:unit-reader:10:pdf',JSON.stringify({epoch:'old',draft:position,revision:0,sourceRevision:'source-a'}));
    await tracker.load();expect(tracker.restored).toBeUndefined();
  });
  it('cancels delayed target resolution on logout',async()=>{
    await tracker.load();tracker.ready=true;tracker.capture({...position,section:'chapter.xhtml'});
    let resolve!:(value:any)=>void;api.request.and.returnValue(new Promise(done=>resolve=done));
    const pending=tracker.flush();tracker.dispose(false);resolve(context());await pending;
    expect(api.request.calls.mostRecent().args[0]).toBe('GET');
  });
  it('finishes a newer draft on close after an in-flight acknowledgement',async()=>{
    await tracker.load();tracker.ready=true;tracker.capture(position);
    let resolve!:(value:any)=>void;api.request.and.returnValue(new Promise(done=>resolve=done));
    const pending=tracker.flush();tracker.capture({...position,page:3});tracker.dispose();
    api.request.and.resolveTo({revision:2,position:{...position,page:3}});resolve({revision:1,position});await pending;await Promise.resolve();
    expect((api.request.calls.mostRecent().args[2] as any).position.page).toBe(3);
    expect((api.request.calls.mostRecent().args[2] as any).expectedRevision).toBe(1);
  });
});
