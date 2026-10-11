import {signal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {EpubSpeechComponent} from './epub-speech.component';
import {EpubSpeechService} from '../../services/epub-speech.service';

describe('EPUB speech controls',()=>{
  const spanish={voiceURI:'es',name:'Spanish United States',lang:'es_US',localService:true} as SpeechSynthesisVoice;
  const english={voiceURI:'en',name:'English',lang:'en-US',localService:true} as SpeechSynthesisVoice;
  let service:any,component:EpubSpeechComponent;
  beforeEach(async()=>{
    service={revision:signal(0),voices:{voices:signal([spanish,english])},reader:{session:{cursor:10,end:100},state:'paused'},
      saved:{cfi:'saved'},pause:jasmine.createSpy(),start:jasmine.createSpy().and.resolveTo(),restart:jasmine.createSpy().and.resolveTo(),
      bind:jasmine.createSpy(),clearContext:jasmine.createSpy(),running:false,busy:false,error:''};
    await TestBed.configureTestingModule({imports:[EpubSpeechComponent]}).overrideComponent(EpubSpeechComponent,{
      set:{providers:[{provide:EpubSpeechService,useValue:service}]}
    }).compileComponents();
    const fixture=TestBed.createComponent(EpubSpeechComponent);component=fixture.componentInstance;
    component.languageId='';component.voiceId=component.key(spanish);fixture.detectChanges();
  });
  it('filters both language and voice lists using Spanish even when the voice name is English',()=>{
    component.query='espa';expect(component.voices).toEqual([spanish]);expect(component.languages.map(v=>v.id)).toEqual(['es']);
    component.query='Spanish';expect(component.voices).toEqual([spanish]);
    component.query='es-US';expect(component.voices).toEqual([spanish]);
  });
  it('outer continue never replaces a saved reading with a stale selection',async()=>{
    component.captured={cfi:'new',sectionHref:'new.xhtml',preview:'new'};
    await component.continueSaved();expect(service.start).toHaveBeenCalledOnceWith(undefined,spanish,component.rate,false);
    expect(component.confirmation).toBe('');
  });
  it('requires confirmation before replacing or restarting',async()=>{
    component.captured={cfi:'new',sectionHref:'new.xhtml',preview:'new'};
    await component.play();expect(service.start).not.toHaveBeenCalled();expect(component.confirmation).toBe('replace');
    component.confirmation='';expect(service.start).not.toHaveBeenCalled();
    component.askRestart();expect(service.restart).not.toHaveBeenCalled();await component.confirm();
    expect(service.restart).toHaveBeenCalledTimes(1);
  });
  it('retains pointerdown selection when opening the dialog removes browser selection',()=>{
    const selection={cfi:'new',sectionHref:'chapter',preview:'Preview'};component.selection=selection;component.capture();
    component.selection=undefined;component.open();expect(component.captured).toEqual(selection);component.close();
  });
});
