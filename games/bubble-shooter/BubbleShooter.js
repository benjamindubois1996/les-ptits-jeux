import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

export default class BubbleShooter extends BaseGame {

  constructor(config) {
    super(config);
    this.state     = this._buildFullState();
    this._raf      = null;
    this._lastTime = null;
  }

  _gameId() { return 'bubble-shooter'; }

  async init() {
    this._setupEventBusBindings();
    this._bindControls();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
    this._startLoop();
  }

  destroy() {
    super.destroy();
    this._stopLoop();
    this._unbindControls();
  }

  start(options = {}) {
    const mode  = options.mode ?? 'basique';
    const level = 1;
    const cfg   = this.config.gameplay;
    this.state  = {
      ...this._buildFullState(),
      status: 'playing',
      mode,
      level,
    };
    this._buildGrid(level);
    this._pickNext();
    EventBus.emit('game:score-update', { score: 0 });
    EventBus.emit('game:tick', { state: this.state, action: 'new-game' });
  }

  restart() {
    this.state = { ...this._buildFullState(), status: 'idle' };
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  _onPause()  {}
  _onResume() {}

  /* RAF */

  _startLoop() {
    const loop = (ts) => {
      if (!this._lastTime) this._lastTime = ts;
      const dt = Math.min(ts - this._lastTime, 50);
      this._lastTime = ts;
      this._update(dt);
      EventBus.emit('game:frame', { state: this.state });
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  _stopLoop() {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
  }

  /* Update */

  _update(dt) {
    const { state } = this;
    if (state.status !== 'playing') return;
    if (!state.bullet) return;

    const cfg    = this.config.gameplay;
    const bullet = state.bullet;
    const f      = dt / 16.667;

    bullet.x += bullet.dx * f;
    bullet.y += bullet.dy * f;

    /* Wall bounce */
    if (bullet.x - cfg.BUBBLE_R < 0) {
      bullet.x  = cfg.BUBBLE_R;
      bullet.dx = Math.abs(bullet.dx);
    }
    if (bullet.x + cfg.BUBBLE_R > cfg.W) {
      bullet.x  = cfg.W - cfg.BUBBLE_R;
      bullet.dx = -Math.abs(bullet.dx);
    }

    /* Top wall → place bubble */
    if (bullet.y - cfg.BUBBLE_R <= 0) {
      bullet.y = cfg.BUBBLE_R;
      this._landBullet();
      return;
    }

    /* Bubble-bubble collision */
    const hit = this._findHitBubble(bullet);
    if (hit) {
      this._landBullet(hit);
    }
  }

  _findHitBubble(bullet) {
    const cfg    = this.config.gameplay;
    const diam   = cfg.BUBBLE_R * 2;
    const { grid } = this.state;

    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        if (!grid[r][c]) continue;
        const { x, y } = this._cellPos(r, c);
        if (Math.hypot(bullet.x - x, bullet.y - y) < diam) return { r, c };
      }
    }
    return null;
  }

  _landBullet(hitBubble = null) {
    const { state } = this;
    const cfg    = this.config.gameplay;
    const bullet = state.bullet;

    /* Placement : voisins de la bulle touchée, ou recherche libre si mur du haut */
    const cell = hitBubble
      ? this._nearestNeighbor(hitBubble.r, hitBubble.c, bullet.x, bullet.y)
      : this._nearestEmpty(bullet.x, bullet.y);

    state.bullet = null;

    if (!cell) {
      /* Grid full (should be rare) — game over */
      this._gameOver();
      return;
    }

    const { r, c } = cell;
    /* Ensure grid has enough rows */
    while (state.grid.length <= r) {
      const newR = state.grid.length;
      state.grid.push(Array(newR % 2 === 0 ? cfg.COLS_EVEN : cfg.COLS_ODD).fill(null));
    }
    state.grid[r][c] = bullet.color;

    /* Match + pop */
    const matched = this._findMatches(r, c, bullet.color);
    if (matched.length >= 3) {
      /* Collecter positions avant suppression pour animation */
      const popped = matched.map(([mr, mc]) => ({ ...this._cellPos(mr, mc), color: state.grid[mr][mc] }));
      for (const [mr, mc] of matched) state.grid[mr][mc] = null;

      const dropped = this._removeFloating();
      state.score += matched.length * cfg.pointsPerBubble;
      state.score += dropped.length * cfg.pointsPerDrop;

      EventBus.emit('game:score-update', { score: state.score });
      EventBus.emit('game:bubbles-popped', { popped, dropped });
    }

    /* Check win (grid empty) */
    if (this._gridEmpty()) {
      state.level++;
      this._buildGrid(state.level);
      this._pickNext();
      EventBus.emit('game:tick', { state, action: 'level-up' });
      return;
    }

    /* Check game over (bubble too low) */
    if (this._tooLow()) {
      this._gameOver();
      return;
    }

    this._pickNext();
    EventBus.emit('game:tick', { state, action: 'landed' });
  }

  _nearestEmpty(px, py) {
    const cfg = this.config.gameplay;
    let best = null, bestD = Infinity;

    const rowApprox = Math.round((py - cfg.BUBBLE_R - 4) / cfg.ROW_H);
    for (let r = Math.max(0, rowApprox - 2); r <= Math.min(cfg.maxRow - 1, rowApprox + 2); r++) {
      const numCols = r % 2 === 0 ? cfg.COLS_EVEN : cfg.COLS_ODD;
      for (let c = 0; c < numCols; c++) {
        if (r < this.state.grid.length && this.state.grid[r][c]) continue;
        const pos = this._cellPos(r, c);
        const d   = Math.hypot(px - pos.x, py - pos.y);
        if (d < bestD) { best = { r, c }; bestD = d; }
      }
    }
    return best;
  }

  _nearestNeighbor(hr, hc, px, py) {
    const { state } = this;
    const cfg = this.config.gameplay;
    let best = null, bestD = Infinity;

    for (const [nr, nc] of this._neighbors(hr, hc)) {
      if (nr < 0 || nc < 0) continue;
      const numCols = nr % 2 === 0 ? cfg.COLS_EVEN : cfg.COLS_ODD;
      if (nc >= numCols) continue;
      if (nr < state.grid.length && state.grid[nr]?.[nc]) continue;
      const pos = this._cellPos(nr, nc);
      const d   = Math.hypot(px - pos.x, py - pos.y);
      if (d < bestD) { bestD = d; best = { r: nr, c: nc }; }
    }
    return best;
  }

  _findMatches(r, c, color) {
    const visited = new Set();
    const queue   = [[r, c]];
    const result  = [];
    const key     = (r, c) => `${r},${c}`;

    while (queue.length) {
      const [cr, cc] = queue.pop();
      const k = key(cr, cc);
      if (visited.has(k)) continue;
      visited.add(k);

      if (cr < 0 || cr >= this.state.grid.length) continue;
      if (cc < 0 || cc >= this.state.grid[cr].length) continue;
      if (this.state.grid[cr][cc] !== color) continue;

      result.push([cr, cc]);
      for (const [nr, nc] of this._neighbors(cr, cc)) {
        if (!visited.has(key(nr, nc))) queue.push([nr, nc]);
      }
    }
    return result;
  }

  _removeFloating() {
    const { grid } = this.state;
    const anchored = new Set();
    const queue    = [];

    if (!grid[0]) return [];
    for (let c = 0; c < grid[0].length; c++) {
      if (grid[0][c]) { anchored.add(`0,${c}`); queue.push([0, c]); }
    }

    while (queue.length) {
      const [r, c] = queue.shift();
      for (const [nr, nc] of this._neighbors(r, c)) {
        const k = `${nr},${nc}`;
        if (anchored.has(k)) continue;
        if (nr < 0 || nr >= grid.length || nc < 0 || nc >= (grid[nr]?.length ?? 0)) continue;
        if (!grid[nr][nc]) continue;
        anchored.add(k);
        queue.push([nr, nc]);
      }
    }

    /* Collecter positions avant suppression pour animation */
    const dropped = [];
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < (grid[r]?.length ?? 0); c++) {
        if (grid[r][c] && !anchored.has(`${r},${c}`)) {
          dropped.push({ ...this._cellPos(r, c), color: grid[r][c] });
          grid[r][c] = null;
        }
      }
    }
    return dropped;
  }

  _neighbors(r, c) {
    const isEven = r % 2 === 0;
    const base   = [[r, c-1],[r, c+1]];
    if (isEven) {
      return [...base, [r-1,c-1],[r-1,c],[r+1,c-1],[r+1,c]];
    } else {
      return [...base, [r-1,c],[r-1,c+1],[r+1,c],[r+1,c+1]];
    }
  }

  _cellPos(r, c) {
    const cfg = this.config.gameplay;
    const x = c * cfg.CELL + (r % 2 === 1 ? cfg.CELL / 2 : 0) + cfg.BUBBLE_R + (cfg.W - cfg.COLS_EVEN * cfg.CELL) / 2;
    const y = r * cfg.ROW_H + cfg.BUBBLE_R + 4;
    return { x, y };
  }

  _gridEmpty() {
    return this.state.grid.every(row => row.every(c => !c));
  }

  _tooLow() {
    const cfg = this.config.gameplay;
    return this.state.grid.some((row, r) => r >= cfg.maxRow && row.some(c => c));
  }

  _gameOver() {
    const { state } = this;
    state.status = 'gameover';
    ScoreService.submit(this._gameId(), state.score);
    EventBus.emit('game:over', {
      score: state.score,
      best:  ScoreService.getBest(this._gameId()),
    });
  }

  _buildGrid(level) {
    const cfg    = this.config.gameplay;
    const colors = cfg.colors.slice(0, Math.min(3 + level, cfg.colors.length));
    const rows   = cfg.startRows + Math.floor((level - 1) / 2);

    this.state.grid   = [];
    this.state.colors = colors;

    for (let r = 0; r < rows; r++) {
      const numCols = r % 2 === 0 ? cfg.COLS_EVEN : cfg.COLS_ODD;
      this.state.grid.push(
        Array.from({ length: numCols }, () =>
          Math.random() < 0.85 ? colors[Math.floor(Math.random() * colors.length)] : null
        )
      );
    }
  }

  _pickNext() {
    const { state } = this;
    /* Piocher seulement parmi les couleurs encore présentes dans la grille */
    const present = new Set();
    for (const row of state.grid) for (const c of row) if (c) present.add(c);
    const pool = present.size > 0 ? [...present] : (state.colors ?? this.config.gameplay.colors);
    const rand = () => pool[Math.floor(Math.random() * pool.length)];

    /* Remplacer currentBubble si sa couleur a disparu */
    const cur = state.nextBubble ?? rand();
    state.currentBubble = present.size > 0 && !present.has(cur) ? rand() : cur;
    state.nextBubble    = rand();
  }

  /* Shoot */

  shoot(angle) {
    const { state } = this;
    if (state.status !== 'playing' || state.bullet) return;
    const cfg = this.config.gameplay;

    /* Clamp angle: must point upward */
    const clamped = Math.max(Math.PI * 0.05, Math.min(Math.PI * 0.95, angle));
    const spd     = cfg.BULLET_SPEED;

    state.bullet = {
      x:     cfg.W / 2,
      y:     cfg.CANNON_Y,
      dx:    Math.cos(clamped) * spd,
      dy:   -Math.sin(clamped) * spd,
      color: state.currentBubble,
    };

    EventBus.emit('game:tick', { state, action: 'shoot' });
  }

  setAimAngle(angle) {
    this.state.aimAngle = angle;
  }

  _buildFullState() {
    return {
      status:        'loading',
      grid:          [],
      colors:        this.config.gameplay.colors,
      currentBubble: null,
      nextBubble:    null,
      bullet:        null,
      aimAngle:      Math.PI / 2,
      score:         0,
      level:         1,
      mode:          'basique',
    };
  }

  /* Controls */

  _bindControls() {
    this._onKeyDown = (e) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        const { state } = this;
        if (state.status === 'playing' && !state.bullet) {
          this.shoot(state.aimAngle);
        }
      }
      if (e.code === 'ArrowLeft')  { e.preventDefault(); this.state.aimAngle = Math.min(Math.PI * 0.95, (this.state.aimAngle ?? Math.PI/2) + 0.06); }
      if (e.code === 'ArrowRight') { e.preventDefault(); this.state.aimAngle = Math.max(Math.PI * 0.05, (this.state.aimAngle ?? Math.PI/2) - 0.06); }
      if (e.code === 'KeyP')  { e.preventDefault(); EventBus.emit('game:pause-toggle'); }
      if (e.code === 'KeyR')  { e.preventDefault(); EventBus.emit('game:restart'); }
    };
    window.addEventListener('keydown', this._onKeyDown);
  }

  _unbindControls() {
    if (this._onKeyDown) window.removeEventListener('keydown', this._onKeyDown);
  }
}
