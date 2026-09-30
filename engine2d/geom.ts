export type Vec2 = [number, number];

export const TAU = Math.PI * 2;
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Uniform grid for fast neighbour queries on points/circles. */
export class SpatialHash<T extends { x: number; y: number }> {
  private cells = new Map<number, T[]>();

  constructor(readonly cell: number) {}

  private key(cx: number, cy: number) {
    return (cx + 32768) * 65536 + (cy + 32768);
  }

  insert(item: T) {
    const k = this.key(Math.floor(item.x / this.cell), Math.floor(item.y / this.cell));
    const bucket = this.cells.get(k);
    if (bucket) bucket.push(item);
    else this.cells.set(k, [item]);
  }

  /** Visit items in cells overlapping the square of radius r around (x, y). */
  forEach(x: number, y: number, r: number, fn: (item: T) => void) {
    const x0 = Math.floor((x - r) / this.cell), x1 = Math.floor((x + r) / this.cell);
    const y0 = Math.floor((y - r) / this.cell), y1 = Math.floor((y + r) / this.cell);
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const bucket = this.cells.get(this.key(cx, cy));
        if (bucket) for (const item of bucket) fn(item);
      }
  }

  /** True if any item within distance r satisfies pred (default: any). */
  some(x: number, y: number, r: number, pred: (item: T) => boolean = () => true): boolean {
    const x0 = Math.floor((x - r) / this.cell), x1 = Math.floor((x + r) / this.cell);
    const y0 = Math.floor((y - r) / this.cell), y1 = Math.floor((y + r) / this.cell);
    const r2 = r * r;
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const bucket = this.cells.get(this.key(cx, cy));
        if (!bucket) continue;
        for (const item of bucket) {
          const dx = item.x - x, dy = item.y - y;
          if (dx * dx + dy * dy <= r2 && pred(item)) return true;
        }
      }
    return false;
  }
}
