import { Injectable, OnDestroy } from '@angular/core';
import { SessionActivityService } from './session-activity.service';

// One instance per player. Progress events renew the session, not an idle timer.
@Injectable()
export class PlaybackSessionService implements OnDestroy {
  readonly warning;
  private previousPosition?: number;
  private stopped = false;

  constructor(private activity: SessionActivityService) { this.warning = activity.warning; }

  progress(position: number, playing: boolean): void {
    const previous = this.previousPosition;
    this.previousPosition = playing && Number.isFinite(position) ? position : undefined;
    if (this.stopped || !playing || previous === undefined || !Number.isFinite(position) || position <= previous) return;
    this.activity.renew('audio');
  }

  ngOnDestroy(): void {
    this.stopped = true;
  }
}
