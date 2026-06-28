import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

export default class DotsAndBoxes extends BaseGame {
  constructor(config) {
    super(config);
    this.state = this._buildFullState();
  }

  _gameId() { return 'dots-and-boxes'; }

  async init() {
    this._setupEventBusBindings();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() { super.destroy(); }

  start(options = {}) {
    this.state        = this._buildFullState();
    this.state.status = 'playing';
    this.state.mode   = options.mode ?? 'basique';
    EventBus.emit('game:tick', { state: this.state, action: 'play' });
  }

  restart() {
    this.state        = this._buildFullState();
    this.state.status = 'idle';
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  // Player draws a line. type='h'|'v', r/c = grid indices.
  drawLine(type, r, c) {
    const s = this.state;
    if (s.status !== 'playing' || s.turn !== 'player') return false;
    if (!this._canDraw(s, type, r, c)) return false;

    const scored = this._applyLine(s, type, r, c, 0);
    if (!scored) s.turn = 'ai';

    EventBus.emit('game:tick', { state: s, action: 'line' });

    if (!this._checkEnd(s) && s.turn === 'ai') {
      setTimeout(() => this._aiTurn(), 420);
    }
    return true;
  }

  _aiTurn() {
    const s = this.state;
    if (s.status !== 'playing' || s.turn !== 'ai') return;

    const move   = this._findAIMove(s);
    const scored = this._applyLine(s, move.type, move.r, move.c, 1);
    if (!scored) s.turn = 'player';

    EventBus.emit('game:tick', { state: s, action: 'ai' });

    if (!this._checkEnd(s) && s.turn === 'ai') {
      setTimeout(() => this._aiTurn(), 420);
    }
  }

  _findAIMove(s) {
    const moves = this._allMoves(s);

    // 1. Complete a box immediately
    const winning = moves.filter(m => this._completions(s, m) > 0);
    if (winning.length) return winning[0];

    // 2. Safe moves — don't create 3-sided boxes
    const safe = moves.filter(m => !this._givesFreeBox(s, m));
    if (safe.length) return safe[Math.floor(Math.random() * safe.length)];

    // 3. Forced sacrifice — pick move giving opponent fewest boxes
    return moves.reduce((best, m) => {
      const give = this._affected(m, s.n).filter(([br, bc]) =>
        s.boxes[br][bc] === -1 && this._sides(s, br, bc) === 3).length;
      const bGive = this._affected(best, s.n).filter(([br, bc]) =>
        s.boxes[br][bc] === -1 && this._sides(s, br, bc) === 3).length;
      return give < bGive ? m : best;
    });
  }

  _allMoves(s) {
    const n = s.n, moves = [];
    for (let r = 0; r <= n; r++) for (let c = 0; c < n; c++) if (!s.hLines[r][c]) moves.push({ type: 'h', r, c });
    for (let r = 0; r < n; r++) for (let c = 0; c <= n; c++) if (!s.vLines[r][c]) moves.push({ type: 'v', r, c });
    return moves;
  }

  _completions(s, m) {
    return this._affected(m, s.n).filter(([r, c]) => s.boxes[r][c] === -1 && this._sides(s, r, c) === 3).length;
  }

  _givesFreeBox(s, m) {
    return this._affected(m, s.n).some(([r, c]) => s.boxes[r][c] === -1 && this._sides(s, r, c) === 2);
  }

  _affected({ type, r, c }, n) {
    if (type === 'h') {
      const res = [];
      if (r > 0)   res.push([r - 1, c]);
      if (r < n)   res.push([r, c]);
      return res;
    }
    const res = [];
    if (c > 0)   res.push([r, c - 1]);
    if (c < n)   res.push([r, c]);
    return res;
  }

  _sides(s, r, c) {
    return (+s.hLines[r][c]) + (+s.hLines[r + 1][c]) + (+s.vLines[r][c]) + (+s.vLines[r][c + 1]);
  }

  _canDraw(s, type, r, c) {
    return type === 'h' ? !s.hLines[r]?.[c] : !s.vLines[r]?.[c];
  }

  _applyLine(s, type, r, c, player) {
    if (type === 'h') s.hLines[r][c] = true;
    else              s.vLines[r][c] = true;

    let scored = false;
    for (const [br, bc] of this._affected({ type, r, c }, s.n)) {
      if (s.boxes[br][bc] === -1 && this._sides(s, br, bc) === 4) {
        s.boxes[br][bc] = player;
        s.scores[player]++;
        scored = true;
      }
    }
    return scored;
  }

  _checkEnd(s) {
    const total = s.n * s.n;
    if (s.scores[0] + s.scores[1] < total) return false;

    const [p, ai] = s.scores;
    s.status = p > ai ? 'won' : p < ai ? 'over' : 'draw';

    const pts    = p * this.config.scoring.boxValue + (p > ai ? this.config.scoring.winBonus : 0);
    const { best, isRecord } = ScoreService.submit(this._gameId(), pts);
    const event  = s.status === 'won' ? 'game:won' : 'game:over';

    EventBus.emit(event, {
      result:    p > ai ? 'win' : p < ai ? 'lose' : 'draw',
      icon:      p > ai ? '🎉' : p < ai ? '😢' : '🤝',
      title:     p > ai ? 'VICTOIRE !' : p < ai ? 'DEFAITE' : 'EGALITE !',
      score: pts, best, isRecord,
      extraInfo: `<div class="overlay-score">Toi : <strong>${p}</strong> carres &mdash; IA : <strong>${ai}</strong> carres</div>`,
    });
    return true;
  }

  _buildFullState() {
    const n = this.config?.gameplay?.gridSize ?? 4;
    return {
      status: 'idle', mode: 'basique', n,
      hLines: Array.from({ length: n + 1 }, () => Array(n).fill(false)),
      vLines: Array.from({ length: n }, () => Array(n + 1).fill(false)),
      boxes:  Array.from({ length: n }, () => Array(n).fill(-1)),
      scores: [0, 0],
      turn: 'player',
    };
  }
}
