import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

export default class Nim extends BaseGame {
  constructor(config) {
    super(config);
    this.state = this._buildFullState();
  }

  _gameId() { return 'nim'; }

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
    this.state.piles  = [...this.config.gameplay.piles];
    EventBus.emit('game:tick', { state: this.state, action: 'play' });
  }

  restart() {
    this.state        = this._buildFullState();
    this.state.status = 'idle';
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  take(pileIndex, count) {
    const s = this.state;
    if (s.status !== 'playing' || s.turn !== 'player') return;
    if (count <= 0 || count > s.piles[pileIndex]) return;
    s.piles[pileIndex] -= count;
    s.turns++;
    if (this._allEmpty()) { this._win(); return; }
    s.turn = 'ai';
    EventBus.emit('game:tick', { state: s });
    setTimeout(() => this._aiMove(), this.config.gameplay.aiDelay);
  }

  _aiMove() {
    const s = this.state;
    if (s.status !== 'playing') return;
    const { pile, count } = this._nimStrategy(s.piles);
    s.piles[pile] -= count;
    s.turns++;
    if (this._allEmpty()) { this._lose(); return; }
    s.turn = 'player';
    EventBus.emit('game:tick', { state: s });
  }

  _nimStrategy(piles) {
    const nimSum = piles.reduce((a, b) => a ^ b, 0);
    if (nimSum === 0) {
      const i = piles.findIndex(p => p > 0);
      return { pile: i, count: 1 };
    }
    for (let i = 0; i < piles.length; i++) {
      const target = piles[i] ^ nimSum;
      if (target < piles[i]) return { pile: i, count: piles[i] - target };
    }
    const i = piles.findIndex(p => p > 0);
    return { pile: i, count: 1 };
  }

  _allEmpty() { return this.state.piles.every(p => p === 0); }

  _win() {
    const s   = this.state;
    s.status  = 'won';
    const pts = this.config.scoring.baseWin + s.turns * this.config.scoring.turnBonus;
    const { best, isRecord } = ScoreService.submit(this._gameId(), pts);
    EventBus.emit('game:won', {
      result: 'win', icon: '🏆', title: 'VICTOIRE !',
      score: pts, best, isRecord,
      extraInfo: `<div class="overlay-score">Tours joués : <strong>${s.turns}</strong></div>`
    });
  }

  _lose() {
    const s = this.state;
    s.status = 'over';
    EventBus.emit('game:over', {
      result: 'lose', icon: '💀', title: "L'IA GAGNE",
      score: 0, best: ScoreService.getBest(this._gameId()),
      extraInfo: `<div class="overlay-score">Tours joués : <strong>${s.turns}</strong></div>`
    });
  }

  _buildFullState() {
    return { status: 'idle', mode: 'basique', piles: [], turn: 'player', turns: 0 };
  }
}
