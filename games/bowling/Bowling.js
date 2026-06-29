import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

// Pin positions (normalized 0-1) — standard triangle layout
const PIN_POS = [
  { x: 0.50, y: 0.20 }, // pin 1  (front)
  { x: 0.44, y: 0.30 }, // pin 2
  { x: 0.56, y: 0.30 }, // pin 3
  { x: 0.38, y: 0.40 }, // pin 4
  { x: 0.50, y: 0.40 }, // pin 5
  { x: 0.62, y: 0.40 }, // pin 6
  { x: 0.32, y: 0.50 }, // pin 7
  { x: 0.44, y: 0.50 }, // pin 8
  { x: 0.56, y: 0.50 }, // pin 9
  { x: 0.68, y: 0.50 }, // pin 10
];

// Which pins can cascade-knock which others (rough adjacency)
const CASCADE = [
  [1, 2],     // 0→1,2
  [3, 4],     // 1→3,4
  [4, 5],     // 2→4,5
  [6, 7],     // 3→6,7
  [7, 8],     // 4→7,8
  [8, 9],     // 5→8,9
  [], [], [], [],
];

function freshPins() { return new Array(10).fill(true); }

function calcScore(frames) {
  // flatten rolls for bonus lookup
  const allRolls = [];
  for (const f of frames) allRolls.push(...f.rolls);

  let total = 0;
  let ri = 0; // roll index into allRolls
  for (let f = 0; f < 10; f++) {
    if (!frames[f] || frames[f].rolls.length === 0) break;
    if (f === 9) {
      total += frames[f].rolls.reduce((s, r) => s + r, 0);
      break;
    }
    if (frames[f].rolls[0] === 10) {
      total += 10 + (allRolls[ri + 1] ?? 0) + (allRolls[ri + 2] ?? 0);
      ri += 1;
    } else if (frames[f].rolls.length >= 2 && frames[f].rolls[0] + frames[f].rolls[1] === 10) {
      total += 10 + (allRolls[ri + 2] ?? 0);
      ri += 2;
    } else {
      total += frames[f].rolls.reduce((s, r) => s + r, 0);
      ri += frames[f].rolls.length;
    }
  }
  return total;
}

export default class Bowling extends BaseGame {
  constructor(config) {
    super(config);
    this.state   = null;
    this._tid    = null;
  }

  _gameId() { return 'bowling'; }

  _buildFullState() {
    return {
      status:      'idle',
      phase:       'aiming', // aiming | throwing | settling
      frame:       0,
      rollInFrame: 0,
      pins:        freshPins(),
      frames:      Array.from({ length: 10 }, () => ({ rolls: [] })),
      totalScore:  0,
      aimAngle:    0,   // radians, 0 = straight up
      ball:        { x: 0.5, y: 0.85, vx: 0, vy: 0, active: false },
      lastKnocked: 0,
      message:     '',
    };
  }

