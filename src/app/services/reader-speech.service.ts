import {Injectable, InjectionToken, inject, NgZone, OnDestroy, signal} from '@angular/core';
import {Subscription} from 'rxjs';
import {prepareSpeechText, SpeechPlatform, SpeechReader} from '../core/speech-reader';
import {SessionActivityService} from './session-activity.service';
import {StopPlayingService} from './stop-playing.service';

export const SPEECH_PLATFORM = new InjectionToken<SpeechPlatform | undefined>('Speech synthesis', {providedIn:'root', factory: () =>
  typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined'
    ? {synth:speechSynthesis, utterance:SpeechSynthesisUtterance,
      // Chromium's Android implementation stops on pause; Resume() is a no-op.
      pauseMode: /Android/i.test(navigator.userAgent) ? 'restart-fragment' : 'native'} : undefined});

@Injectable({providedIn:'root'})
export class ReaderSpeechService implements OnDestroy {
  readonly platform = inject(SPEECH_PLATFORM);
  readonly voices = signal<SpeechSynthesisVoice[]>([]);
  readonly revision = signal(0);
  readonly reader?: SpeechReader;
  owner?: object;
  private subscription: Subscription;
  private reloadVoices = () => this.zone.run(() => this.voices.set(this.platform?.synth.getVoices() ?? []));
  private visibility = () => this.reader?.record('visibility-' + document.visibilityState);
  private leaving = () => this.stop();

  constructor(private zone: NgZone, private activity: SessionActivityService, private stopPlaying: StopPlayingService) {
    if (this.platform) {
      this.reader = new SpeechReader(this.platform,
        () => zone.run(() => this.revision.update(value => value + 1)),
        () => activity.renew('audio'));
      this.reloadVoices(); this.platform.synth.addEventListener('voiceschanged', this.reloadVoices);
      document.addEventListener('visibilitychange', this.visibility);
      window.addEventListener('pagehide', this.leaving);
    }
    this.subscription = stopPlaying.stopPlaying$.subscribe(stop => { if (stop) this.stop(); });
  }
  start(owner: object, text: string, voice: SpeechSynthesisVoice, rate: number, remoteAllowed: boolean): void {
    if (!this.reader || !voice || (!voice.localService && !remoteAllowed)) throw new Error('La voz no esta autorizada.');
    if (!text.trim() || text.length > 60_000 || !Number.isFinite(rate) || rate < .5 || rate > 2)
      throw new Error('Seleccion o velocidad no valida.');
    const prepared = prepareSpeechText(text);
    if (!prepared || prepared.length > 60_000) throw new Error('No hay texto valido para leer.');
    this.stopPlaying.stopPlayingAudio(); this.owner = owner;
    this.reader.start(prepared, voice, rate);
  }
  stop(owner?: object): void {
    if (owner && this.owner !== owner) return;
    this.reader?.stop(); this.owner = undefined;
  }
  ngOnDestroy(): void {
    this.stop(); this.subscription.unsubscribe();
    this.platform?.synth.removeEventListener('voiceschanged', this.reloadVoices);
    document.removeEventListener('visibilitychange', this.visibility); window.removeEventListener('pagehide', this.leaving);
  }
}
