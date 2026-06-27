import EventBus    from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

export default class Qix extends BaseGame {
  constructor(config) {
    super(config);
    this.state   = this._buildFullState();
    this._loopId = null;
    this._last   = 0;
    this._keys   = new Set();
  }

  _gameId() { return 'qix'; }

  async init() {
    this._setupEventBusBindings();
    this._bindControls();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() { super.destroy(); this._stopLoop(); this._unbindControls(); }

  _onPause()  { this._stopLoop(); }
  _onResume() { this._last = performance.now(); this._startLoop(); }

  start(options = {}) {
    this._stopLoop();
    this.lives.reset();
    this.timer.reset();
    this.state        = this._buildFullState();
    this.state.status = 'playing';
    this.state.mode   = options.mode ?? 'basique';
    this._initField();
    this._startLoop();
    this.timer.start();
    EventBus.emit('game:tick', { state: this.state, action: 'play' });
  }

  restart() {
    this._stopLoop();
    this.state        = this._buildFullState();
    this.state.status = 'idle';
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  // ── Field ──────────────────────────────────────────────────────────────────

  _initField() {
    const g = this.config.gameplay;
    const W = g.fieldW, H = g.fieldH;
    const s = this.state;
    s.W = W; s.H = H;

    s.claimed = new Uint8Array(W * H);
    for (let x = 0; x < W; x++) { s.claimed[x] = 1; s.claimed[(H-1)*W + x] = 1; }
    for (let y = 0; y < H; y++) { s.claimed[y*W] = 1; s.claimed[y*W + (W-1)] = 1; }

    s.claimedArea  = 2*(W + H) - 4;
    s.totalArea    = W * H;
    s.claimedPct   = 0;
    s.drawingTrail = [];
    s.isDrawing    = false;
    s.isSlow       = false;
    s.player       = { x: Math.floor(W / 2), y: 0 };

    s.qixes = [];
    for (let i = 0; i < g.qixCount; i++) {
      s.qixes.push({
        x: W/2 + (i*60 - 30), y: H/2,
        dx: (Math.random()*2 - 1) * g.qixSpeed,
        dy: (Math.random()*2 - 1) * g.qixSpeed,
        tail: []
      });
    }

    s.sparxes = [];
    this._perimPos = this._buildPerim();
    const len = this._perimPos.length;
    for (let i = 0; i < g.sparxCount; i++) {
      const t = Math.floor((i * len) / g.sparxCount);
      s.sparxes.push({ t, dir: i % 2 === 0 ? 1 : -1, x: 0, y: 0 });
    }
    this._moveSparxes(0); // init positions
  }

  _buildPerim() {
    const { W, H } = this.state;
    const p = [];
    for (let x = 0; x < W; x++) p.push({ x, y: 0 });
    for (let y = 1; y < H; y++) p.push({ x: W-1, y });
    for (let x = W-2; x >= 0; x--) p.push({ x, y: H-1 });
    for (let y = H-2; y > 0; y--) p.push({ x: 0, y });
    return p;
  }

  // ── Loop ──────────────────────────────────────────────────────────────────

  _startLoop() {
    this._last = performance.now();
    const tick = (now) => {
      if (this.state.status !== 'playing') return;
      const dt = Math.min((now - this._last) / 1000, 0.05);
      this._last = now;
      this._update(dt);
      EventBus.emit('game:tick', { state: this.state });
      this._loopId = requestAnimationFrame(tick);
    };
    this._loopId = requestAnimationFrame(tick);
  }

  _stopLoop() {
    if (this._loopId) { cancelAnimationFrame(this._loopId); this._loopId = null; }
  }

  // ── Update ────────────────────────────────────────────────────────────────

  _update(dt) {
    const s  = this.state;
    const g  = this.config.gameplay;
    const sp = g.playerSpeed * (s.isSlow ? g.slowMultiplier : 1);

    let dx = 0, dy = 0;
    if (this._keys.has('ArrowLeft')  || this._keys.has('KeyA')) dx = -1;
    if (this._keys.has('ArrowRight') || this._keys.has('KeyD')) dx =  1;
    if (this._keys.has('ArrowUp')    || this._keys.has('KeyW')) dy = -1;
    if (this._keys.has('ArrowDown')  || this._keys.has('KeyS')) dy =  1;
    if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }

    const nx = Math.round(Math.max(0, Math.min(s.W - 1, s.player.x + dx * sp)));
    const ny = Math.round(Math.max(0, Math.min(s.H - 1, s.player.y + dy * sp)));

    if (nx !== s.player.x || ny !== s.player.y) {
      const onBorder = this._isClaimed(nx, ny);
      if (s.isDrawing) {
        // Interpoler tous les pixels intermédiaires (playerSpeed > 1 crée des trous)
        const last  = s.drawingTrail[s.drawingTrail.length - 1];
        const steps = Math.max(Math.abs(nx - last.x), Math.abs(ny - last.y));
        for (let t = 1; t <= steps; t++) {
          s.drawingTrail.push({
            x: Math.round(last.x + (nx - last.x) * t / steps),
            y: Math.round(last.y + (ny - last.y) * t / steps),
          });
        }
        if (this._qixHitsTrail()) { this._die(); return; }
        if (onBorder) this._closeStix();
      } else {
        if (!onBorder) {
          s.isDrawing = true;
          // Interpoler aussi le premier segment (départ depuis la bordure)
          const steps = Math.max(Math.abs(nx - s.player.x), Math.abs(ny - s.player.y));
          s.drawingTrail = [{ x: s.player.x, y: s.player.y }];
          for (let t = 1; t <= steps; t++) {
            s.drawingTrail.push({
              x: Math.round(s.player.x + (nx - s.player.x) * t / steps),
              y: Math.round(s.player.y + (ny - s.player.y) * t / steps),
            });
          }
        }
      }
      s.player.x = nx; s.player.y = ny;
    }

    this._moveQixes(dt);
    this._moveSparxes(dt);

    if (this._sparxHitsPlayer()) { this._die(); return; }
  }

  _isClaimed(x, y) {
    return this.state.claimed[y * this.state.W + x] === 1;
  }

  _closeStix() {
    const s  = this.state;
    const g  = this.config.gameplay;
    const sc = this.config.scoring;
    const trail = s.drawingTrail;

    for (const p of trail) {
      const px = Math.round(p.x), py = Math.round(p.y);
      if (px >= 0 && px < s.W && py >= 0 && py < s.H) s.claimed[py * s.W + px] = 1;
    }

    const qixCells = s.qixes.map(q => ({ x: Math.round(q.x), y: Math.round(q.y) }));
    const { region: qixRegion } = this._floodFill(qixCells);

    let newClaimed = 0;
    for (let i = 0; i < s.W * s.H; i++) {
      if (s.claimed[i] === 0 && !qixRegion[i]) { s.claimed[i] = 1; newClaimed++; }
    }

    const pts = newClaimed * (s.isSlow ? sc.slowClaim : sc.fastClaim);
    if (pts > 0) s.score += pts;

    s.claimedArea += newClaimed + trail.length;
    s.claimedPct   = Math.round((s.claimedArea / s.totalArea) * 100);
    s.isDrawing    = false;
    s.drawingTrail = [];

    EventBus.emit('game:score-update', { score: s.score });

    if (s.claimedPct >= g.winThreshold) this._win();
  }

  _floodFill(seeds) {
    const { W, H, claimed } = this.state;
    const visited = new Uint8Array(W * H);
    const queue = [];
    for (const seed of seeds) {
      const si = seed.y * W + seed.x;
      if (si >= 0 && si < W * H && claimed[si] === 0 && !visited[si]) {
        visited[si] = 1; queue.push(si);
      }
    }
    let head = 0;
    while (head < queue.length) {
      const idx = queue[head++];
      const x = idx % W, y = Math.floor(idx / W);
      for (const [ddx, ddy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nx = x + ddx, ny = y + ddy;
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        const ni = ny * W + nx;
        if (claimed[ni] === 0 && !visited[ni]) { visited[ni] = 1; queue.push(ni); }
      }
    }
    return { region: visited };
  }

  _moveQixes(dt) {
    const s = this.state;
    const g = this.config.gameplay;
    for (const q of s.qixes) {
      let nx = q.x + q.dx, ny = q.y + q.dy;
      const outX = nx <= 0 || nx >= s.W - 1;
      const outY = ny <= 0 || ny >= s.H - 1;
      const ci   = Math.round(ny) * s.W + Math.round(nx);
      const inClaimed = ci >= 0 && ci < s.W * s.H && s.claimed[ci] === 1;
      if (outX || inClaimed) { q.dx = -(q.dx) + (Math.random()-0.5)*0.3; }
      if (outY || inClaimed) { q.dy = -(q.dy) + (Math.random()-0.5)*0.3; }
      const speed = Math.sqrt(q.dx*q.dx + q.dy*q.dy);
      if (speed > 0.1) { q.dx = q.dx/speed*g.qixSpeed; q.dy = q.dy/speed*g.qixSpeed; }
      else { q.dx = g.qixSpeed; q.dy = 0; }
      q.tail.push({ x: q.x, y: q.y });
      if (q.tail.length > 18) q.tail.shift();
      q.x = Math.max(1, Math.min(s.W-2, q.x + q.dx));
      q.y = Math.max(1, Math.min(s.H-2, q.y + q.dy));
    }
  }

  _moveSparxes(dt) {
    const s = this.state;
    const g = this.config.gameplay;
    const len = this._perimPos?.length;
    if (!len) return;
    for (const sp of s.sparxes) {
      sp.t = ((sp.t + sp.dir * g.sparxSpeed) % len + len) % len;
      const pos = this._perimPos[Math.round(sp.t) % len];
      sp.x = pos.x; sp.y = pos.y;
    }
  }

  _sparxHitsPlayer() {
    const s = this.state;
    for (const sp of s.sparxes) {
      if (Math.abs(sp.x - s.player.x) < 5 && Math.abs(sp.y - s.player.y) < 5) return true;
    }
    return false;
  }

  _qixHitsTrail() {
    const s = this.state;
    for (const q of s.qixes) {
      for (const p of s.drawingTrail) {
        if (Math.abs(q.x - p.x) < 6 && Math.abs(q.y - p.y) < 6) return true;
      }
    }
    return false;
  }

  _die() {
    const s = this.state;
    s.isDrawing = false; s.drawingTrail = [];
    this.lives.lose();
    const remaining = this.lives.count;
    if (remaining <= 0) {
      s.status = 'over';
      this._stopLoop();
      const { best, isRecord } = ScoreService.submit(this._gameId(), s.score);
      EventBus.emit('game:over', {
        result: 'lose', icon: '💀', title: 'GAME OVER',
        score: s.score, best, isRecord
      });
    } else {
      s.player = { x: Math.floor(s.W / 2), y: 0 };
      this._perimPos = this._buildPerim();
    }
  }

  _win() {
    const s = this.state;
    s.score += this.config.scoring.winBonus;
    s.status = 'won';
    this._stopLoop();
    const { best, isRecord } = ScoreService.submit(this._gameId(), s.score);
    EventBus.emit('game:won', {
      result: 'win', icon: '🏆', title: 'VICTOIRE !',
      score: s.score, best, isRecord
    });
  }

  // ── Controls ──────────────────────────────────────────────────────────────

  _bindControls() {
    this._onKey = (e) => {
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space',
           'KeyA','KeyD','KeyW','KeyS'].includes(e.code)) e.preventDefault();
      if (e.type === 'keydown') {
        this._keys.add(e.code);
        if (e.code === 'Space') this.state.isSlow = true;
      } else {
        this._keys.delete(e.code);
        if (e.code === 'Space') this.state.isSlow = false;
      }
    };
    window.addEventListener('keydown', this._onKey);
    window.addEventListener('keyup',   this._onKey);
  }

  _unbindControls() {
    window.removeEventListener('keydown', this._onKey);
    window.removeEventListener('keyup',   this._onKey);
  }

  _buildFullState() {
    return {
      status: 'idle', mode: 'basique', score: 0,
      W: 0, H: 0, claimed: null, claimedArea: 0, totalArea: 1, claimedPct: 0,
      drawingTrail: [], isDrawing: false, isSlow: false,
      player: { x: 0, y: 0 }, qixes: [], sparxes: []
    };
  }
}
