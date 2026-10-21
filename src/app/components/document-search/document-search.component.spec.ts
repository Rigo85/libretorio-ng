import {ComponentFixture,TestBed} from '@angular/core/testing';
import {DocumentSearchComponent} from './document-search.component';
import {DocumentSearch} from '../../core/document-search';

describe('Document search dialog',()=>{
  let fixture:ComponentFixture<DocumentSearchComponent>,component:DocumentSearchComponent,dialog:HTMLDialogElement;
  beforeEach(async()=>{
    await TestBed.configureTestingModule({imports:[DocumentSearchComponent]}).compileComponents();
    fixture=TestBed.createComponent(DocumentSearchComponent);component=fixture.componentInstance;
    component.search=new DocumentSearch({search:async()=>({hits:[],cursor:0,done:true})},()=>{});
    document.body.append(fixture.nativeElement);fixture.detectChanges();
    dialog=component.dialog.nativeElement;
  });
  afterEach(()=>{
    (document.activeElement as HTMLElement)?.blur();
    fixture.destroy();
    document.getSelection()?.removeAllRanges();
  });
  it('isolates the header/footer from app-wide styles and aligns the search controls',()=>{
    component.search!.query='texto';component.search!.hits=Array.from({length:50},(_,i)=>({label:`Pagina ${i}`,excerpt:'Texto '.repeat(20)}));
    fixture.detectChanges();component.open();
    for(const width of [304,374,520]){
      dialog.style.width=width+'px';dialog.style.setProperty('--search-viewport-height','360px');
      const footer=dialog.querySelector('footer')!,header=dialog.querySelector('header')!;
      expect(getComputedStyle(footer).position).toBe('static');expect(getComputedStyle(header).maxHeight).toBe('none');
      const input=dialog.querySelector('input')!.getBoundingClientRect(),button=dialog.querySelector('form button')!.getBoundingClientRect();
      expect(input.height).toBe(44);expect(button.height).toBe(44);expect(input.top).toBeCloseTo(button.top,0);
      expect(input.right).toBeLessThan(button.left);expect(dialog.scrollWidth).toBeLessThanOrEqual(dialog.clientWidth);
      expect(footer.getBoundingClientRect().bottom).toBeLessThanOrEqual(dialog.getBoundingClientRect().bottom);
      const list=dialog.querySelector('ul')!;expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
    }
    component.close();expect(dialog.open).toBeFalse();
  });
  it('restores focus to the opener and retains the selected results on close',()=>{
    const opener=fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    opener.focus();component.open();expect(dialog.contains(document.activeElement)).toBeTrue();
    const hit={label:'Pagina 3',excerpt:'texto',page:3};component.search!.hits=[hit];
    const selected=spyOn(component.selected,'emit');component.choose(hit,0);
    expect(selected).toHaveBeenCalledOnceWith(hit);expect(component.search!.hits).toEqual([hit]);
    expect(document.activeElement).toBe(opener);
  });
  it('removes viewport listeners and cancels search when destroyed while open',()=>{
    const viewport=window.visualViewport!;const removed=spyOn(viewport,'removeEventListener').and.callThrough();
    const close=spyOn(component.search!,'close').and.callThrough();component.open();fixture.destroy();
    expect(removed).toHaveBeenCalledWith('resize',jasmine.any(Function));expect(removed).toHaveBeenCalledWith('scroll',jasmine.any(Function));
    expect(close).toHaveBeenCalled();expect(dialog.open).toBeFalse();
  });
});
