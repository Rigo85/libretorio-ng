import { Injectable } from '@angular/core';

type Resource = 'mediaListeners' | 'timers' | 'subscriptions' | 'panelListeners';

@Injectable({providedIn: 'root'})
export class AudioDiagnosticsService {
  enabled = false;
  created = 0;
  destroyed = 0;
  resources: Record<Resource, number> = {mediaListeners: 0, timers: 0, subscriptions: 0, panelListeners: 0};
  private entries: object[] = [];
  private sequence = 0;
  private active = new Set<number>();
  private heapBytes: number | null = null;
  private cachedReport = '';
  open() {
    const id = ++this.sequence;
    this.created++;
    this.cachedReport = '';
    this.active.add(id);
    this.record(id, 'created');
    return id;
  }
  resource(name: Resource, delta: number) { this.resources[name] += delta; this.cachedReport = ''; }
  record(id: number, event: string, position?: number) {
    if (!this.enabled) return;
    this.cachedReport = '';
    const memory = (performance as Performance & {memory?: {usedJSHeapSize: number}}).memory;
    this.heapBytes = memory?.usedJSHeapSize ?? null;
    this.entries.push({at: new Date().toISOString(), id, event, position,
      active: this.active.size, resources: {...this.resources}, heapBytes: this.heapBytes});
    if (this.entries.length > 400) this.entries.shift();
  }
  close(id: number) {
    if (this.active.delete(id)) this.destroyed++;
    this.cachedReport = '';
    this.record(id, 'destroyed');
  }
  get report() {
    if (this.cachedReport) return this.cachedReport;
    this.cachedReport = JSON.stringify({schema: 1, build: 'audio-native-integration-2026-10-03', created: this.created,
      destroyed: this.destroyed, active: this.active.size, resources: this.resources,
      heapBytes: this.heapBytes, heapScope: 'Chromium approximate JS heap; not total audio memory or leak proof',
      entries: this.entries}, null, 2);
    return this.cachedReport;
  }
  download() {
    const url = URL.createObjectURL(new Blob([this.report], {type: 'application/json'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'audio-diagnostics-' + Date.now() + '.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
