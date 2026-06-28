import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

// Standard dartboard sector order (clockwise from top)
const SECTORS = [20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5];
// Board radius for hit-testing (logical units matching renderer)
export const BOARD_R = 160;
const R_BULL50 = BOARD_R * 0.075;
const R_BULL25 = BOARD_R * 0.19;
const R_S1     = BOARD_R * 0.49;  // inner single outer
const R_TRIPLE = BOARD_R * 0.56;  // triple ring outer
const R_S2     = BOARD_R * 0.83;  // outer single outer
const R_DOUBLE = BOARD_R * 0.92;  // double ring outer

function sectorAt(angle) {
  // angle in radians, 0 = right; convert so 0 = top clockwise
  let deg = ((angle * 180 / Math.PI) + 90 + 360 + 9) % 360;
  return SECTORS[Math.floor(deg / 18) % 20];
}

function calcScore(dx, dy) {
  const r = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  if (r <= R_BULL50) return { pts: 50, label: 'Bullseye !' };
  if (r <= R_BULL25) return { pts: 25, label: 'Bull'       };
  const sec = sectorAt(angle);
  if (r <= R_S1)     return { pts: sec,     label: `${sec}`         };
  if (r <= R_TRIPLE) return { pts: sec * 3, label: `Triple ${sec}`  };
  if (r <= R_S2)     return { pts: sec,     label: `${sec}`         };
  if (r <= R_DOUBLE) return { pts: sec * 2, label: `Double ${sec}`  };
  return { pts: 0, label: 'Miss !' };
}

function applyDispersion(cx, cy, tx, ty, spread) {
  // Distance from center affects spread: further out = harder to be precise
  const distRatio = Math.hypot(tx - cx, ty - cy) / BOARD_R;
  const effective = spread * (0.7 + distRatio * 0.8); // scales from 0.7× to 1.5×
  // Gaussian-like via sum of two uniforms (Bell-ish, more realistic than flat disk)
  const r = ((Math.random() + Math.random()) / 2) * effective;
  const a = Math.random() * Math.PI * 2;
  return { x: tx + Math.cos(a) * r, y: ty + Math.sin(a) * r };
}

function aiPickTarget(remaining) {
  if (remaining > 61) return { angle: -Math.PI / 2, r: BOARD_R * 0.52 }; // aim T20
  if (remaining > 40) {
    const sec = Math.min(20, remaining);
    const idx = SECTORS.indexOf(sec) !== -1 ? SECTORS.indexOf(sec) : 0;
    const angle = (-Math.PI / 2) + (idx + 0.5) * (Math.PI * 2 / 20);
    return { angle, r: BOARD_R * 0.88 }; // double
  }
  // aim bull
  return { angle: 0, r: 0 };
}

export default class Flechettes extends BaseGame {
  constructor(config) {
    super(config);
    this.state = null;
  }

  _gameId() { return 'flechettes'; }

  async init() {
    this._setupEventBusBindings();
    this.state = this._buildFullState();
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() { super.destroy(); }

  start(options = {}) {
    this.state = this._buildFullState();
    this.state.status = 'playing';
    EventBus.emit('game:tick', { state: this.state, action: 'play' });
  }

  restart() {
    this.state = this._buildFullState();
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  // Called by renderer when player clicks board
  // cx,cy = board center in logical coords; tx,ty = click position
  throwDart(cx, cy, tx, ty) {
    const s = this.state;
    if (s.status !== 'playing' || s.turn !== 'player' || s.dartsLeft <= 0) return;

    const spread = this.config?.gameplay?.playerSpread ?? 24;
    const hit    = applyDispersion(cx, cy, tx, ty, spread);
    this._registerThrow(s, 'player', hit.x - cx, hit.y - cy, hit.x, hit.y);
  }

  _registerThrow(s, side, dx, dy, hitX, hitY) {
    const { pts, label } = calcScore(dx, dy);
    const score = s[`${side}Score`];
    const newScore = score - pts;

    let bust = false;
    if (newScore < 0) {
      bust = true;
    } else {
      s[`${side}Score`] = newScore;
      s.score = 501 - s.playerScore;
    }

    s.throws.push({ side, pts: bust ? 0 : pts, label: bust ? 'Bust !' : label, hitX, hitY, bust });
    s.dartsLeft--;

    EventBus.emit('game:tick', { state: s, action: 'throw', last: s.throws[s.throws.length - 1] });

    if (!bust && newScore === 0) {
      this._win(side);
      return;
    }

    if (s.dartsLeft <= 0) {
      if (side === 'player') {
        s.turn = 'ai';
        s.dartsLeft = 3;
        s.roundThrows = [];
        setTimeout(() => this._aiTurn(), 700);
      } else {
        s.turn = 'player';
        s.dartsLeft = 3;
        s.roundThrows = [];
        EventBus.emit('game:tick', { state: s, action: 'player-turn' });
      }
    }
  }

  _aiTurn() {
    const s = this.state;
    if (s.status !== 'playing') return;

    const spread = this.config?.gameplay?.aiSpread ?? 28;
    const target = aiPickTarget(s.aiScore);
    const cx = 0, cy = 0;
    const tx = Math.cos(target.angle) * target.r;
    const ty = Math.sin(target.angle) * target.r;
    const hit = applyDispersion(cx, cy, tx, ty, spread);

    this._registerThrow(s, 'ai', hit.x, hit.y, hit.x, hit.y);

    if (s.status === 'playing' && s.turn === 'ai' && s.dartsLeft > 0) {
      setTimeout(() => this._aiTurn(), 650);
    }
  }

  _win(side) {
    const s = this.state;
    s.status = 'over';
    const playerWon = side === 'player';
    s.score = playerWon ? 501 : 0;
    const { best, isRecord } = ScoreService.submit(this._gameId(), s.score);
    const ev = playerWon ? 'game:won' : 'game:over';
    EventBus.emit(ev, {
      result: playerWon ? 'win' : 'lose',
      icon: playerWon ? '🎯' : '😤',
      title: playerWon ? 'BULLSEYE !' : 'L\'IA GAGNE',
      score: s.score, best, isRecord,
      extraInfo: `<div class="overlay-score">Joueur : ${s.playerScore} restants · IA : ${s.aiScore} restants</div>`,
    });
  }

  _buildFullState() {
    return {
      status: 'idle',
      playerScore: 501,
      aiScore: 501,
      score: 0,
      turn: 'player',
      dartsLeft: 3,
      throws: [],
      roundThrows: [],
    };
  }
}
