import EventBus    from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

export default class LightsOut extends BaseGame {
  constructor(config) {
    super(config);
    this.state = this._buildFullState();
  }

  _gameId() { return 'lights-out'; }

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
    this._initGrid();
    EventBus.emit('game:tick', { state: this.state, action: 'play' });
  }

  restart() {
    this.state        = this._buildFullState();
    this.state.status = 'idle';
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  _initGrid() {
    const n = this.config.gameplay.size;
    const s = this.state;
    s.size  = n;
    s.grid  = Array.from({ length: n }, () => new Array(n).fill(0));
    const moves = this.config.gameplay.shuffleMoves;
    for (let i = 0; i < moves; i++) {
      const r = Math.floor(Math.random() * n);
      const c = Math.floor(Math.random() * n);
      this._toggle(r, c, false);
    }
    if (this._isSolved()) this._initGrid();
  }

  _toggle(r, c, countMove = true) {
    const s = this.state;
    const n = s.size;
    const flip = (row, col) => {
      if (row >= 0 && row < n && col >= 0 && col < n) s.grid[row][col] ^= 1;
    };
    flip(r, c); flip(r-1, c); flip(r+1, c); flip(r, c-1); flip(r, c+1);
    if (countMove) {
      s.moves++;
      EventBus.emit('game:tick', { state: s });
      if (this._isSolved()) this._win();
    }
  }

  clickCell(r, c) {
    if (this.state.status !== 'playing') return;
    this._toggle(r, c, true);
  }

  _isSolved() {
    return this.state.grid.every(row => row.every(v => v === 0));
  }

  _win() {
    const s   = this.state;
    s.status  = 'won';
    const sc  = this.config.scoring;
    const pts = Math.max(0, sc.baseWin - s.moves * sc.movePenalty);
    const { best, isRecord } = ScoreService.submit(this._gameId(), pts);
    EventBus.emit('game:won', {
      result: 'win', icon: '💡', title: 'ÉTEINT !',
      score: pts, best, isRecord,
      extraInfo: `<div class="overlay-score">Coups : <strong>${s.moves}</strong></div>`
    });
  }

  _buildFullState() {
    return {
      status: 'idle', mode: 'basique',
      size: this.config.gameplay.size,
      grid: [], moves: 0
    };
  }
}
