import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import GameLoop     from '../../js/core/GameLoop.js';

const SYMBOLS = [
  '⭐','🌙','☀️','🔥','💧','🌊','🌿','🍀','🌸','🦋',
  '🐝','🐸','🦊','🦁','🐯','🐻','🦄','🐲','🌈','⚡',
  '🎭','🎨','🎯','🎲','🎸','🥁','🏆','💎','🚀','✈️',
  '🎈','🎃','🌺','🍁','🍄','🔮','🌀','🧩','🗝️','🧊',
  '🌋','🎺','🎪','🎡','🎠','🧲','🎋','🌵','🦀','🦞',
];

const CARD_SIZE    = 8;
const GAME_SECONDS = 60;
const WRONG_PENALTY = 3; // secondes perdues par mauvais clic
const CORRECT_PTS   = 10;
const SPEED_BONUS   = 2; // pts bonus si réponse < 2s

function buildRound() {
  const pool = [...SYMBOLS].sort(() => Math.random() - 0.5);
  const deckCard = pool.slice(0, CARD_SIZE);
  const match    = deckCard[Math.floor(Math.random() * CARD_SIZE)];
  const rest     = pool.slice(CARD_SIZE);
  const handCard = [match, ...rest.slice(0, CARD_SIZE - 1)].sort(() => Math.random() - 0.5);
  return {
    deck:  [...deckCard].sort(() => Math.random() - 0.5),
    hand:  handCard,
    match,
  };
}

export default class Dobble extends BaseGame {
  constructor(config) {
    super(config);
    this.state      = null;
    this._loop      = new GameLoop(this._tick.bind(this));
    this._lastTick  = null;
  }

  _gameId() { return 'dobble'; }

  _buildFullState() {
    return {
      status:       'idle',
      score:        0,
      round:        0,
      timeLeft:     GAME_SECONDS,
      wrongFlashMs: 0,     // ms restantes pour l'effet rouge
      roundStartMs: 0,     // timestamp de début du round (pour speed bonus)
      currentRound: null,
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
    s.status       = 'playing';
    s.currentRound = buildRound();
    s.roundStartMs = performance.now();
    this._lastTick = null;
    this._loop.start(1000 / 30);
    EventBus.emit('game:tick', { state: s, action: 'play' });
  }

  guess(symbol) {
    const s = this.state;
    if (s.status !== 'playing') return;

    if (symbol === s.currentRound.match) {
      const elapsed = (performance.now() - s.roundStartMs) / 1000;
      const bonus   = elapsed < 2 ? SPEED_BONUS : 0;
      s.score += CORRECT_PTS + bonus;
      s.round++;
      s.currentRound = buildRound();
      s.roundStartMs = performance.now();
      ScoreService.update(this._gameId(), s.score);
      EventBus.emit('game:tick', { state: s, action: 'correct' });
    } else {
      s.timeLeft     = Math.max(0, s.timeLeft - WRONG_PENALTY);
      s.wrongFlashMs = 500;
      EventBus.emit('game:tick', { state: s, action: 'wrong' });
    }
  }

  _tick() {
    const now = performance.now();
    if (this._lastTick === null) this._lastTick = now;
    const dt = Math.min(now - this._lastTick, 100);
    this._lastTick = now;

    const s = this.state;
    if (s.status !== 'playing') return;

    s.timeLeft     = Math.max(0, s.timeLeft - dt / 1000);
    s.wrongFlashMs = Math.max(0, s.wrongFlashMs - dt);

    if (s.timeLeft <= 0) { this._endGame(); return; }
    EventBus.emit('game:tick', { state: s, action: 'tick' });
  }

  _endGame() {
    const s = this.state;
    s.status   = 'over';
    s.timeLeft = 0;
    this._loop.stop();
    const best = ScoreService.update(this._gameId(), s.score);
    EventBus.emit('game:over', { score: s.score, best });
  }

  restart() {
    this._loop.stop();
    this.state = this._buildFullState();
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  destroy() {
    this._loop.stop();
    super.destroy();
  }
}
