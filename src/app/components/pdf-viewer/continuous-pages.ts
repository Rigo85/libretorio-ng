export const PAGE_GAP = 24;

export class ContinuousPages {
  private heights: number[] = [];
  private offsets: number[] = [0];
  get count() { return this.heights.length; }
  get total() { return this.offsets[this.count]; }
  reset(count: number, estimate: number) {
    this.heights = Array.from({length: Math.max(0, count)}, () => Math.max(96, estimate) + PAGE_GAP);
    this.reindex();
  }
  top(page: number) { return this.offsets[Math.max(0, Math.min(this.count, page))]; }
  height(page: number) { return (this.heights[page] ?? PAGE_GAP) - PAGE_GAP; }
  locate(y: number) {
    let lo = 0, hi = Math.max(0, this.count - 1);
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (this.top(mid) <= y) lo = mid; else hi = mid - 1;
    }
    return lo;
  }
  measure(page: number, height: number, scrollTop: number) {
    if (!Number.isFinite(height) || height < 0 || page < 0 || page >= this.count) return scrollTop;
    const anchor = this.locate(scrollTop), offset = scrollTop - this.top(anchor);
    this.heights[page] = Math.max(96, Math.ceil(height)) + PAGE_GAP;
    this.reindex();
    return this.top(anchor) + Math.min(offset, this.heights[anchor] - 1);
  }
  window(scrollTop: number, viewport: number) {
    if (!this.count) return [];
    const start = this.locate(Math.max(0, scrollTop - viewport / 4));
    const end = this.locate(Math.min(this.total - 1, scrollTop + viewport * 1.5));
    return Array.from({length: end - start + 1}, (_, index) => start + index);
  }
  private reindex() {
    this.offsets = [0];
    for (const height of this.heights) this.offsets.push(this.offsets[this.offsets.length - 1] + height);
  }
}
