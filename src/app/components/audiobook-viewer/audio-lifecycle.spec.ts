import {ComponentFixture, TestBed, fakeAsync, tick, flushMicrotasks} from '@angular/core/testing';
import {Subject} from 'rxjs';
import {AudiobookViewerComponent} from './audiobook-viewer.component';
import {BooksService} from '../../services/books.service';
import {AudioDiagnosticsService} from '../../services/audio-diagnostics.service';
import {hash} from '../../core/headers';
import {provideHttpClient} from '@angular/common/http';
import {ReadingService} from '../../services/reading.service';

class FakeAudio extends EventTarget {
  paused = true; ended = false; currentTime = 0; duration = 100; readyState = 0;
  playbackRate = 1; defaultPlaybackRate = 1; volume = .25; muted = false; src = ''; preload = ''; removed = false;
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
  play() { this.paused = false; this.dispatchEvent(new Event('playing')); return Promise.resolve(); }
  load() { this.readyState = 0; }
  removeAttribute() { this.src = ''; }
  remove() { this.removed = true; }
  metadata() { this.readyState = 1; this.dispatchEvent(new Event('loadedmetadata')); }
}

describe('Integrated native audio lifecycle', () => {
  let fixture: ComponentFixture<AudiobookViewerComponent>;
  let component: AudiobookViewerComponent;
  let audio: FakeAudio;
  let messages: Subject<any>;
  let request: jasmine.Spy;
  let storage: Map<string, string>;
  const source = '/server/dist/public/books/audio';
  const tracks = [
    {title:'A.m4a', src:source+'/A.m4a', type:'audio/mp4', length:'1:40', chapters:[{title:'One', startTimeInSeconds:0}, {title:'Two', startTimeInSeconds:50}]},
    {title:'B.m4b', src:source+'/B.m4b', type:'audio/mp4', length:'3:20', chapters:[{title:'Other', startTimeInSeconds:20}]}
  ];
  beforeEach(async () => {
    audio = new FakeAudio(); messages = new Subject(); request = jasmine.createSpy('getAudioBook'); storage = new Map();
    spyOn(window, 'Audio').and.returnValue(audio as unknown as HTMLAudioElement);
    spyOn(Storage.prototype, 'getItem').and.callFake(key => storage.get(key) ?? null);
    spyOn(Storage.prototype, 'setItem').and.callFake((key, value) => storage.set(key, value));
    await TestBed.configureTestingModule({imports:[AudiobookViewerComponent], providers:[
      provideHttpClient(),
      {provide:BooksService, useValue:{audioBookIncomingMessage$:messages, getAudioBook:request}}
    ]}).overrideComponent(AudiobookViewerComponent,{set:{template:''}}).compileComponents();
  });
  afterEach(() => fixture?.destroy());
  function create(load = true, archiveId?: number) {
    fixture = TestBed.createComponent(AudiobookViewerComponent);
    component = fixture.componentInstance;
    if (archiveId !== undefined) fixture.componentRef.setInput('archiveId', archiveId);
    fixture.componentRef.setInput('audiobookSrc', source); fixture.detectChanges();
    if (load) { messages.next({data:tracks}); audio.metadata(); }
  }
  it('subscribes before requesting tracks and ignores duplicate replies', () => {
    request.and.callFake(() => messages.next({data:tracks}));
    create(false); audio.metadata(); audio.currentTime = 42;
    messages.next({data:tracks});
    expect(component.playlist.length).toBe(2);
    expect(audio.currentTime).toBe(42);
    expect(component.loading).toBeFalse();
  });
  it('closing saves exact position and releases audio, listeners, timers and subscriptions', () => {
    create(); audio.currentTime = 43.41;
    fixture.destroy();
    expect(JSON.parse(storage.get('ab_pos_'+hash(source))!).currentTime).toBe(43.41);
    expect(audio.paused).toBeTrue(); expect(audio.src).toBe(''); expect(audio.removed).toBeTrue();
    const report = JSON.parse(TestBed.inject(AudioDiagnosticsService).report);
    expect(report.active).toBe(0);
    expect(Object.values(report.resources)).toEqual([0,0,0,0]);
    messages.next({data:tracks}); expect(audio.src).toBe('');
  });
  it('switching books saves under the old identity and rejects late replies', () => {
    create(); audio.currentTime = 42;
    fixture.componentRef.setInput('audiobookSrc', source+'-next'); fixture.detectChanges();
    expect(JSON.parse(storage.get('ab_pos_'+hash(source))!).currentTime).toBe(42);
    expect(storage.has('ab_pos_'+hash(source+'-next'))).toBeFalse();
    expect(audio.src).toBe(''); expect(component.playlist.length).toBe(0);
    messages.next({data:tracks}); expect(component.playlist.length).toBe(0);
  });
  it('bounds metadata waiting and offers retry without a selected track', fakeAsync(() => {
    create(false);
    messages.next({data:[]});
    tick(15_001);
    expect(component.loading).toBeFalse(); expect(component.error).not.toBe('');
    component.retry(); expect(request).toHaveBeenCalledTimes(2);
    messages.next({data:tracks}); expect(component.loading).toBeFalse();
    fixture.destroy();
  }));
  it('accepts a correlated empty reply immediately and rejects replies from an earlier request', () => {
    create(false);
    const firstId = request.calls.mostRecent().args[1];
    component.retry();
    const secondId = request.calls.mostRecent().args[1];
    expect(secondId).not.toBe(firstId);
    messages.next({requestId:firstId, data:tracks});
    expect(component.loading).toBeTrue(); expect(component.playlist.length).toBe(0);
    messages.next({requestId:secondId, data:[], code:'AUDIO_UNAVAILABLE'});
    expect(component.loading).toBeFalse(); expect(component.error).not.toBe('');
  });
  it('distinguishes missing chapter metadata from a validated track without chapters', () => {
    create();
    expect(component.chapterStatus({...tracks[0], chapters:[], metadataStatus:'ready'})).toBe('Sin capitulos');
    expect(component.chapterStatus({...tracks[0], chapters:[], metadataStatus:'failed'})).toContain('No se pudieron');
    expect(component.chapterStatus({...tracks[0], chapters:[], metadataStatus:'processing'})).toBe('Metadata pendiente');
    expect(component.chapterStatus({...tracks[0], chapters:[]})).toBe('Capitulos no disponibles');
  });
  it('navigates chapter gaps in the correct direction', () => {
    create();
    component.currentTrack!.chapters = [
      {title:'One', startTimeInSeconds:0, endTimeInSeconds:10},
      {title:'Two', startTimeInSeconds:20, endTimeInSeconds:30},
      {title:'Three', startTimeInSeconds:40, endTimeInSeconds:50}
    ];
    component.currentTime = audio.currentTime = 35;
    expect(component.currentChapterIndex).toBe(-1);
    component.previousChapter(); expect(audio.currentTime).toBe(20);
    component.currentTime = audio.currentTime = 35;
    component.nextChapter(); expect(audio.currentTime).toBe(40);
  });
  it('expanding chapters does not play, and seeking across tracks preserves pause', () => {
    create(); audio.currentTime = 12;
    component.toggleChapters(component.playlist[1].src);
    expect(audio.currentTime).toBe(12); expect(component.currentTrackIndex).toBe(0);
    component.seekToChapter(1, component.playlist[1].chapters![0]); audio.metadata();
    expect(audio.currentTime).toBe(20); expect(audio.paused).toBeTrue();
  });
  it('restores valid preferences and persists new speed and volume without seeking', () => {
    storage.set('libretorio.audio.preferences.v1',JSON.stringify({rate:1.5, volume:.6, muted:true, continuous:false, repeat:true, remaining:true}));
    create(); audio.currentTime = 42;
    expect(component.preferredRate).toBe(1.5); expect(audio.playbackRate).toBe(1.5);
    expect(audio.volume).toBe(.6); expect(audio.muted).toBeTrue(); expect(component.isContinuous).toBeFalse();
    component.setRate({target:{value:'1.25'}} as unknown as Event);
    component.setVolume({target:{value:'0.4'}} as unknown as Event);
    expect(JSON.parse(storage.get('libretorio.audio.preferences.v1')!).rate).toBe(1.25);
    expect(audio.currentTime).toBe(42); expect(audio.paused).toBeTrue();
  });
  it('rejects malformed preferences without losing defaults', () => {
    storage.set('libretorio.audio.preferences.v1',JSON.stringify({rate:20,volume:-1,muted:'yes',continuous:0}));
    create(); expect(component.preferredRate).toBe(1); expect(component.volume).toBe(.25); expect(component.isContinuous).toBeTrue();
  });
  function readingPreferences(value: any) {
    const service = TestBed.inject(ReadingService);
    const tracker = {ready:false, restored:undefined, dispose:jasmine.createSpy('dispose'), capture:jasmine.createSpy('capture')};
    spyOn(service, 'begin').and.resolveTo(tracker as any);
    const settings = spyOn(service, 'settings').and.resolveTo(value);
    const save = spyOn(service, 'changeSettings');
    return {settings, save, tracker};
  }
  it('preserves local audio options when the server has no saved audio settings', fakeAsync(() => {
    storage.set('libretorio.audio.preferences.v1',JSON.stringify({rate:1.5,continuous:true,repeat:true,remaining:true}));
    const {save} = readingPreferences({});
    create(false, 1);messages.next({data:tracks});flushMicrotasks();audio.metadata();
    expect(component.preferredRate).toBe(1.5);expect(audio.playbackRate).toBe(1.5);
    expect(component.isContinuous).toBeTrue();expect(component.isRepeating).toBeTrue();expect(component.showRemaining).toBeTrue();
    expect(save).not.toHaveBeenCalled();fixture.destroy();
  }));
  it('preserves local audio options when the server preferences request fails', fakeAsync(() => {
    storage.set('libretorio.audio.preferences.v1',JSON.stringify({rate:1.25,continuous:true,repeat:true}));
    const {settings} = readingPreferences({});settings.and.rejectWith({status:0});
    create(false, 1);messages.next({data:tracks});flushMicrotasks();
    expect(component.preferredRate).toBe(1.25);expect(component.isContinuous).toBeTrue();expect(component.isRepeating).toBeTrue();
    fixture.destroy();
  }));
  it('persists options before audio metadata loads and patches only the changed option', fakeAsync(() => {
    const {save, tracker} = readingPreferences({rate:1.5,continuous:false,repeat:false,remaining:false});
    create(false, 1);messages.next({data:tracks});flushMicrotasks();
    expect(tracker.ready).toBeFalse();
    component.isContinuous = true;component.savePreferences('continuous');
    expect(save).toHaveBeenCalledOnceWith('audio',{continuous:true});
    expect(JSON.parse(storage.get('libretorio.audio.preferences.v1')!).continuous).toBeTrue();
    component.setVolume({target:{value:'0.4'}} as unknown as Event);
    component.toggleMute();expect(save).toHaveBeenCalledTimes(1);
    fixture.destroy();
  }));
  it('keeps a user change made during preference loading without losing the other server settings', fakeAsync(() => {
    const {settings, save} = readingPreferences({});
    let resolve!:(value:any)=>void;
    settings.and.returnValue(new Promise(done=>resolve=done));
    create(false, 1);messages.next({data:tracks});flushMicrotasks();
    component.isContinuous = true;component.savePreferences('continuous');
    expect(save).not.toHaveBeenCalled();
    resolve({rate:1.75,continuous:false,repeat:true,remaining:true});flushMicrotasks();
    expect(component.isContinuous).toBeTrue();expect(component.preferredRate).toBe(1.75);expect(component.isRepeating).toBeTrue();
    expect(save).toHaveBeenCalledOnceWith('audio',{continuous:true});
    audio.metadata();expect(audio.playbackRate).toBe(1.75);fixture.destroy();
  }));
  it('end-of-track advances, repeats only when selected and stops with continuous disabled', () => {
    create(); audio.dispatchEvent(new Event('ended')); expect(component.currentTrackIndex).toBe(1);
    audio.dispatchEvent(new Event('ended')); expect(component.currentTrackIndex).toBe(1);
    component.isRepeating = true; audio.dispatchEvent(new Event('ended')); expect(component.currentTrackIndex).toBe(0);
    component.isContinuous = false; audio.dispatchEvent(new Event('ended')); expect(component.currentTrackIndex).toBe(0);
  });
});
