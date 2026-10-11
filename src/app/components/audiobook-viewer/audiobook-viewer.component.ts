import { Component, ElementRef, HostListener, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, ViewChild, ChangeDetectionStrategy, DestroyRef, ChangeDetectorRef } from "@angular/core";
import { NgTemplateOutlet } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { BooksService } from "(src)/app/services/books.service";
import { AudioBookMetadata, hash } from "(src)/app/core/headers";
import { StopPlayingService } from "(src)/app/services/stop-playing.service";
import { audioTimeline, AudioTimeline, chapterAt, chapterBounds, ChapterPosition, formatAudioTime, restoredPosition } from "./audio-player.utils";
import { AudioDiagnosticsService } from "(src)/app/services/audio-diagnostics.service";
import { finalize } from "rxjs";
import { PlaybackSessionService } from "(src)/app/services/playback-session.service";
import {ReadingService,ReadingTracker} from '../../services/reading.service';
import {ReadingStatusComponent} from '../reading-status/reading-status.component';

type Track = AudioBookMetadata & {durationSeconds?: number; metadataStatus?: string; chapters?: ChapterPosition[]};
type AudioPreferences = {rate: number; continuous: boolean; repeat: boolean; remaining: boolean};

@Component({
  selector: "audiobook-viewer", imports: [NgTemplateOutlet,ReadingStatusComponent],
  providers: [PlaybackSessionService],
  templateUrl: "./audiobook-viewer.component.html",
  changeDetection: ChangeDetectionStrategy.Eager, styleUrl: "./audiobook-viewer.component.scss"
})
export class AudiobookViewerComponent implements OnChanges, OnInit, OnDestroy {
  @Input() audiobookSrc = "";
  @Input() archiveId?:number|string;
  progress?:ReadingTracker;
  historyWarning='';
  private historyEnabled?:boolean;
  private preferencesReady = false;
  private pendingPreferences: Partial<AudioPreferences> = {};
  playlist: Track[] = [];
  currentTrackIndex = 0;
  currentTrack?: Track;
  private readonly audio = new Audio();
  private diagnosticId: number;
  loading = true;
  error = "";
  mediaState = "idle";
  metadataMs = 0;
  private loadStarted = 0;
  private initialized = false;
  private closed = false;
  private pendingSeek?: number;
  private saveInterval?: ReturnType<typeof setInterval>;
  private metadataTimer?: ReturnType<typeof setTimeout>;
  private requestedSource = '';
  private awaitingTracks = false;
  private requestId = '';
  private loadGeneration = 0;
  isPlaying = false;
  isRepeating = false;
  isContinuous = true;
  currentTime = 0;
  duration = 0;
  private timelineGesture?: {range: AudioTimeline; value: number; kind: 'pointer' | 'keyboard' | 'input'; changed: boolean};
  preferredRate = 1;
  volume = 0.25;
  muted = false;
  activePanel: "speed" | "volume" | "settings" | null = null;
  panelBelow = false;
  panelMaxHeight = 320;
  private panelTrigger?: HTMLElement;
  private panelScrollHost?: Element;
  private readonly positionOnScroll = () => {
    if (this.activePanel) this.positionPanel(this.activePanel);
    this.changeDetector.markForCheck();
  };
  @ViewChild("secondaryControls") secondaryControls?: ElementRef<HTMLElement>;
  @ViewChild("trackList") trackList?: ElementRef<HTMLOListElement>;
  @ViewChild("controlPanel") set controlPanel(panel: ElementRef<HTMLElement> | undefined) {
    const element = panel?.nativeElement;
    (element?.querySelector<HTMLElement>('input:checked') ?? element?.querySelector<HTMLElement>('input'))?.focus({preventScroll: true});
  }
  showRemaining = false;
  readonly speeds = [0.75, 1, 1.25, 1.5, 1.75, 2];
  expandedTracks = new Set<string>();
  private readonly mobileLayoutQuery = '(max-width: 767.98px), (pointer: coarse) and (max-width: 1023.98px) and (max-height: 575.98px)';
  isMobileLayout = window.matchMedia(this.mobileLayoutQuery).matches;
  listExpanded = false;
  private listExpansionScroll?: {before: number; expanded: number};
  @ViewChild('expandListButton') expandListButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('collapseListButton') collapseListButton?: ElementRef<HTMLButtonElement>;
  formatTime = formatAudioTime;
  private readonly events = ["play", "playing", "pause", "waiting", "stalled", "error", "ended", "ratechange", "canplay", "loadedmetadata", "timeupdate", "seeked", "volumechange"];

