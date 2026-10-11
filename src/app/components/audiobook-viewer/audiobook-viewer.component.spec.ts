import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AudiobookViewerComponent } from './audiobook-viewer.component';
import { provideHttpClient } from '@angular/common/http';

describe('AudiobookViewerComponent', () => {
  let component: AudiobookViewerComponent;
  let fixture: ComponentFixture<AudiobookViewerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AudiobookViewerComponent], providers: [provideHttpClient()]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AudiobookViewerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('expands and restores the same list and audio without restarting playback', () => {
    component.isMobileLayout = true;
    component.loading = false;
    component.playlist = Array.from({length: 40}, (_, i) => ({title: `Pista ${i}`, src: `test-${i}`, type: 'audio/mp4', length: '2:00'}));
    component.currentTrack = component.playlist[0];
    component.currentTime = 42;
    component.duration = 120;
    component.isPlaying = true;
    const host: HTMLElement = fixture.nativeElement;
    host.style.height = '780px';
    fixture.detectChanges();
    const audio = host.querySelector('audio')!;
    const list = host.querySelector<HTMLElement>('.tracks')!;
    const pause = spyOn(audio, 'pause');
    const play = spyOn(audio, 'play').and.resolveTo();
    const load = spyOn(audio, 'load');
    list.scrollTop = 100;
    component.setListExpanded(true);
    expect(component.listExpanded).toBeTrue();
    expect(host.querySelector('audio')).toBe(audio);
    expect(host.querySelector('.tracks')).toBe(list);
    expect(list.scrollTop).toBe(100);
    expect(document.activeElement).toBe(host.querySelector('[aria-label="Volver al reproductor"]'));
    list.scrollTop = 140;
    component.setListExpanded(false);
    expect(list.scrollTop).toBe(140);
    expect(document.activeElement).toBe(host.querySelector('[aria-label="Ampliar pistas y capítulos"]'));
    expect(component.currentTime).toBe(42);
    expect(component.isPlaying).toBeTrue();
    expect(pause).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });

  it('does not expose expanded-list controls on desktop and resets on returning to desktop', () => {
    component.isMobileLayout = false;
    component.setListExpanded(true);
    fixture.detectChanges();
    expect(component.listExpanded).toBeFalse();
    expect(fixture.nativeElement.querySelector('[aria-label="Ampliar pistas y capítulos"]')).toBeNull();
    component.isMobileLayout = true;
    component.setListExpanded(true);
    spyOn(window, 'matchMedia').and.returnValue({matches: false} as MediaQueryList);
    component.onResize();
    fixture.detectChanges();
    expect(component.isMobileLayout).toBeFalse();
    expect(component.listExpanded).toBeFalse();
    expect(fixture.nativeElement.querySelector('.mini-player')).toBeNull();
  });

  it('Escape returns from the expanded list without closing the surrounding reader', () => {
    component.isMobileLayout = true;
    component.setListExpanded(true);
    const event = new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true});
    const stop = spyOn(event, 'stopPropagation');
    component.onPlayerKeydown(event);
    expect(component.listExpanded).toBeFalse();
    expect(event.defaultPrevented).toBeTrue();
    expect(stop).toHaveBeenCalled();
  });

  it('shows diagnostics once, inside settings on mobile and below the list on desktop', () => {
    component.isMobileLayout = true;
    component.activePanel = 'settings';
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelectorAll('.lab-options').length).toBe(1);
    expect(host.querySelector('.control-panel .lab-options')).not.toBeNull();
    component.isMobileLayout = false;
    fixture.detectChanges();
    expect(host.querySelectorAll('.lab-options').length).toBe(1);
    expect(host.querySelector('.audio-player > .lab-options')).not.toBeNull();
  });

  it('keeps a unique current track and chapter through play, pause and progress changes', () => {
    component.playlist = Array.from({length: 3}, (_, i) => ({title: `Pista ${i}`, src: `test-${i}`, type: 'audio/mp4', length: '2:00',
      chapters: [{title: 'Uno', startTimeInSeconds: 0, endTimeInSeconds: 60}, {title: 'Dos', startTimeInSeconds: 60, endTimeInSeconds: 120}]}));
    component.currentTrackIndex = 1;
    component.currentTrack = component.playlist[1];
    component.duration = 120;
    component.currentTime = 65;
    component.expandedTracks.add('test-1');
    component.isPlaying = true;
    component.mediaState = 'playing';
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelectorAll('.active-track').length).toBe(1);
    expect(host.querySelector('.active-track .current-label')?.textContent).toContain('Reproduciendo');
    expect(host.querySelectorAll('.current-chapter').length).toBe(1);
    expect(host.querySelector('.current-chapter')?.textContent).toContain('Dos');
    component.isPlaying = false;
    component.mediaState = 'pause';
    fixture.detectChanges();
    expect(host.querySelector('.active-track .current-label')?.textContent).toContain('En pausa');
    expect(host.querySelector('.current-chapter .current-label')?.textContent).toContain('En pausa');
    component.currentTime = 10;
    fixture.detectChanges();
    expect(host.querySelector('.current-chapter')?.textContent).toContain('Uno');
    component.currentTrackIndex = 2;
    component.currentTrack = component.playlist[2];
    fixture.detectChanges();
    expect(host.querySelectorAll('.active-track').length).toBe(1);
    expect(host.querySelector('.active-track .track-title')?.textContent).toContain('Pista 2');
    expect(host.querySelector('.current-chapter')?.closest('.active-track')).toBeTruthy();
  });

  it('does not report playback while buffering or after a playback error', () => {
    component.isPlaying = true;
    component.mediaState = 'waiting';
    expect(component.currentPlaybackStatus.label).toBe('Cargando audio');
    component.error = 'Error';
    expect(component.currentPlaybackStatus.label).toBe('Error de audio');
  });

  for (const width of [390, 1100]) {
    it(`keeps many tracks and expanded chapters inside the available height at ${width}px`, async () => {
      // Ligature text is wider than the final icons while the font is loading.
      await document.fonts.load('24px "Material Icons"');
      const host: HTMLElement = fixture.nativeElement;
      host.style.width = `${width}px`;
      host.style.height = '780px';
      host.style.flex = 'none';
      component.loading = false;
      component.playlist = Array.from({length: 80}, (_, i) => ({
        title: `Pista ${i + 1}`, src: `test-${i}`, type: 'audio/mp4', length: '1:00:00',
        chapters: Array.from({length: 40}, (_, c) => ({title: `Capitulo ${c + 1}`, startTimeInSeconds: c * 60, endTimeInSeconds: (c + 1) * 60}))
      }));
      component.currentTrack = component.playlist[0];
      fixture.detectChanges();
      const tracks: HTMLElement = host.querySelector('.tracks')!;
      const transport: HTMLElement = host.querySelector('.transport')!;
      const initialHeight = tracks.clientHeight;
      const controlsTop = transport.getBoundingClientRect().top;
      component.expandedTracks.add('test-0');
      fixture.detectChanges();
      expect(tracks.clientHeight).toBe(initialHeight);
      expect(tracks.scrollHeight).toBeGreaterThan(tracks.clientHeight);
      expect(tracks.getBoundingClientRect().bottom).toBeLessThanOrEqual(host.getBoundingClientRect().bottom);
      tracks.scrollTop = tracks.scrollHeight;
      expect(tracks.scrollTop).toBeGreaterThan(0);
      expect(transport.getBoundingClientRect().top).toBe(controlsTop);
      expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth);
      component.currentTime = 30 * 60;
      component.duration = 40 * 60;
      component.expandedTracks.clear();
      fixture.detectChanges();
      const hostScroll = host.scrollTop;
      component.locateCurrent();
      expect(component.expandedTracks.has('test-0')).toBeTrue();
      const chapter: HTMLElement = host.querySelector('.current-chapter')!;
      expect(chapter.getBoundingClientRect().top).toBeGreaterThanOrEqual(tracks.getBoundingClientRect().top);
      expect(chapter.getBoundingClientRect().bottom).toBeLessThanOrEqual(tracks.getBoundingClientRect().bottom);
      expect(host.scrollTop).toBe(hostScroll);
      component.currentTrack = {...component.playlist[0], chapters: []};
      component.playlist[0] = component.currentTrack;
      fixture.detectChanges();
      component.locateCurrent();
      expect(tracks.scrollTop).toBe(0);
    });
  }

  it('loads the local icon font and renders a glyph rather than the ligature text', async () => {
    const fonts = await document.fonts.load('24px "Material Icons"');
    expect(fonts.length).toBeGreaterThan(0);
    const icon: HTMLElement = fixture.nativeElement.querySelector('.material-icons');
    expect(getComputedStyle(icon).fontFamily).toContain('Material Icons');
    expect(icon.getBoundingClientRect().width).toBeLessThanOrEqual(25);
  });
});
