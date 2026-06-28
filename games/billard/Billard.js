import EventBus        from '../../js/core/EventBus.js';
import ScoreService    from '../../js/services/ScoreService.js';
import BaseGame        from '../../js/core/BaseGame.js';
import GameLoop        from '../../js/core/GameLoop.js';
import BilliardPhysics from '../../js/core/BilliardPhysics.js';

export const TW = 640, TH = 360;
export const BALL_R = 10;
const POCKET_R = 18;

// Pocket positions — r obligatoire pour la détection physique
const POCKETS = [
  {x:18,y:18,r:POCKET_R},{x:TW/2,y:8,r:POCKET_R},{x:TW-18,y:18,r:POCKET_R},
  {x:18,y:TH-18,r:POCKET_R},{x:TW/2,y:TH-8,r:POCKET_R},{x:TW-18,y:TH-18,r:POCKET_R},
];

// Ball colors: 0=white, 1-7=solids, 8=black, 9-15=stripes
const BALL_COLORS = [
  '#f0f0f0','#ffcc00','#3366cc','#dd2222','#8822cc',
  '#ee7700','#22aa44','#8B0000','#111111',
  '#ffcc00','#3366cc','#dd2222','#8822cc','#ee7700','#22aa44','#8B0000',
];

function makeBalls() {
  const balls = [];
  // Cue ball
  balls.push({ id:0, x:TW*0.25, y:TH/2, vx:0, vy:0, pocketed:false, color:BALL_COLORS[0] });

  // Triangle rack at 3/4 width
  const rx = TW * 0.70, ry = TH / 2;
  const rs = BALL_R * 2 + 1;
  const rack = [
    [0,0],[1,-0.5],[1,0.5],[2,-1],[2,0],[2,1],[3,-1.5],[3,-0.5],[3,0.5],[3,1.5],
    [4,-2],[4,-1],[4,0],[4,1],[4,2],
  ];
  // Ordre officiel 8-ball : bille 8 au centre (index 4 = row 3 center)
  const order = [1,9,2,10,8,11,3,12,4,13,5,14,6,15,7];
  rack.forEach(([col,row], i) => {
    const id = order[i];
    balls.push({
      id, x: rx + col * rs * 0.866, y: ry + row * rs,
      vx:0, vy:0, pocketed:false, color: BALL_COLORS[id],
    });
  });
  return balls;
}

export default class Billard extends BaseGame {
  constructor(config) {
    super(config);
    this.state = null;
    this._loop = new GameLoop(() => this._tick());
    this._canvas = null;
    this._aiming = false;
    this._aimStart = null;
    this._physics = new BilliardPhysics({
      tableW: TW, tableH: TH, ballR: BALL_R,
      friction: 0.988, cushion: 0.78, subSteps: 3,
    });
  }

  _gameId() { return 'billard'; }

