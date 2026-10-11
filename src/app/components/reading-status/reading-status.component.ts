import {Component,Input} from '@angular/core';
import {ReadingTracker} from '../../services/reading.service';

@Component({selector:'reading-status',template:`
  @if (tracker?.status() && tracker?.status() !== 'Posicion pendiente de sincronizar.') {
    <p class="small text-body-secondary m-1" role="status">{{tracker?.status()}}
      @if (tracker?.blocked) {
        <button class="btn btn-sm btn-outline-secondary ms-2" (click)="tracker?.useCurrentPosition()">Usar nueva posicion</button>
      }
    </p>
  }
  @if (warning) {<p class="small text-warning m-1" role="status">{{warning}}</p>}
`})
export class ReadingStatusComponent {
  @Input() tracker?:ReadingTracker;
  @Input() warning='';
}
