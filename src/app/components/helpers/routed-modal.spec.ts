import {RoutedModal} from './routed-modal';

describe('Routed modal transitions',()=>{
  let element:HTMLElement,instance:any,previous:any,modal:RoutedModal;
  beforeEach(()=>{
    element=document.createElement('div');document.body.append(element);
    instance={show:jasmine.createSpy('show').and.callFake(()=>element.dispatchEvent(new Event('show.bs.modal'))),
      hide:jasmine.createSpy('hide').and.callFake(()=>element.dispatchEvent(new Event('hide.bs.modal'))),dispose:jasmine.createSpy('dispose')};
    previous=(window as any).bootstrap;
    (window as any).bootstrap={Modal:{getOrCreateInstance:()=>instance,getInstance:()=>instance}};
    modal=new RoutedModal(element);
  });
  afterEach(()=>{(window as any).bootstrap=previous;element.remove();});
  it('waits for opening to complete before hiding and disposing its own element',async()=>{
    const opened=modal.visible(true);await Promise.resolve();
    const disposed=modal.dispose(true);expect(instance.hide).not.toHaveBeenCalled();
    element.dispatchEvent(new Event('shown.bs.modal'));await opened;await Promise.resolve();
    expect(instance.hide).toHaveBeenCalledTimes(1);expect(instance.dispose).not.toHaveBeenCalled();
    element.dispatchEvent(new Event('hidden.bs.modal'));await disposed;
    expect(instance.dispose).toHaveBeenCalledTimes(1);expect(element.isConnected).toBeFalse();
  });
  it('ignores bubbling transitions belonging to another modal',async()=>{
    const child=document.createElement('div');element.append(child);
    child.dispatchEvent(new Event('show.bs.modal',{bubbles:true}));
    await modal.dispose();expect(instance.hide).not.toHaveBeenCalled();expect(instance.dispose).toHaveBeenCalledTimes(1);
  });
});