  async init() {
    this._setupEventBusBindings();
    this.state = this._buildFullState();
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  start() {
    const s = this.state;
    s.status  = 'playing';
    s.message = 'Déplacez la souris pour viser, cliquez pour lancer !';
    EventBus.emit('game:tick', { state: s, action: 'play' });
  }

  setAim(angle) {
    if (this.state.status !== 'playing' || this.state.phase !== 'aiming') return;
    this.state.aimAngle = Math.max(-0.5, Math.min(0.5, angle));
    EventBus.emit('game:tick', { state: this.state });
  }

  throw() {
    const s = this.state;
    if (s.status !== 'playing' || s.phase !== 'aiming') return;
    s.phase = 'throwing';
    s.ball  = { x: 0.5, y: 0.85, active: true };
    EventBus.emit('game:tick', { state: s });
    this._resolveThrow();
  }

  _resolveThrow() {
    const s = this.state;
    const spread    = (Math.random() - 0.5) * 0.05;
    const entryX    = 0.5 + Math.tan(s.aimAngle + spread) * 0.25;
    const hitRadius = 0.09;

    // Direct hits
    const toKnock = new Set();
    for (let i = 0; i < 10; i++) {
      if (s.pins[i] && Math.abs(PIN_POS[i].x - entryX) < hitRadius) toKnock.add(i);
    }

    // Cascade
    let changed = true;
    while (changed) {
      changed = false;
      for (const pi of [...toKnock]) {
        for (const adj of CASCADE[pi]) {
          if (s.pins[adj] && !toKnock.has(adj) && Math.random() < 0.65) {
            toKnock.add(adj);
            changed = true;
          }
        }
      }
    }

    const knocked = toKnock.size;
    s.lastKnocked = knocked;

    // Animate ball travel (1s), then settle pins
    this._tid = setTimeout(() => {
      toKnock.forEach(i => { s.pins[i] = false; });
      s.ball.active = false;
      s.phase = 'settling';
      this._recordRoll(knocked);
    }, 900);
  }

  _recordRoll(knocked) {
    const s     = this.state;
    const frame = s.frames[s.frame];
    frame.rolls.push(knocked);

    const standingBefore = s.rollInFrame === 0 ? 10 : (10 - (s.frames[s.frame].rolls[0] ?? 0));
    const isStrike = s.rollInFrame === 0 && knocked === 10;
    const totalDown = frame.rolls.reduce((a, b) => a + b, 0);
    const isSpare  = s.rollInFrame === 1 && totalDown === 10 && !isStrike;

    if (isStrike)     s.message = '🎳 STRIKE ! Excellent !';
    else if (isSpare) s.message = '✅ SPARE ! Bien joué !';
    else s.message = `${knocked} quille${knocked !== 1 ? 's' : ''} renversée${knocked !== 1 ? 's' : ''}`;

    s.totalScore = calcScore(s.frames);
    EventBus.emit('game:tick', { state: s });

    this._tid = setTimeout(() => this._advance(isStrike, isSpare), 1200);
  }

  _advance(isStrike, isSpare) {
    const s = this.state;
    const f = s.frame;

    if (f === 9) {
      const rolls = s.frames[9].rolls;
      const hasBonus = rolls[0] === 10 || (rolls.length >= 2 && rolls[0] + rolls[1] === 10);
      const done = rolls.length === 3 || (rolls.length === 2 && !hasBonus);
      if (done) { this._endGame(); return; }

      // Fresh rack after strike or spare in 10th
      if (rolls.length === 1 && rolls[0] === 10) s.pins = freshPins();
      else if (rolls.length === 2 && rolls[0] === 10 && rolls[1] === 10) s.pins = freshPins();
      else if (rolls.length === 2 && rolls[0] + rolls[1] === 10 && rolls[0] !== 10) s.pins = freshPins();

      s.rollInFrame = rolls.length;
      s.phase = 'aiming';
      s.message = s.rollInFrame === 2 ? 'Dernier lancer !' : 'Lancer bonus !';
      EventBus.emit('game:tick', { state: s });
      return;
    }

    if (isStrike || s.rollInFrame === 1) {
      s.frame++;
      s.rollInFrame = 0;
      s.pins = freshPins();
      s.message = `Frame ${s.frame + 1} / 10`;
    } else {
      s.rollInFrame = 1;
      s.message = `${s.pins.filter(Boolean).length} quilles restantes`;
    }

    s.phase = 'aiming';
    EventBus.emit('game:tick', { state: s });
  }

  _endGame() {
    const s = this.state;
    s.status     = 'over';
    s.phase      = 'over';
    s.totalScore = calcScore(s.frames);
    s.message    = `Score final : ${s.totalScore} / 300`;
    ScoreService.submit(this._gameId(), s.totalScore);
    EventBus.emit('game:tick', { state: s });
    EventBus.emit('game:over', { score: s.totalScore });
  }

  restart() {
    if (this._tid) { clearTimeout(this._tid); this._tid = null; }
    this.state = this._buildFullState();
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  destroy() {
    if (this._tid) { clearTimeout(this._tid); this._tid = null; }
    super.destroy();
  }
}

