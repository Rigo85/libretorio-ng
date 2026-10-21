import {Component,Input,Output,EventEmitter,ViewChild,ElementRef,OnDestroy,ChangeDetectionStrategy,TemplateRef} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {DocumentHit,DocumentSearch} from '../../core/document-search';
@Component({selector:'document-search',imports:[FormsModule],changeDetection:ChangeDetectionStrategy.Eager,
  template:`<button class="tool" type="button" title="Buscar en el documento" aria-label="Buscar en el documento" [disabled]="!search" (click)="open()"><i class="bi bi-search" aria-hidden="true"></i></button>
    <dialog #dialog aria-label="Buscar en el documento" (cancel)="search?.cancel()" (close)="releaseViewport()">
      <header><h2>Buscar en el documento</h2><button type="button" class="tool" title="Cerrar busqueda" aria-label="Cerrar busqueda" (click)="close()"><i class="bi bi-x-lg" aria-hidden="true"></i></button></header>
      <form (ngSubmit)="start()"><input name="query" aria-label="Texto en el documento" placeholder="Buscar texto" type="search" [(ngModel)]="query" maxlength="128" autofocus><button type="submit" class="tool search-submit" title="Buscar" aria-label="Buscar" [disabled]="!query.trim()"><i class="bi bi-search" aria-hidden="true"></i></button></form>
      @if(search;as state){<p role="status">{{state.error|| (state.busy?'Buscando...':state.done?'Recorrido completo':state.query?'Recorrido parcial':'')}}</p>
        <ul aria-label="Resultados">@for(hit of state.hits;track $index){<li><button type="button" (click)="choose(hit,$index)"><strong>{{hit.label}}</strong><span>{{hit.excerpt}}</span></button></li>}</ul>
        @if(state.done&&!state.hits.length){<p>Sin mas coincidencias.</p>}
        @if(state.busy || (state.query&&!state.done)) {
          <footer>@if(state.busy){<button type="button" class="search-action" (click)="state.cancel()"><i class="bi bi-stop" aria-hidden="true"></i>Detener</button>}@else{<button type="button" class="search-action" (click)="more()"><i [class]="state.error?'bi bi-arrow-clockwise':'bi bi-arrow-right'" aria-hidden="true"></i>{{state.error?'Reintentar':'Siguiente tramo'}}</button>}</footer>
        }
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
    dialog{box-sizing:border-box;color:var(--bs-body-color);background:var(--bs-body-bg);border:1px solid var(--bs-border-color);border-radius:6px;width:min(520px,calc(100vw - 16px));max-width:calc(100vw - 16px);max-height:min(80dvh,calc(var(--search-viewport-height,100dvh) - 16px));padding:12px;margin:auto;overflow:auto}
    dialog[open]{display:flex;flex-direction:column;gap:12px}dialog::backdrop{background:#0006}
    header,form,footer{display:flex;align-items:center;gap:8px;flex:0 0 auto;min-width:0}
    header{padding:0 0 8px;max-height:none;border-bottom:1px solid var(--bs-border-color);z-index:auto}
    header h2{font-size:18px;line-height:1.35;margin:0;flex:1;min-width:0;overflow-wrap:anywhere}
    form input{box-sizing:border-box;min-width:0;flex:1;height:44px;background:var(--bs-tertiary-bg);color:inherit;border:1px solid var(--bs-border-color);border-radius:4px;padding:8px;font:inherit;font-size:16px}
    .search-submit{border:1px solid var(--bs-border-color);background:var(--bs-tertiary-bg)}
    p{margin:0;font-size:14px;flex:none;overflow-wrap:anywhere}p:empty{display:none}
    ul{list-style:none;padding:0;margin:0;min-height:0;overflow:auto;overscroll-behavior:contain;flex:0 1 auto}
    li button{display:block;text-align:start;width:100%;padding:12px 4px;background:none;color:inherit;border:0;border-bottom:1px solid var(--bs-border-color);overflow-wrap:anywhere;font:inherit}li span{display:block;font-size:14px;margin-top:4px}
    footer{position:static;inset:auto;width:auto;height:auto;justify-content:flex-end;padding:8px 0 0;border-top:1px solid var(--bs-border-color)}
    .search-action{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:8px 12px;border:1px solid var(--bs-border-color);border-radius:4px;background:var(--bs-tertiary-bg);color:inherit;font:inherit}
    button:focus-visible,input:focus-visible{outline:2px solid var(--bs-primary);outline-offset:2px}
    @media(max-width:767px){dialog{top:calc(var(--search-viewport-top,0px) + 8px);bottom:auto;margin:0 auto;max-height:calc(var(--search-viewport-height,100dvh) - 16px)}}
    .match-nav{display:flex;flex:none;align-items:center;justify-content:flex-end;background:var(--bs-body-bg);border-bottom:1px solid var(--bs-border-color);min-height:44px;width:100%}
    .match-nav>button:not(.tool){background:none;color:inherit;border:0;min-height:44px}
  `]})
export class DocumentSearchComponent implements OnDestroy {
  @Input() search?:DocumentSearch;@Output() selected=new EventEmitter<DocumentHit>();@Output() cleared=new EventEmitter<void>();
  @ViewChild('dialog',{static:true}) dialog!:ElementRef<HTMLDialogElement>;
  @ViewChild('controls',{static:true}) controls!:TemplateRef<unknown>;
  query='';active=false;index=0;
  private viewport?:VisualViewport;
  private updateViewport=()=>{
    if(!this.viewport)return;
    this.dialog.nativeElement.style.setProperty('--search-viewport-height',`${this.viewport.height}px`);
    this.dialog.nativeElement.style.setProperty('--search-viewport-top',`${this.viewport.offsetTop}px`);
  };
  start(){this.resetSelection();void this.search?.start(this.query);}
  more(){this.resetSelection();void this.search?.more();}
  private resetSelection(){this.active=false;this.index=0;this.cleared.emit();}
  open(){
    this.releaseViewport();this.viewport=window.visualViewport??undefined;
    this.updateViewport();this.viewport?.addEventListener('resize',this.updateViewport);this.viewport?.addEventListener('scroll',this.updateViewport);
    this.dialog.nativeElement.showModal();
  }
  releaseViewport(){this.viewport?.removeEventListener('resize',this.updateViewport);this.viewport?.removeEventListener('scroll',this.updateViewport);this.viewport=undefined;}
  close(){this.search?.cancel();this.releaseViewport();this.dialog.nativeElement.close();}
  choose(hit:DocumentHit,index:number){this.index=index;this.active=true;this.close();this.selected.emit(hit);}
  step(delta:number){const index=this.index+delta,hit=this.search?.hits[index];if(hit)this.choose(hit,index);}
  dismiss(){this.active=false;this.search?.close();this.cleared.emit();}
  ngOnDestroy(){this.releaseViewport();this.search?.close();this.dialog.nativeElement.close();}
}
