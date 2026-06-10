/**
 * Uniform spatial hash on the XZ plane. Backs every proximity question in the
 * game: enemy separation, projectile hits, explosion queries, pickup magnets,
 * AI awareness. O(1) insert/update/remove; queries touch only nearby cells.
 *
 * Ids are opaque numbers owned by the caller (enemy index, pickup id, ...).
 * queryCircle writes into a caller-provided array and returns the count —
 * no allocation during gameplay.
 */

export class SpatialHashGrid {
  private readonly cellSize: number;
  private cells = new Map<number, number[]>();
  private idToCell = new Map<number, number>();
  private idToPos = new Map<number, { x: number; z: number }>();

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  private key(cx: number, cz: number): number {
    // Pack two signed 16-bit cell coords into one number.
    return (cx + 0x8000) * 0x10000 + (cz + 0x8000);
  }

  private cellCoord(v: number): number {
    return Math.floor(v / this.cellSize);
  }

  insert(id: number, x: number, z: number): void {
    const k = this.key(this.cellCoord(x), this.cellCoord(z));
    let cell = this.cells.get(k);
    if (!cell) {
      cell = [];
      this.cells.set(k, cell);
    }
    cell.push(id);
    this.idToCell.set(id, k);
    const pos = this.idToPos.get(id);
    if (pos) {
      pos.x = x;
      pos.z = z;
    } else {
      this.idToPos.set(id, { x, z });
    }
  }

  update(id: number, x: number, z: number): void {
    const oldKey = this.idToCell.get(id);
    const newKey = this.key(this.cellCoord(x), this.cellCoord(z));
    const pos = this.idToPos.get(id);
    if (pos) {
      pos.x = x;
      pos.z = z;
    }
    if (oldKey === newKey) return;
    if (oldKey !== undefined) this.removeFromCell(id, oldKey);
    let cell = this.cells.get(newKey);
    if (!cell) {
      cell = [];
      this.cells.set(newKey, cell);
    }
    cell.push(id);
    this.idToCell.set(id, newKey);
    if (!pos) this.idToPos.set(id, { x, z });
  }

  remove(id: number): void {
    const k = this.idToCell.get(id);
    if (k !== undefined) this.removeFromCell(id, k);
    this.idToCell.delete(id);
    this.idToPos.delete(id);
  }

  private removeFromCell(id: number, key: number): void {
    const cell = this.cells.get(key);
    if (!cell) return;
    const idx = cell.indexOf(id);
    if (idx !== -1) {
      // swap-remove: order within a cell doesn't matter
      cell[idx] = cell[cell.length - 1];
      cell.pop();
    }
  }

  /**
   * Collect ids within `radius` of (x,z) into `out`. Returns the count.
   * `out` is truncated and refilled — pass a scratch array you own.
   */
  queryCircle(x: number, z: number, radius: number, out: number[]): number {
    out.length = 0;
    const r2 = radius * radius;
    const minCx = this.cellCoord(x - radius);
    const maxCx = this.cellCoord(x + radius);
    const minCz = this.cellCoord(z - radius);
    const maxCz = this.cellCoord(z + radius);
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const cell = this.cells.get(this.key(cx, cz));
        if (!cell) continue;
        for (let i = 0; i < cell.length; i++) {
          const id = cell[i];
          const pos = this.idToPos.get(id);
          if (!pos) continue;
          const dx = pos.x - x;
          const dz = pos.z - z;
          if (dx * dx + dz * dz <= r2) out.push(id);
        }
      }
    }
    return out.length;
  }

  clear(): void {
    this.cells.clear();
    this.idToCell.clear();
    this.idToPos.clear();
  }

  get size(): number {
    return this.idToCell.size;
  }
}
