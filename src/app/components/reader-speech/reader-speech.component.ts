import {Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild} from '@angular/core';
import {ReaderSpeechService} from '../../services/reader-speech.service';
import {prepareSpeechText} from '../../core/speech-reader';

const PREFERENCES = 'libretorio:tts:preferences:v1';
@Component({selector:'reader-speech', templateUrl:'./reader-speech.component.html', styleUrl:'./reader-speech.component.scss'})
export class ReaderSpeechComponent implements OnChanges, OnDestroy {
  @Input() text = '';
  @Input() source = '';
  @ViewChild('panel') panel?: ElementRef<HTMLDialogElement>;
  snapshot = '';
  error = '';
  rate = 1;
  voiceId = '';
  remoteAllowed = false;
  languageId = '';
  voiceQuery = '';
  settingsOpen = false;
  private captured?: string;
  readonly owner = {};

  constructor(public speech: ReaderSpeechService) {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFERENCES) ?? '{}');
      if (Number.isFinite(saved.rate) && saved.rate >= .5 && saved.rate <= 2) this.rate = saved.rate;
      if (typeof saved.voiceId === 'string') this.voiceId = saved.voiceId;
      if (typeof saved.languageId === 'string') this.languageId = saved.languageId;
    } catch { /* Preferences are optional. */ }
  }
  get availableVoices() { return this.speech.voices().filter(voice => voice.localService || this.remoteAllowed); }
  private languageOf(voice: SpeechSynthesisVoice): string { return voice.lang.replaceAll('_', '-').split('-')[0].toLowerCase(); }
  get languages() {
    const names = new Intl.DisplayNames(['es'], {type: 'language'});
    return [...new Set(this.availableVoices.map(voice => this.languageOf(voice)))].map(id => {
      let label = id;
      try { label = names.of(id) ?? id; } catch { /* Keep unusual engine language codes visible. */ }
      return {id, label};
    }).sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }
  get language(): string {
    if (this.languageId) return this.languageId;
    const saved = this.availableVoices.find(v => this.key(v) === this.voiceId);
    if (saved) return this.languageOf(saved);
    return '';
  }
  get voices() { return this.availableVoices.filter(voice => this.languageOf(voice) === this.language)
    .sort((a,b) => a.name.localeCompare(b.name, 'es')); }
  get filteredVoices() {
    const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replaceAll('_','-').toLowerCase();
    const query = normalize(this.voiceQuery.trim());
    return this.voices.filter(voice => normalize(`${voice.name} ${voice.lang}`).includes(query));
  }
  key(voice: SpeechSynthesisVoice) { return JSON.stringify([voice.voiceURI, voice.name, voice.lang]); }
  get voice() {
    const voices = this.voices;
    return this.voiceId ? voices.find(v => this.key(v) === this.voiceId) : undefined;
  }
  get reader() { this.speech.revision(); return this.speech.owner === this.owner ? this.speech.reader : undefined; }
  get active() { return !!this.reader && ['starting','speaking','paused'].includes(this.reader.state); }
  get status(): string {
    const reader = this.reader;
    if (!reader || reader.state === 'idle') return '';
    if (reader.state === 'error') return `La lectura se interrumpio (${reader.error}).`;
    if (reader.state === 'done') return 'Lectura terminada';
    if (reader.pauseRequested && reader.state !== 'paused') return 'Pausa solicitada';
    if (reader.state === 'paused') return 'En pausa';
    if (reader.state === 'starting') return 'Iniciando voz...';
    return `Leyendo fragmento ${reader.index + 1} de ${reader.count}`;
  }
  capture(): void { this.captured = this.text; }
  open(): void {
    if (!this.active) {
      const selected = this.captured ?? this.text;
      this.snapshot = selected.length <= 60000 ? prepareSpeechText(selected) : selected.trim(); this.error = '';
    }
    this.settingsOpen = !this.voice;
    this.captured = undefined; this.panel?.nativeElement.showModal();
  }
  toggleSettings(event: Event): void { this.settingsOpen = (event.target as HTMLDetailsElement).open; }
  closePanel(): void { this.panel?.nativeElement.close(); }
  start(): void {
    if (!this.voice) return;
    this.error = '';
    try { this.speech.start(this.owner, this.snapshot, this.voice, this.rate, this.remoteAllowed); }
    catch (error) { this.error = error instanceof Error ? error.message : 'No se pudo iniciar la voz.'; }
  }
  pauseOrResume(): void {
    const reader = this.reader;
    if (reader?.pauseRequested) reader.resume(); else reader?.pause();
  }
  stop(): void { this.speech.stop(this.owner); }
  changeVoice(event: Event): void { this.voiceId = (event.target as HTMLSelectElement).value; this.save(); }
  changeLanguage(event: Event): void {
    this.languageId = (event.target as HTMLSelectElement).value; this.voiceId = ''; this.voiceQuery = ''; this.save();
  }
  searchVoices(event: Event): void { this.voiceQuery = (event.target as HTMLInputElement).value; }
  changeRate(event: Event): void { this.rate = Number((event.target as HTMLSelectElement).value); this.save(); }
  allowRemote(event: Event): void { this.remoteAllowed = (event.target as HTMLInputElement).checked; }
  private save(): void {
    try { localStorage.setItem(PREFERENCES, JSON.stringify({voiceId:this.voiceId, languageId:this.languageId, rate:this.rate})); } catch { /* Optional. */ }
  }
  exportDiagnostic(): void {
    const blob = new Blob([JSON.stringify({version:1, at:new Date().toISOString(), browser:navigator.userAgent,
      voice:this.voice ? {name:this.voice.name,lang:this.voice.lang,local:this.voice.localService} : null,
      rate:this.rate, characters:this.snapshot.length, state:this.reader?.state ?? 'idle', events:this.reader?.events ?? []},null,2)],
      {type:'application/json'});
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'libretorio-voz-diagnostico.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  ngOnChanges(changes: import('@angular/core').SimpleChanges): void {
    if (changes['source']) { this.stop(); this.snapshot = ''; this.captured = undefined; this.closePanel(); }
  }
  ngOnDestroy(): void { this.stop(); this.snapshot = ''; this.closePanel(); }
}
