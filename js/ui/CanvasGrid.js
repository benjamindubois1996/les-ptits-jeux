export default class CanvasGrid {
  constructor({ cellSize, gap = 0, padding = 0 }) {
    this.cellSize = cellSize;
    this.gap      = gap;
    this.padding  = padding;
  }

  canvasSize(grid) {
    const w = this.padding * 2 + grid.cols * this.cellSize + (grid.cols - 1) * this.gap;
    const h = this.padding * 2 + grid.rows * this.cellSize + (grid.rows - 1) * this.gap;
    return { width: w, height: h };
  }

  _cellOrigin(r, c) {
    const x = this.padding + c * (this.cellSize + this.gap);
    const y = this.padding + r * (this.cellSize + this.gap);
    return { x, y };
  }

  draw(ctx, grid, cellRenderer) {
    grid.forEach((value, r, c) => {
      const { x, y } = this._cellOrigin(r, c);
      cellRenderer(ctx, x, y, this.cellSize, value, r, c);
    });
  }

  cellAt(canvasX, canvasY) {
    const c = Math.floor((canvasX - this.padding) / (this.cellSize + this.gap));
    const r = Math.floor((canvasY - this.padding) / (this.cellSize + this.gap));
    return { r, c };
  }
}
