export default class Grid {
  constructor(rows, cols, fillValue = null) {
    this._rows = rows;
    this._cols = cols;
    this._data = Array.from({ length: rows }, () => Array(cols).fill(fillValue));
  }

  get rows() { return this._rows; }
  get cols() { return this._cols; }

  get(r, c)       { return this._data[r][c]; }
  set(r, c, value) { this._data[r][c] = value; }

  fill(value) {
    for (let r = 0; r < this._rows; r++)
      for (let c = 0; c < this._cols; c++)
        this._data[r][c] = value;
  }

  clone() {
    const g = new Grid(this._rows, this._cols);
    for (let r = 0; r < this._rows; r++)
      g._data[r] = [...this._data[r]];
    return g;
  }

  forEach(fn) {
    for (let r = 0; r < this._rows; r++)
      for (let c = 0; c < this._cols; c++)
        fn(this._data[r][c], r, c);
  }

  find(fn) {
    for (let r = 0; r < this._rows; r++)
      for (let c = 0; c < this._cols; c++)
        if (fn(this._data[r][c], r, c)) return { r, c, value: this._data[r][c] };
    return null;
  }

  findAll(fn) {
    const results = [];
    this.forEach((v, r, c) => { if (fn(v, r, c)) results.push({ r, c, value: v }); });
    return results;
  }

  inBounds(r, c) {
    return r >= 0 && r < this._rows && c >= 0 && c < this._cols;
  }

  neighbors(r, c, diagonal = false) {
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    if (diagonal) dirs.push(...[[-1,-1],[-1,1],[1,-1],[1,1]]);
    return dirs
      .map(([dr, dc]) => ({ r: r + dr, c: c + dc }))
      .filter(p => this.inBounds(p.r, p.c))
      .map(p => ({ r: p.r, c: p.c, value: this._data[p.r][p.c] }));
  }
}
