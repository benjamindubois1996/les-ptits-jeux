import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

const GRAVITY     = 700;   // px/s²
const MAX_SPEED   = 380;   // px/s forward
const ENGINE_FORCE = 320;  // px/s² along slope
const WHEELBASE   = 38;    // px between wheel contacts
const CRASH_ANGLE = 1.2;   // radians (~70°) lean from vertical = crash
const TERRAIN_STEP = 6;    // px between terrain samples

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function generateTerrain(seed) {
  const totalLen = 14000;
  const count    = Math.ceil(totalLen / TERRAIN_STEP);
  const ys       = new Float32Array(count);

  let y    = 280;
  let vel  = 0;
  let flat = 40; // flat start

  for (let i = 0; i < count; i++) {
    const x = i * TERRAIN_STEP;
    if (flat > 0) { ys[i] = y; flat--; continue; }

    // Random perturbation
    vel += (Math.random() - 0.48) * 1.8;
    vel  = clamp(vel, -4, 4);
    y   += vel;
    y    = clamp(y, 80, 420);

    // Occasional ramps (steep then flat)
    if (Math.random() < 0.003 && x > 600) {
      const rampLen = 18 + Math.floor(Math.random() * 24);
      const dir     = Math.random() < 0.5 ? -1 : 1;
      for (let j = i; j < Math.min(i + rampLen, count); j++) {
        y += dir * 3.5;
        y  = clamp(y, 80, 420);
        ys[j] = y;
      }
      i   += rampLen - 1;
      flat = 8;
      vel  = 0;
      continue;
    }

    ys[i] = y;
  }

  return { ys, step: TERRAIN_STEP, length: totalLen };
}

function sampleTerrain(t, x) {
  if (x < 0) return t.ys[0];
  const idx = x / t.step;
  const i0  = Math.floor(idx);
  if (i0 >= t.ys.length - 1) return t.ys[t.ys.length - 1];
  const frac = idx - i0;
  return t.ys[i0] * (1 - frac) + t.ys[i0 + 1] * frac;
}

function slopeAt(t, x) {
  const dx = t.step * 2;
  return Math.atan2(sampleTerrain(t, x + dx) - sampleTerrain(t, x - dx), dx * 2);
}

export default class MotoTrial extends BaseGame {
  constructor(config) {
    super(config);
    this.state   = null;
    this._keys   = {};
    this._rafId  = null;
    this._lastTs = null;
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp   = this._onKeyUp.bind(this);
  }

  _gameId() { return 'moto-trial'; }

  _buildFullState() {
    const terrain = generateTerrain(Math.random());
    const startY  = sampleTerrain(terrain, 0);
    return {
      status:      'idle',
      bike: {
        x: 120, y: startY,
        vx: 0,  vy: 0,
        angle: 0,      // body angle (radians, 0 = upright)
        leanOffset: 0, // player lean contribution
        grounded: true,
        crashed:  false,
        distance: 0,   // metres
        maxDist:  0,
      },
      terrain,
      score:   0,
    };
  }

