import {Injectable, NgZone, OnDestroy, signal} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {finalize, Subscription, timeout} from 'rxjs';
import {StopPlayingService} from './stop-playing.service';

@Injectable({providedIn: 'root'})
export class SessionActivityService implements OnDestroy {
  readonly warning = signal('');
  private nextAttempt = 0;
  private pending?: Subscription;
  private inFlight = false;
  private stopped = false;

  constructor(private http: HttpClient, private stopPlaying: StopPlayingService, private zone: NgZone) {}

  reset(): void {
    this.pending?.unsubscribe();
    this.stopped = false;
    this.nextAttempt = 0;
    this.warning.set('');
  }

  renew(activity: 'audio' | 'interaction'): void {
    if (this.stopped || this.inFlight || Date.now() < this.nextAttempt) return;
    this.inFlight = true;
    this.nextAttempt = Date.now() + 60_000;
    this.zone.run(() => {
      this.pending = this.http.post('/api/session/activity', {activity}, {withCredentials: true})
        .pipe(timeout(10_000), finalize(() => this.inFlight = false))
        .subscribe({
          next: () => this.warning.set(''),
          error: error => {
            if (error.status === 401) {
              this.stopped = true;
              this.warning.set('La sesion ya no es valida. Vuelve a iniciar sesion.');
              this.stopPlaying.stopPlayingAudio();
            } else if (error.status === 404 || error.status === 405) {
              this.stopped = true;
              this.warning.set('El servidor requiere actualizarse para mantener la sesion durante la lectura o reproduccion.');
            } else {
              this.warning.set('No se pudo renovar la sesion. Se reintentara mientras continues usando la aplicacion.');
            }
          }
        });
    });
  }

  interact(event: Event, owner: Document): void {
    if (event.isTrusted && owner.visibilityState === 'visible') this.renew('interaction');
  }

  observe(target: HTMLElement | Document): () => void {
    const owner = target.ownerDocument ?? target as Document;
    const listener = (event: Event) => this.interact(event, owner);
    // Programmatic scroll/layout, mouse movement and visibility alone are not activity.
    const events = ['pointerdown', 'pointerup', 'keydown', 'wheel', 'touchmove'];
    this.zone.runOutsideAngular(() => {
      for (const name of events) target.addEventListener(name, listener, {capture: true, passive: true});
    });
    return () => { for (const name of events) target.removeEventListener(name, listener, true); };
  }

  stop(): void {
    this.stopped = true;
    this.pending?.unsubscribe();
  }

  ngOnDestroy(): void { this.stop(); }
}