  async init() {
    this._setupEventBusBindings();
    this.state = this._buildFullState();
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() { super.destroy(); this._loop.destroy(); this._unbindControls(); }

  start(options = {}) {
    this._loop.stop();
    this.state = this._buildFullState();
    this.state.status = 'playing';
    this._loop.start(16);
    this._bindControls();
    EventBus.emit('game:tick', { state: this.state, action: 'play' });
  }

  restart() {
    this._loop.stop();
    this._unbindControls();
    this.state = this._buildFullState();
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  _onPause()  { this._loop.stop(); }
  _onResume() { this._loop.start(16); }

  setCanvas(c) { this._canvas = c; }

  _bindControls() {
    const toTable = (e) => {
      if (!this._canvas) return { x: 0, y: 0 };
      const r = this._canvas.getBoundingClientRect();
      const src = e.touches ? e.touches[0] : e;
      return {
        x: (src.clientX - r.left) / (r.width  / TW),
        y: (src.clientY - r.top)  / (r.height / TH),
      };
    };

    this._onDown = e => {
      const s = this.state;
      if (!s || s.status !== 'playing' || !this._isIdle()) return;
      this._aiming = true;
      this._aimStart = toTable(e);
      this.state.aim = this._aimStart;
      EventBus.emit('game:tick', { state: s });
    };
    this._onMove = e => {
      if (!this._aiming) return;
      this.state.aimCur = toTable(e);
      EventBus.emit('game:tick', { state: this.state });
    };
    this._onUp = e => {
      if (!this._aiming) return;
      this._aiming = false;
      const cur = toTable(e);
      const s = this.state;
      const cue = s.balls[0];
      const { vx, vy } = this._physics.calcShot(this._aimStart, cur);
      cue.vx = vx; cue.vy = vy;
      s.aim = null; s.aimCur = null;
    };

    this._canvas?.addEventListener('mousedown',  this._onDown);
    this._canvas?.addEventListener('mousemove',  this._onMove);
    this._canvas?.addEventListener('mouseup',    this._onUp);
    this._canvas?.addEventListener('touchstart', this._onDown, { passive: true });
    this._canvas?.addEventListener('touchmove',  this._onMove, { passive: true });
    this._canvas?.addEventListener('touchend',   this._onUp);

    this._onKey = e => {
      if (e.key === 'p' || e.key === 'P') EventBus.emit('game:pause-toggle');
      if (e.key === 'r' || e.key === 'R') this.restart();
    };
    window.addEventListener('keydown', this._onKey);
  }

  _unbindControls() {
    this._canvas?.removeEventListener('mousedown',  this._onDown);
    this._canvas?.removeEventListener('mousemove',  this._onMove);
    this._canvas?.removeEventListener('mouseup',    this._onUp);
    this._canvas?.removeEventListener('touchstart', this._onDown);
    this._canvas?.removeEventListener('touchmove',  this._onMove);
    this._canvas?.removeEventListener('touchend',   this._onUp);
    if (this._onKey) { window.removeEventListener('keydown', this._onKey); this._onKey = null; }
  }

  _isIdle() {
    return this._physics.isIdle(this.state.balls);
  }

  _tick() {
    const s = this.state;
    if (s.status !== 'playing') return;

    this._physics.step(s.balls, POCKETS, ball => this._onBallPocketed(ball));

    const colored = s.balls.filter(b => b.id !== 0 && b.id !== 8);
    if (colored.every(b => b.pocketed)) s.canSinkEight = true;

    EventBus.emit('game:tick', { state: s });
  }

  _onBallPocketed(ball) {
    const s = this.state;
    if (ball.id === 0) { this._cuePocketed(); return; }
    if (ball.id === 8) { this._eightBallPocketed(); return; }
    s.pocketed++;
    s.score += this.config?.scoring?.perBall ?? 50;
  }

  _cuePocketed() {
    const s = this.state;
    s.fouls++;
    if (s.fouls >= 3) { this._gameOver(); return; }
    // Replace cue ball
    setTimeout(() => {
      if (s.status !== 'playing') return;
      const cue = s.balls[0];
      cue.x = TW * 0.25; cue.y = TH / 2;
      cue.vx = 0; cue.vy = 0;
      cue.pocketed = false;
    }, 400);
  }

  _eightBallPocketed() {
    const s = this.state;
    const colored = s.balls.filter(b => b.id !== 0 && b.id !== 8);
    if (colored.every(b => b.pocketed)) {
      // Win!
      s.status = 'won';
      this._loop.stop();
      s.score += this.config?.scoring?.eightBallBonus ?? 200;
      const { best, isRecord } = ScoreService.submit(this._gameId(), s.score);
      EventBus.emit('game:won', { result:'win', icon:'🎱', title:'VICTOIRE !', score:s.score, best, isRecord });
    } else {
      // Too early, lose
      this._gameOver();
    }
  }

  _gameOver() {
    const s = this.state;
    s.status = 'over';
    this._loop.stop();
    const { best, isRecord } = ScoreService.submit(this._gameId(), s.score);
    EventBus.emit('game:over', { result:'lose', icon:'😓', title:'PARTIE PERDUE', score:s.score, best, isRecord });
  }

  _buildFullState() {
    return {
      status: 'idle', score: 0, pocketed: 0, fouls: 0, canSinkEight: false,
      balls: makeBalls(), aim: null, aimCur: null,
      TW, TH, BALL_R, POCKETS, POCKET_R,
    };
  }
}