  async init() {
    this._setupEventBusBindings();
    this._bindControls();
    this.state = this._buildFullState();
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  start() {
    const s = this.state;
    s.status = 'playing';
    this._lastTs = null;
    this._startLoop();
    EventBus.emit('game:tick', { state: s, action: 'play' });
  }

  _startLoop() {
    const loop = (ts) => {
      if (!this._lastTs) this._lastTs = ts;
      const dt = Math.min((ts - this._lastTs) / 1000, 0.05);
      this._lastTs = ts;
      this._update(dt);
      if (this.state?.status === 'playing') {
        this._rafId = requestAnimationFrame(loop);
      }
    };
    this._rafId = requestAnimationFrame(loop);
  }

  _stopLoop() {
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    this._lastTs = null;
  }

  _update(dt) {
    const s = this.state;
    if (s.status !== 'playing') return;
    const b = s.bike;
    const t = s.terrain;

    const gas    = !!(this._keys['ArrowRight'] || this._keys['KeyD']);
    const brake  = !!(this._keys['ArrowLeft']  || this._keys['KeyA']);
    const leanBk = !!(this._keys['ArrowUp']    || this._keys['KeyW']);
    const leanFw = !!(this._keys['ArrowDown']  || this._keys['KeyS']);

    const terrainY = sampleTerrain(t, b.x);
    const slope    = slopeAt(t, b.x);
    b.grounded     = b.y >= terrainY - 4;

    if (b.grounded) {
      // Snap to terrain
      b.y  = terrainY;
      b.vy = 0;

      // Engine / brake along slope
      const cos = Math.cos(slope);
      if (gas)   b.vx += ENGINE_FORCE * cos * dt;
      if (brake) b.vx -= ENGINE_FORCE * 0.4 * cos * dt;

      // Rolling resistance + gravity component down slope
      b.vx -= GRAVITY * Math.sin(slope) * dt * 0.6;
      b.vx *= (1 - 1.8 * dt); // friction
      b.vx  = clamp(b.vx, -MAX_SPEED * 0.25, MAX_SPEED);

      // Small bounce on landing
      if (leanBk && b.vx > 50) b.vy = -clamp(b.vx * 0.15, 0, 80);
    } else {
      // In air
      b.vy += GRAVITY * dt;
      b.y  += b.vy * dt;

      // Check landing
      const newTY = sampleTerrain(t, b.x);
      if (b.y >= newTY) {
        b.y  = newTY;
        // Hard landing crash check
        if (b.vy > 450 && Math.abs(b.angle) > 0.6) {
          this._crash(s);
          return;
        }
        b.vy      = 0;
        b.grounded = true;
      }
    }

    // Lean control
    if (leanBk) b.leanOffset -= 2.2 * dt;
    if (leanFw) b.leanOffset += 2.2 * dt;
    b.leanOffset *= (1 - 2.5 * dt);
    b.leanOffset  = clamp(b.leanOffset, -0.7, 0.7);

    // Compute body angle from terrain slope + lean
    b.angle = slope + b.leanOffset;

    // Crash if too tilted
    if (Math.abs(b.angle) > CRASH_ANGLE) {
      this._crash(s);
      return;
    }

    // Move forward
    b.x += b.vx * dt;
    if (b.x < 0) { b.x = 0; b.vx = 0; }

    // Fall off bottom → crash
    if (b.y > 560) { this._crash(s); return; }

    // Update distance & score
    const dist = Math.floor(b.x / 100);
    if (dist > b.maxDist) {
      b.maxDist = dist;
      s.score   = dist;
      ScoreService.submit(this._gameId(), s.score);
    }

    EventBus.emit('game:tick', { state: s, action: 'tick' });
  }

  _crash(s) {
    const b = s.bike;
    b.crashed = true;
    b.vx      = 0;
    b.vy      = 0;
    s.status  = 'over';
    this._stopLoop();
    const res = ScoreService.submit(this._gameId(), s.score);
    EventBus.emit('game:over', { score: s.score, best: res.best, isRecord: res.isRecord });
  }

  _bindControls() {
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup',   this._onKeyUp);
  }

  _unbindControls() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup',   this._onKeyUp);
  }

  _onKeyDown(e) {
    if (e.key === 'p' || e.key === 'P') { EventBus.emit('game:pause-toggle'); return; }
    if (e.key === 'r' || e.key === 'R') { EventBus.emit('game:restart');      return; }
    this._keys[e.code] = true;
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) e.preventDefault();
  }

  _onKeyUp(e) { this._keys[e.code] = false; }

  _onPause()  { this._stopLoop(); }
  _onResume() { this._lastTs = null; this._startLoop(); }

  restart() {
    this._stopLoop();
    this._keys = {};
    this.state = this._buildFullState();
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  destroy() {
    this._stopLoop();
    this._unbindControls();
    super.destroy();
  }
}
