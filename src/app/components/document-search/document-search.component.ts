import {Component,Input,Output,EventEmitter,ViewChild,ElementRef,OnDestroy,ChangeDetectionStrategy,TemplateRef} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {DocumentHit,DocumentSearch} from '../../core/document-search';
@Component({selector:'document-search',imports:[FormsModule],changeDetection:ChangeDetectionStrategy.Eager,
  template:`<button class="tool" type="button" title="Buscar en el documento" aria-label="Buscar en el documento" [disabled]="!search" (click)="open()"><i class="bi bi-search" aria-hidden="true"></i></button>
    <dialog #dialog aria-label="Buscar en el documento" (cancel)="search?.cancel()">
      <header><h2>Buscar en el documento</h2><button class="tool" title="Cerrar busqueda" aria-label="Cerrar busqueda" (click)="close()"><i class="bi bi-x-lg" aria-hidden="true"></i></button></header>
      <form (ngSubmit)="start()"><input name="query" aria-label="Texto en el documento" type="search" [(ngModel)]="query" maxlength="128" autofocus><button class="tool" title="Buscar" aria-label="Buscar" [disabled]="!query.trim()"><i class="bi bi-search" aria-hidden="true"></i></button></form>
      @if(search;as state){<p role="status">{{state.error|| (state.busy?'Buscando...':state.done?'Recorrido completo':state.query?'Recorrido parcial':'')}}</p>
        <ul>@for(hit of state.hits;track $index){<li><button (click)="choose(hit,$index)"><strong>{{hit.label}}</strong><span>{{hit.excerpt}}</span></button></li>}</ul>
        @if(state.done&&!state.hits.length){<p>Sin mas coincidencias.</p>}
        <footer>@if(state.busy){<button (click)="state.cancel()">Detener</button>}@else if(state.query&&!state.done){<button (click)="more()">{{state.error?'Reintentar':'Siguiente tramo'}}</button>}</footer>
      }
    </dialog>
    <ng-template #controls>@if(active){<div class="match-nav" aria-label="Coincidencias">
      <button class="tool" title="Anterior coincidencia del tramo" aria-label="Anterior coincidencia" [disabled]="index<=0" (click)="step(-1)"><i class="bi bi-chevron-up" aria-hidden="true"></i></button>
      <button title="Ver resultados" (click)="open()">{{index+1}} / {{search?.hits?.length}}</button>
      <button class="tool" title="Siguiente coincidencia del tramo" aria-label="Siguiente coincidencia" [disabled]="index+1>=(search?.hits?.length??0)" (click)="step(1)"><i class="bi bi-chevron-down" aria-hidden="true"></i></button>
      <button class="tool" title="Cerrar resultados" aria-label="Cerrar resultados" (click)="dismiss()"><i class="bi bi-x-lg" aria-hidden="true"></i></button>
    </div>}</ng-template>`,
  styles:[`
    :host{display:inline-flex;align-items:center}
    .tool{width:44px;height:44px;flex:none;border:0;border-radius:4px;background:none;color:inherit;font-size:20px}.tool:disabled{opacity:.4}
    dialog{color:var(--bs-body-color);background:var(--bs-body-bg);border:1px solid var(--bs-border-color);border-radius:6px;width:min(520px,calc(100vw - 16px));max-height:80dvh;padding:16px}dialog::backdrop{background:#0006}
    header,form,footer{display:flex;align-items:center;gap:8px}header h2{font-size:18px;margin:0;flex:1}
    form input{min-width:0;flex:1;height:44px;background:var(--bs-tertiary-bg);color:inherit;border:1px solid var(--bs-border-color);padding:8px}
    ul{list-style:none;padding:0;margin:0;max-height:45dvh;overflow:auto}
    li button{display:block;text-align:start;width:100%;padding:12px 0;background:none;color:inherit;border:0;border-bottom:1px solid var(--bs-border-color)}li span{display:block;overflow-wrap:anywhere}footer button{min-height:44px}
    .match-nav{display:flex;flex:none;align-items:center;justify-content:flex-end;background:var(--bs-body-bg);border-bottom:1px solid var(--bs-border-color);min-height:44px;width:100%}
    .match-nav>button:not(.tool){background:none;color:inherit;border:0;min-height:44px}
  `]})
export class DocumentSearchComponent implements OnDestroy {
  @Input() search?:DocumentSearch;@Output() selected=new EventEmitter<DocumentHit>();@Output() cleared=new EventEmitter<void>();
  @ViewChild('dialog',{static:true}) dialog!:ElementRef<HTMLDialogElement>;
  @ViewChild('controls',{static:true}) controls!:TemplateRef<unknown>;
  query='';active=false;index=0;
  start(){this.resetSelection();void this.search?.start(this.query);}
  more(){this.resetSelection();void this.search?.more();}
  private resetSelection(){this.active=false;this.index=0;this.cleared.emit();}
  open(){this.dialog.nativeElement.showModal();}
  close(){this.search?.cancel();this.dialog.nativeElement.close();}
  choose(hit:DocumentHit,index:number){this.index=index;this.active=true;this.close();this.selected.emit(hit);}
  step(delta:number){const index=this.index+delta,hit=this.search?.hits[index];if(hit)this.choose(hit,index);}
  dismiss(){this.active=false;this.search?.close();this.cleared.emit();}
  ngOnDestroy(){this.search?.close();this.dialog.nativeElement.close();}
}
