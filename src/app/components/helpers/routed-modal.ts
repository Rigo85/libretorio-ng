declare const bootstrap: any;

// Bootstrap ignores hide/show during transitions. Wait for the owning modal only.
export class RoutedModal {
  private state: 'hidden' | 'showing' | 'shown' | 'hiding' = 'hidden';
  private waiters: Array<() => void> = [];
  private closing?: Promise<void>;
  private disposed = false;
  private instance: any;
  private events = ['show.bs.modal', 'shown.bs.modal', 'hide.bs.modal', 'hidden.bs.modal'];
  private listener = (event: Event) => {
    if (event.target !== this.element) return;
    const states: Record<string, typeof this.state> = {'show.bs.modal':'showing', 'shown.bs.modal':'shown', 'hide.bs.modal':'hiding', 'hidden.bs.modal':'hidden'};
    this.state = states[event.type];
    if (this.state === 'shown' || this.state === 'hidden') this.waiters.splice(0).forEach(done => done());
  };
  constructor(readonly element: HTMLElement) {
    this.instance = bootstrap.Modal.getOrCreateInstance(element);
    this.events.forEach(event => element.addEventListener(event, this.listener));
  }
  private live() { return !this.disposed && bootstrap.Modal.getInstance(this.element) === this.instance; }
  private settled() {
    return this.state === 'showing' || this.state === 'hiding' ? new Promise<void>(done => this.waiters.push(done)) : Promise.resolve();
  }
  async visible(show: boolean): Promise<void> {
    if (this.closing) return this.closing;
    if (!this.live()) return;
    await this.settled();
    if (!this.live() || (show ? this.state === 'shown' : this.state === 'hidden')) return;
    this.instance[show ? 'show' : 'hide']();
    await this.settled();
  }
  dispose(remove = false): Promise<void> {
    if (this.closing) return this.closing;
    return this.closing = this.visible(false).finally(() => {
      if (this.live()) this.instance.dispose();
      this.disposed = true;
      this.events.forEach(event => this.element.removeEventListener(event, this.listener));
      this.waiters.splice(0).forEach(done => done());
      if (remove) this.element.remove();
    });
  }
}
