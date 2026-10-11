import {ComponentFixture, TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {Subject} from 'rxjs';
import {AudiobookViewerComponent} from './audiobook-viewer.component';
import {BooksService} from '../../services/books.service';

describe('Chapter timeline with the real player template', () => {
  let fixture: ComponentFixture<AudiobookViewerComponent>;
  let component: AudiobookViewerComponent;
  let audio: HTMLAudioElement;
  let position: number;
  let writes: number[];
  let storage: Map<string, string>;
  const source = '/timeline-test';

  beforeEach(async () => {
    position = 0; writes = []; storage = new Map();
    audio = document.createElement('audio');
    Object.defineProperties(audio, {
      duration: {get: () => 100}, readyState: {get: () => 1},
      currentTime: {get: () => position, set: (value: number) => { position = value; writes.push(value); }}
    });
    spyOn(audio, 'load'); spyOn(audio, 'pause');
    spyOn(window, 'Audio').and.returnValue(audio);
    spyOn(Storage.prototype, 'getItem').and.callFake(key => storage.get(key) ?? null);
    spyOn(Storage.prototype, 'setItem').and.callFake((key, value) => storage.set(key, value));
    const messages = new Subject<any>();
    await TestBed.configureTestingModule({imports: [AudiobookViewerComponent], providers: [
      provideHttpClient(), {provide: BooksService, useValue: {audioBookIncomingMessage$: messages, getAudioBook() {}}}
    ]}).compileComponents();
    fixture = TestBed.createComponent(AudiobookViewerComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('audiobookSrc', source);
    fixture.detectChanges();
    messages.next({data: [{title:'A.m4a', src:source+'/A.m4a', type:'audio/mp4', length:'1:40', durationSeconds:100,
      chapters: [{title:'One', startTimeInSeconds:0, endTimeInSeconds:20.5},
        {title:'Two', startTimeInSeconds:20.5, endTimeInSeconds:80},
        {title:'Last', startTimeInSeconds:85, endTimeInSeconds:100}]}]});
    audio.dispatchEvent(new Event('loadedmetadata'));
    fixture.detectChanges(); writes = [];
  });
  afterEach(() => fixture.destroy());
  function slider(): HTMLInputElement { return fixture.nativeElement.querySelector('.timeline input'); }
  function at(time: number) { position = time; audio.dispatchEvent(new Event('timeupdate')); fixture.detectChanges(); }
  function input(value: number) { slider().value = String(value); slider().dispatchEvent(new Event('input')); fixture.detectChanges(); }
  function pointerDown(pointerType = 'mouse') {
    spyOn(slider(), 'setPointerCapture');
    slider().dispatchEvent(new PointerEvent('pointerdown', {pointerId:1, isPrimary:true, button:0, pointerType}));
  }
  function release() { slider().dispatchEvent(new PointerEvent('pointerup')); fixture.detectChanges(); }
  function key(type: 'keydown' | 'keyup', key: string) { slider().dispatchEvent(new KeyboardEvent(type, {key, bubbles:true})); fixture.detectChanges(); }

  it('shows chapter-relative time, duration, remaining time and whole-file duration only in the track row', () => {
    at(30.5);
    expect(slider().max).toBe('59.5'); expect(slider().value).toBe('10');
    expect(slider().getAttribute('aria-valuetext')).toBe('0:10 de 0:59, Capítulo 2');
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('.time-row time')!.textContent).toBe('0:10');
    expect(root.querySelector('.time-toggle')!.textContent).toBe('0:59');
    (root.querySelector('.time-toggle') as HTMLButtonElement).click(); fixture.detectChanges();
    expect(root.querySelector('.time-toggle')!.textContent).toBe('-0:49');
    expect(root.querySelector('.track-meta')!.textContent).toContain('1:40');
    expect(Array.from(root.querySelectorAll('.chapter-row time')).map(node => node.textContent)).toEqual(['0:20','0:59','0:15']);
  });
  for (const pointerType of ['mouse', 'touch']) {
    it(`previews ${pointerType} dragging on a frozen chapter and performs only one absolute seek on release`, () => {
      at(10); pointerDown(pointerType); input(15); input(20.5);
      slider().dispatchEvent(new Event('change'));
      expect(writes).toEqual([]); expect(position).toBe(10);
      at(25);
      expect(slider().max).toBe('20.5'); expect(slider().value).toBe('20.5');
      expect(component.timelineLabel).toBe('Capítulo 1');
      release();
      expect(writes).toEqual([20.5]); expect(component.timeline.chapterIndex).toBe(1);
      expect(slider().value).toBe('0'); expect(slider().max).toBe('59.5');
      expect(JSON.parse(storage.get(component.storageKey)!).currentTime).toBe(20.5);
      slider().dispatchEvent(new Event('change')); expect(writes).toEqual([20.5]);
    });
  }
  it('supports keyboard increments, Home and exact fractional End without seeking repeatedly while held', () => {
    at(30.5); key('keydown', 'ArrowRight'); key('keydown', 'ArrowRight');
    expect(writes).toEqual([]); expect(slider().value).toBe('12');
    key('keyup', 'ArrowRight'); expect(position).toBe(32.5);
    key('keydown', 'Home'); key('keyup', 'Home'); expect(position).toBe(20.5);
    at(10); key('keydown', 'End'); key('keyup', 'End'); expect(position).toBe(20.5);
    key('keydown', 'PageUp'); key('keyup', 'PageUp'); expect(position).toBe(30.5);
  });
  it('accepts input/change from assistive controls without pointer or keyboard events', () => {
    at(30); input(12);
    slider().dispatchEvent(new Event('change')); fixture.detectChanges();
    expect(position).toBe(32.5);
  });
  it('cancels interrupted gestures without seeking or saving the preview', () => {
    at(30); pointerDown(); input(50);
    slider().dispatchEvent(new PointerEvent('pointercancel')); fixture.detectChanges(); release();
    expect(writes).toEqual([]); expect(component.timelineTime).toBe(9.5);
    key('keydown', 'End'); key('keydown', 'Escape'); key('keyup', 'End');
    expect(writes).toEqual([]);
    key('keydown', 'Home'); slider().dispatchEvent(new FocusEvent('blur')); key('keyup', 'Home');
    expect(writes).toEqual([]);
  });
  it('keeps absolute skip buttons, chapter selection and gap fallback intact', () => {
    at(15); component.seekBy(10); fixture.detectChanges();
    expect(position).toBe(25); expect(component.timelineTime).toBe(4.5);
    component.seekBy(-10); expect(position).toBe(15);
    component.seekToChapter(0, component.currentTrack!.chapters![1]); expect(position).toBe(20.5);
    at(82); expect(slider().max).toBe('100'); expect(component.timelineLabel).toBe('Pista completa');
    at(85); expect(slider().max).toBe('15'); expect(slider().value).toBe('0');
    at(100); expect(slider().max).toBe('15'); expect(slider().value).toBe('15');
    expect(component.currentChapterIndex).toBe(2);
  });
  it('uses the file timeline without chapters or valid ends, without inventing durations', () => {
    component.currentTrack!.chapters = [{title:'Unknown end', startTimeInSeconds:0}]; at(30);
    expect(slider().max).toBe('100');
    expect(fixture.nativeElement.querySelector('.chapter-row time').textContent).toBe('Duración no disponible');
    component.currentTrack!.chapters = []; at(40);
    expect(slider().value).toBe('40'); expect(component.timelineLabel).toBe('Pista completa');
    input(60); slider().dispatchEvent(new Event('change')); expect(position).toBe(60);
  });
  it('cancels stale previews when a track changes and preserves the saved absolute position', () => {
    at(30); pointerDown(); input(50);
    component.selectTrack(0, 30, false); audio.dispatchEvent(new Event('loadedmetadata')); fixture.detectChanges();
    writes = []; release(); expect(writes).toEqual([]); expect(position).toBe(30);
    expect(component.timelineTime).toBe(9.5);
    expect(JSON.parse(storage.get(component.storageKey)!).currentTime).toBe(30);
  });
  it('keeps media time independent of playback speed and never persists an abandoned preview', () => {
    at(30.5);
    component.setRate({target:{value:'1.5'}} as unknown as Event);
    expect(component.timelineTime).toBe(10); expect(component.timeline.duration).toBe(59.5);
    pointerDown(); input(50); fixture.destroy();
    expect(JSON.parse(storage.get(component.storageKey)!).currentTime).toBe(30.5);
    expect(writes).toEqual([]);
  });
});
