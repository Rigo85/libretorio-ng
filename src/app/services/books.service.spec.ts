import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { BooksService } from './books.service';

describe('Prepared PDF requests', () => {
  let service: BooksService;
  let send: jasmine.Spy;
  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(BooksService);
    (service as any).connectionStatus.next(true);
    send = spyOn<any>(service, 'sendMessage');
  });
  function reply(data: object) { (service as any).routeIncoming({event: 'convert_to_pdf', data}); }
  it('subscribes before sending, even for a synchronous response', () => {
    send.and.callFake((message: any) => reply({requestId: message.data.requestId, success: 'OK'}));
    const next = jasmine.createSpy('next');
    service.getPreparedPdf('/books/one.doc', 'one').subscribe(next);
    expect(next).toHaveBeenCalledTimes(1);
  });
  it('isolates concurrent and cancelled responses', () => {
    const first = jasmine.createSpy('first'), second = jasmine.createSpy('second');
    const one = service.getPreparedPdf('/books/one.doc', 'one').subscribe(first);
    const id1 = send.calls.mostRecent().args[0].data.requestId;
    service.getPreparedPdf('/books/two.doc', 'two').subscribe(second);
    const id2 = send.calls.mostRecent().args[0].data.requestId;
    one.unsubscribe();
    reply({requestId: id1, success: 'OK'});
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    reply({requestId: id2, success: 'ERROR', code: 'PDF_FAILED'});
    expect(second).toHaveBeenCalledTimes(1);
  });
  it('fails closed with a specific error when the backend has the old protocol', () => {
    const error = jasmine.createSpy('error'), next = jasmine.createSpy('next');
    service.getPreparedPdf('/books/one.doc', 'one').subscribe({error, next});
    reply({success: 'OK', pdfPath: '/cache/one/one.pdf'});
    expect(error.calls.mostRecent().args[0].message).toBe('PDF_BACKEND_UPDATE_REQUIRED');
    expect(next).not.toHaveBeenCalled();
  });
  it('fails promptly while disconnected, without queuing requests', () => {
    (service as any).connectionStatus.next(false);
    const error = jasmine.createSpy('error');
    service.getPreparedPdf('/books/one.doc', 'one').subscribe({error});
    expect(error).toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
  it('bounds waiting and ignores replies after timeout', fakeAsync(() => {
    const error = jasmine.createSpy('error'), next = jasmine.createSpy('next');
    service.getPreparedPdf('/books/one.doc', 'one').subscribe({error, next});
    const requestId = send.calls.mostRecent().args[0].data.requestId;
    tick(10_001);
    reply({requestId, success: 'OK'});
    expect(error).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  }));
});

describe('Correlated comic requests',()=>{
  let service:BooksService,send:jasmine.Spy;
  beforeEach(()=>{TestBed.configureTestingModule({});service=TestBed.inject(BooksService);(service as any).connectionStatus.next(true);send=spyOn<any>(service,'sendMessage');});
  const response=(service:BooksService,data:any)=>(service as any).routeIncoming({event:'decompress',data});
  it('subscribes before sending and includes archive, block and cache revision',()=>{
    send.and.callFake((m:any)=>response(service,{...m.data,success:'OK'}));const next=jasmine.createSpy('next');
    service.getComicPages(1,'one',2,'revision').subscribe(next);
    expect(next).toHaveBeenCalledTimes(1);expect(send.calls.mostRecent().args[0].data).toEqual(jasmine.objectContaining({archiveId:1,id:'one',index:2,sourceRevision:'revision'}));
  });
  it('ignores unrelated, uncorrelated and cancelled responses',()=>{
    const first=jasmine.createSpy('first'),second=jasmine.createSpy('second');
    const a=service.getComicPages(1,'one',0).subscribe(first),id1=send.calls.mostRecent().args[0].data;
    service.getComicPages(2,'two',1).subscribe(second);const id2=send.calls.mostRecent().args[0].data;a.unsubscribe();
    response(service,{success:'OK'});response(service,{...id1,success:'OK'});expect(second).not.toHaveBeenCalled();
    response(service,{...id2,success:'OK'});expect(second).toHaveBeenCalledTimes(1);expect(first).not.toHaveBeenCalled();
  });
  it('times out without queuing more requests',fakeAsync(()=>{
    const error=jasmine.createSpy('error');service.getComicPages(1,'one',0).subscribe({error});tick(20001);
    expect(error).toHaveBeenCalledTimes(1);expect(send).toHaveBeenCalledTimes(1);
  }));
});