  @ViewChild("mediaHost") set mediaHost(host: ElementRef<HTMLElement> | undefined) {
    if (host && !this.closed) host.nativeElement.appendChild(this.audio);
  }
  constructor(private booksService: BooksService, private stopPlayingService: StopPlayingService,
    private destroyRef: DestroyRef, private changeDetector: ChangeDetectorRef, public diagnostics: AudioDiagnosticsService,
    public playbackSession: PlaybackSessionService,public readingStore:ReadingService) {
    this.diagnosticId = diagnostics.open();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (this.initialized && changes["audiobookSrc"]) this.loadAudiobook();
  }
  ngOnInit() {
    this.restorePreferences();
    this.audio.preload = "metadata";
    this.audio.volume = this.volume;
    this.audio.muted = this.muted;
    for (const event of this.events) this.audio.addEventListener(event, this.syncMedia);
    this.diagnostics.resource('mediaListeners', this.events.length);
    this.diagnostics.resource('subscriptions', 2);
    this.booksService.audioBookIncomingMessage$.pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.diagnostics.resource('subscriptions', -1))).subscribe(message => {
      if (this.closed || !this.awaitingTracks) return;
      const files: Track[] = message.data ?? [];
      if (message.requestId !== undefined && message.requestId !== this.requestId) return;
      // Old servers cannot correlate empty replies. Nonempty replies must still match the requested path.
      if (!Array.isArray(files) || (!files.length && message.requestId === undefined) ||
        !files.every(file => typeof file?.src === 'string' &&
          (file.src === this.requestedSource || file.src.startsWith(this.requestedSource + "/")))) return;
      this.awaitingTracks = false;
      this.clearMetadataTimer();
      this.playlist = files.map(file => ({...file, src: this.publicSource(file.src)}));
      this.loading = false;
      if (!this.playlist.length) { this.error = "No hay pistas disponibles."; return; }
      if(this.archiveId!==undefined){void this.restoreReadingProgress(this.loadGeneration);return;}
      let saved;
      try { saved = restoredPosition(JSON.parse(localStorage.getItem(this.storageKey) || "null"), this.playlist); } catch { /* Optional storage. */ }
      this.selectTrack(saved?.index ?? 0, saved?.time ?? 0, false, false);
    });
    this.stopPlayingService.stopPlaying$.pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.diagnostics.resource('subscriptions', -1))).subscribe(stop => {
      if (stop) { this.savePosition(); this.audio.pause(); }
    });
    this.saveInterval = setInterval(() => { if (this.isPlaying) this.savePosition(); }, 10000);
    this.diagnostics.resource('timers', 1);
    this.initialized = true;
    this.loadAudiobook();
  }
  ngOnDestroy() {
    this.cancelTimelineSeek();
    this.closePanel(false);
    this.savePosition();
    this.progress?.dispose();this.progress=undefined;
    this.closed = true;
    this.clearMetadataTimer();
    clearInterval(this.saveInterval);
    if (this.saveInterval !== undefined) this.diagnostics.resource('timers', -1);
    for (const event of this.events) this.audio.removeEventListener(event, this.syncMedia);
    if (this.initialized) this.diagnostics.resource('mediaListeners', -this.events.length);
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    this.audio.remove();
    this.diagnostics.close(this.diagnosticId);
  }
  private loadAudiobook() {
    this.listExpanded = false;
    this.listExpansionScroll = undefined;
    this.preferencesReady = false;
    this.cancelTimelineSeek();
    this.loadGeneration++;
    this.savePosition();
    this.progress?.dispose();this.progress=undefined;
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.clearMetadataTimer();
    this.playlist = [];
    this.currentTrack = undefined;
    this.currentTrackIndex = 0;
    this.currentTime = this.duration = 0;
    this.pendingSeek = undefined;
    this.isPlaying = false;
    this.expandedTracks.clear();
    this.closePanel(false);
    this.requestedSource = this.audiobookSrc;
    this.requestId = crypto.randomUUID();
    this.awaitingTracks = !!this.requestedSource;
    if (!this.requestedSource) { this.loading = false; return; }
    this.loading = true;
    this.error = "";
    this.metadataTimer = setTimeout(() => {
      this.clearMetadataTimer();
      this.awaitingTracks = false;
      this.loading = false;
      this.error = 'No se pudieron cargar las pistas. Comprueba la conexion y vuelve a intentar.';
      this.changeDetector.markForCheck();
    }, 15_000);
    this.diagnostics.resource('timers', 1);
    this.booksService.getAudioBook(this.audiobookSrc, this.requestId);
  }
  private clearMetadataTimer() {
    if (this.metadataTimer === undefined) return;
    clearTimeout(this.metadataTimer);
    this.metadataTimer = undefined;
    this.diagnostics.resource('timers', -1);
  }
  private trackKey(track:Track):string {
    const src=decodeURIComponent(track.src),root=decodeURIComponent(this.publicSource(this.requestedSource));
    return src===root?src.split('/').at(-1)!:src.slice(root.length+1);
  }
  private async restoreReadingProgress(generation:number) {
    this.historyEnabled=undefined;this.historyWarning='';
    try {
      const progress=await this.readingStore.begin(this.archiveId,'audio');
      if(generation!==this.loadGeneration||this.closed){progress?.dispose(false);return;}
      this.progress=progress;
      this.historyEnabled=!!progress;
      if(!progress){
        let saved;
        try{saved=restoredPosition(JSON.parse(localStorage.getItem(this.storageKey)||'null'),this.playlist);}catch{}
        this.selectTrack(saved?.index??0,saved?.time??0,false,false);return;
      }
      const prefs=await this.readingStore.settings('audio').catch(()=>undefined);
      if(generation!==this.loadGeneration||this.closed)return;
      if (this.speeds.includes(prefs?.rate) && this.pendingPreferences.rate === undefined) this.preferredRate = prefs.rate;
      if (typeof prefs?.continuous === 'boolean' && this.pendingPreferences.continuous === undefined) this.isContinuous = prefs.continuous;
      if (typeof prefs?.repeat === 'boolean' && this.pendingPreferences.repeat === undefined) this.isRepeating = prefs.repeat;
      if (typeof prefs?.remaining === 'boolean' && this.pendingPreferences.remaining === undefined) this.showRemaining = prefs.remaining;
      this.preferencesReady = prefs !== undefined;
      this.savePreferences();
      const saved=progress?.restored,index=saved?.track?this.playlist.findIndex(track=>this.trackKey(track)===saved.track):0;
      if(index<0&&progress){progress.blocked=true;progress.status.set('La pista guardada no esta disponible.');}
      this.selectTrack(Math.max(0,index),index<0?0:saved?.seconds??0,false,false);
    }catch{if(generation===this.loadGeneration&&!this.closed){this.historyWarning='Historial no disponible. Puedes reproducir sin modificar el marcador.';this.selectTrack(0,0,false,false);}}
  }
  private publicSource(source: string): string {
    const relative = source.split("dist/public")[1] ?? source;
    return relative.split("/").map(segment => encodeURIComponent(segment)).join("/");
  }
  private syncMedia = (event: Event) => {
    if (this.closed) { this.diagnostics.record(this.diagnosticId, 'ignored-after-close'); return; }
    if (event.type !== 'timeupdate') this.diagnostics.record(this.diagnosticId, event.type, this.audio.currentTime);
    if (event.type === "loadedmetadata") {
      this.duration = Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
      this.metadataMs = Math.round(performance.now() - this.loadStarted);
      this.audio.playbackRate = this.preferredRate;
      if (this.pendingSeek !== undefined) {
        if(this.progress&&this.pendingSeek>this.duration){this.progress.blocked=true;this.progress.status.set('La posicion guardada supera la duracion de esta pista.');}
        this.audio.currentTime = Math.min(this.pendingSeek, this.duration);
        this.pendingSeek = undefined;
      }
      if(this.progress)this.progress.ready=true;
    }
    this.currentTime = this.audio.currentTime;
    if(event.type==='timeupdate'&&this.isPlaying)this.captureReadingProgress();
    this.isPlaying = !this.audio.paused && !this.audio.ended;
    if (event.type === 'timeupdate' || event.type === 'pause' || event.type === 'ended') {
      this.playbackSession.progress(this.audio.currentTime, this.isPlaying && !this.audio.seeking);
    }
    if (event.type === "ratechange" && this.audio.readyState >= 1) this.preferredRate = this.audio.playbackRate;
    if (event.type === "volumechange") { this.volume = this.audio.volume; this.muted = this.audio.muted; }
    if (!["timeupdate", "ratechange", "volumechange", "seeked"].includes(event.type)) this.mediaState = event.type;
    if (event.type === "error") this.error = "No se pudo reproducir esta pista. Puedes reintentar o elegir otra.";
    if (event.type === "pause" || event.type === "seeked") this.savePosition();
    if (event.type === "ended") { this.savePosition(); if (this.isContinuous) this.next(true); }
    this.changeDetector.markForCheck();
  };
  private play() {
    const generation = this.loadGeneration;
    this.audio.play().catch(() => {
      if (!this.closed && generation === this.loadGeneration) { this.error = "No se pudo iniciar el audio. Pulsa reproducir para reintentar."; this.changeDetector.markForCheck(); }
    });
  }
  togglePlayPause() { this.audio.paused ? this.play() : this.audio.pause(); }
  retry() {
    if (!this.currentTrack) this.loadAudiobook();
    else this.selectTrack(this.currentTrackIndex, this.currentTime, true);
  }
  selectTrack(index: number, time = 0, resume = this.isPlaying, save = true) {
    if (!this.playlist[index]) return;
    this.cancelTimelineSeek();
    this.loadGeneration++;
    if (save) this.savePosition();
    this.audio.pause();
    this.currentTrackIndex = index;
    this.currentTrack = this.playlist[index];
    this.diagnostics.record(this.diagnosticId, 'track-' + index, time);
    this.currentTime = 0;
    this.duration = this.currentTrack.durationSeconds ?? 0;
    this.pendingSeek = time;
    this.isPlaying = false;
    this.error = "";
    this.mediaState = "loading";
    this.loadStarted = performance.now();
    this.metadataMs = 0;
    this.audio.defaultPlaybackRate = this.preferredRate;
    this.audio.src = this.currentTrack.src;
    this.audio.load();
    if (resume) this.play();
  }
  get timeline() { return this.timelineGesture?.range ?? audioTimeline(this.currentTrack?.chapters, this.currentTime, this.duration); }
  get timelineTime() {
    const range = this.timeline;
    return this.timelineGesture?.value ?? Math.max(0, Math.min(this.currentTime - range.start, range.duration));
  }
  get timelineLabel() { return this.timeline.chapterIndex >= 0 ? 'Capítulo ' + (this.timeline.chapterIndex + 1) : 'Pista completa'; }
  chapterDuration(track: Track, chapter: ChapterPosition): string {
    const bounds = chapterBounds(chapter, track === this.currentTrack ? this.duration : track.durationSeconds);
    return bounds ? this.formatTime(bounds.end - bounds.start) : 'Duración no disponible';
  }
  private beginTimelineSeek(kind: 'pointer' | 'keyboard' | 'input') {
    if (!this.canSeek || this.timelineGesture) return;
    this.timelineGesture = {range: this.timeline, value: this.timelineTime, kind, changed: false};
  }
  startTimelinePointer(event: PointerEvent) {
    if (event.button !== 0 || !event.isPrimary || !this.canSeek) return;
    this.beginTimelineSeek('pointer');
    (event.target as HTMLInputElement).setPointerCapture(event.pointerId);
  }
  previewTimelineSeek(event: Event) {
    if (!this.canSeek) return;
    this.beginTimelineSeek('input');
    const value = Number((event.target as HTMLInputElement).value);
    if (this.timelineGesture && Number.isFinite(value)) {
      this.timelineGesture.value = Math.max(0, Math.min(value, this.timelineGesture.range.duration));
      this.timelineGesture.changed = true;
    }
  }
  changeTimelineSeek() {
    // Native change can arrive before pointerup; retain the frozen range until release.
    if (this.timelineGesture?.kind === 'input') this.finishTimelineSeek();
  }
  finishTimelineSeek() {
    const gesture = this.timelineGesture;
    this.cancelTimelineSeek();
    if (gesture?.changed) this.seekTo(gesture.range.start + gesture.value);
  }
  cancelTimelineSeek() { this.timelineGesture = undefined; }
  onTimelineKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      if (this.timelineGesture) { event.preventDefault(); event.stopPropagation(); this.cancelTimelineSeek(); }
      return;
    }
    if (!['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) return;
    event.preventDefault();
    if (!this.canSeek) return;
    this.beginTimelineSeek('keyboard');
    const gesture = this.timelineGesture!;
    if (gesture.kind !== 'keyboard') return;
    const step = event.key === 'PageUp' ? 10 : event.key === 'PageDown' ? -10 :
      event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : -1;
    gesture.value = event.key === 'Home' ? 0 : event.key === 'End' ? gesture.range.duration :
      Math.max(0, Math.min(gesture.value + step, gesture.range.duration));
    gesture.changed = true;
  }
  onTimelineKeyup(event: KeyboardEvent) {
    if (this.timelineGesture?.kind === 'keyboard' &&
      ['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) this.finishTimelineSeek();
  }
  seekBy(seconds: number) { this.seekTo(this.audio.currentTime + seconds); }
  private seekTo(time: number) {
    this.cancelTimelineSeek();
    if (!Number.isFinite(time) || this.audio.readyState < 1) return;
    this.audio.currentTime = Math.max(0, Math.min(time, this.duration));
    this.currentTime = this.audio.currentTime;
    this.savePosition();
  }
  seekToChapter(index: number, chapter: ChapterPosition) {
    if (index !== this.currentTrackIndex) this.selectTrack(index, chapter.startTimeInSeconds);
    else this.seekTo(chapter.startTimeInSeconds);
  }
  get currentChapterIndex() {
    const index = chapterAt(this.currentTrack?.chapters, this.currentTime);
    return index >= 0 ? index : audioTimeline(this.currentTrack?.chapters, this.currentTime, this.duration).chapterIndex;
  }
  get currentChapter() { return this.currentTrack?.chapters?.[this.currentChapterIndex]; }
  get hasChapters() { return !!this.currentTrack?.chapters?.length; }
  previousChapter() {
    const index = this.currentChapterIndex;
    const chapters = this.currentTrack?.chapters;
    if (!chapters?.length) return;
    const previous = index < 0 ? chapters.reduce((last, chapter, i) => chapter.startTimeInSeconds < this.currentTime ? i : last, 0) :
      index > 0 && this.currentTime - chapters[index].startTimeInSeconds <= 3 ? index - 1 : index;
    this.seekTo(chapters[previous].startTimeInSeconds);
  }
  nextChapter() {
    const next = this.currentTrack?.chapters?.find(chapter => chapter.startTimeInSeconds > this.currentTime);
    if (next) this.seekTo(next.startTimeInSeconds);
  }
  previous() { if (this.currentTrackIndex > 0) this.selectTrack(this.currentTrackIndex - 1); }
  next(resume = this.isPlaying) {
    if (this.currentTrackIndex + 1 < this.playlist.length) this.selectTrack(this.currentTrackIndex + 1, 0, resume);
    else if (this.isRepeating && this.playlist.length) this.selectTrack(0, 0, resume);
  }
  toggleChapters(src: string) {
    if (this.expandedTracks.has(src)) this.expandedTracks.delete(src);
    else this.expandedTracks.add(src);
  }
  get currentPlaybackStatus(): {label: string; icon: string} {
    if (this.error) return {label: 'Error de audio', icon: 'error_outline'};
    if (this.waiting) return {label: 'Cargando audio', icon: 'hourglass_empty'};
    if (this.mediaState === 'ended') return {label: 'Finalizada', icon: 'check'};
    return this.isPlaying ? {label: 'Reproduciendo', icon: 'volume_up'} : {label: 'En pausa', icon: 'pause'};
  }
  locateCurrent() {
    if (!this.currentTrack || !this.trackList) return;
    if (this.currentChapter) this.expandedTracks.add(this.currentTrack.src);
    this.changeDetector.detectChanges();
    const list = this.trackList.nativeElement;
    const target = list.querySelector<HTMLElement>('.current-chapter') ?? list.querySelector<HTMLElement>('.active-track .track-row');
    if (!target) return;
    // Scroll only the playlist, not the surrounding modal or page.
    const listBounds = list.getBoundingClientRect(), targetBounds = target.getBoundingClientRect();
    list.scrollTop += targetBounds.top - listBounds.top - (list.clientHeight - targetBounds.height) / 2;
  }
  setListExpanded(expanded: boolean) {
    if (!this.isMobileLayout || this.listExpanded === expanded) return;
    const list = this.trackList?.nativeElement;
    let scrollTop = list?.scrollTop ?? 0;
    // A taller list can clamp scrollTop near its end without any user scrolling.
    if (!expanded && this.listExpansionScroll && Math.abs(scrollTop - this.listExpansionScroll.expanded) < 1) {
      scrollTop = this.listExpansionScroll.before;
    }
    this.cancelTimelineSeek();
    this.closePanel(false);
    this.listExpanded = expanded;
    // Keep the same list and audio nodes; only their layout changes.
    this.changeDetector.detectChanges();
    if (list) list.scrollTop = scrollTop;
    this.listExpansionScroll = expanded ? {before: scrollTop, expanded: list?.scrollTop ?? 0} : undefined;
    (expanded ? this.collapseListButton : this.expandListButton)?.nativeElement.focus({preventScroll: true});
  }
  onPlayerKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !this.listExpanded || this.activePanel) return;
    event.preventDefault();
    event.stopPropagation();
    this.setListExpanded(false);
  }
  setRate(event: Event) {
    const rate = Number((event.target as HTMLSelectElement).value);
    if (!this.speeds.includes(rate)) return;
    this.preferredRate = rate;
    this.audio.defaultPlaybackRate = rate;
    this.audio.playbackRate = rate;
    this.savePreferences('rate');
  }
  togglePanel(panel: "speed" | "volume" | "settings", event: Event) {
    if (this.activePanel === panel) { this.closePanel(); return; }
    this.closePanel(false);
    this.panelTrigger = event.currentTarget as HTMLElement;
    this.panelScrollHost = this.secondaryControls?.nativeElement.closest?.('.modal-body') ?? undefined;
    this.positionPanel(panel);
    this.panelScrollHost?.addEventListener('scroll', this.positionOnScroll, {passive: true});
    if (this.panelScrollHost) this.diagnostics.resource('panelListeners', 1);
    this.activePanel = panel;
  }
  private positionPanel(panel: "speed" | "volume" | "settings") {
    const controls = this.secondaryControls?.nativeElement;
    if (controls?.getBoundingClientRect) {
      const row = controls.getBoundingClientRect();
      const bounds = this.panelScrollHost?.getBoundingClientRect();
      const above = Math.max(0, row.top - Math.max(0, bounds?.top ?? 0) - 16);
      const below = Math.max(0, Math.min(window.innerHeight, bounds?.bottom ?? window.innerHeight) - row.bottom - 16);
      const height = panel === 'speed' ? 210 : panel === 'volume' ? 114 : 158;
      this.panelBelow = above < height && below > above;
      this.panelMaxHeight = this.panelBelow ? below : above;
    }
  }
  closePanel(restoreFocus = true) {
    this.activePanel = null;
    this.panelScrollHost?.removeEventListener('scroll', this.positionOnScroll);
    if (this.panelScrollHost) this.diagnostics.resource('panelListeners', -1);
    this.panelScrollHost = undefined;
    if (restoreFocus) this.panelTrigger?.focus();
  }
  @HostListener("window:resize")
  onResize() {
    this.closePanel(false);
    this.isMobileLayout = window.matchMedia(this.mobileLayoutQuery).matches;
    if (!this.isMobileLayout) {
      this.listExpanded = false;
      this.listExpansionScroll = undefined;
    }
  }
  onPanelKeydown(event: KeyboardEvent) {
    if (event.key !== "Escape" || !this.activePanel) return;
    event.preventDefault();
    event.stopPropagation();
    this.closePanel();
  }
  onControlsFocusout(event: FocusEvent) {
    if (!this.secondaryControls?.nativeElement.contains(event.relatedTarget as Node | null)) this.closePanel(false);
  }
  @HostListener("document:pointerdown", ["$event"])
  onOutsidePointer(event: PointerEvent) {
    if (this.activePanel && !this.secondaryControls?.nativeElement.contains(event.target as Node)) this.closePanel(false);
  }
  toggleMute() { this.audio.muted = !this.audio.muted; this.muted = this.audio.muted; this.savePreferences(); }
  setVolume(event: Event) {
    const volume = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(volume) || volume < 0 || volume > 1) return;
    this.audio.volume = volume;
    this.volume = volume;
    if (volume > 0) { this.audio.muted = false; this.muted = false; }
    this.savePreferences();
  }
  get volumePercent() { return Math.round(this.volume * 100); }
  trackTitle(title: string) { return title.replace(/\.(mp3|m4a|m4b|wav|flac|ogg)$/i, "").replace(/_/g, " "); }
  get canSeek() { return !!this.currentTrack && this.audio.readyState >= 1 && this.duration > 0; }
  get waiting() { return ["loading", "waiting", "stalled"].includes(this.mediaState); }
  chapterStatus(track?: Track) {
    if (!track) return '';
    if (track.chapters?.length) return 'Entre capitulos';
    switch (track.metadataStatus) {
      case 'ready': case 'needs_review': return 'Sin capitulos';
      case 'pending': case 'processing': case 'stale': return 'Metadata pendiente';
      case 'failed': return 'No se pudieron obtener los capitulos';
      default: return 'Capitulos no disponibles';
    }
  }
  get storageKey() { return "ab_pos_" + hash(this.requestedSource || this.audiobookSrc); }
  savePreferences(changed?: keyof AudioPreferences) {
    const preferences: AudioPreferences = {rate:this.preferredRate,continuous:this.isContinuous,repeat:this.isRepeating,remaining:this.showRemaining};
    if (changed) Object.assign(this.pendingPreferences, {[changed]: preferences[changed]});
    // Preferences depend on their server revision, never on the audio or progress readiness.
    if (this.preferencesReady && Object.keys(this.pendingPreferences).length) {
      this.readingStore.changeSettings('audio', {...this.pendingPreferences});
      this.pendingPreferences = {};
    }
    try {
      localStorage.setItem('libretorio.audio.preferences.v1', JSON.stringify({
        rate: this.preferredRate, volume: this.volume, muted: this.muted,
        continuous: this.isContinuous, repeat: this.isRepeating, remaining: this.showRemaining
      }));
    } catch { /* Preferences are optional when storage is unavailable. */ }
  }
  private restorePreferences() {
    try {
      const value = JSON.parse(localStorage.getItem('libretorio.audio.preferences.v1') || 'null');
      if (!value || typeof value !== 'object') return;
      if (this.speeds.includes(value.rate)) this.preferredRate = value.rate;
      if (Number.isFinite(value.volume) && value.volume >= 0 && value.volume <= 1) this.volume = value.volume;
      if (typeof value.muted === 'boolean') this.muted = value.muted;
      if (typeof value.continuous === 'boolean') this.isContinuous = value.continuous;
      if (typeof value.repeat === 'boolean') this.isRepeating = value.repeat;
      if (typeof value.remaining === 'boolean') this.showRemaining = value.remaining;
    } catch { /* Keep defaults for corrupt or unavailable browser storage. */ }
  }
  private savePosition() {
    if (!this.audiobookSrc || !this.currentTrack || this.pendingSeek !== undefined) return;
    if(this.archiveId!==undefined&&this.historyEnabled!==false){this.captureReadingProgress(true);return;}
    try {
      localStorage.setItem(this.storageKey, JSON.stringify({src: this.currentTrack.src,
        trackIndex: this.currentTrackIndex, currentTime: this.audio.currentTime}));
    } catch { /* Playback remains available when browser storage is disabled. */ }
  }
  private captureReadingProgress(immediate=false) {
    if(this.currentTrack&&this.pendingSeek===undefined&&this.audio.readyState>=1)this.progress?.capture({version:1,track:this.trackKey(this.currentTrack),seconds:this.audio.currentTime},immediate);
  }
}
