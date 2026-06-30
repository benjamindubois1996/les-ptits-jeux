import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import GameLoop     from '../../js/core/GameLoop.js';

const UPGRADES = [
  { id: 'better-click',   name: 'Meilleur Clic',     emoji: '👆', desc: '+1 par clic',       baseCost: 10,     costMult: 1.15, clickBonus: 1,   passiveBonus: 0   },
  { id: 'auto-collector', name: 'Collecteur Auto',    emoji: '🤖', desc: '+1/s passif',        baseCost: 50,     costMult: 1.2,  clickBonus: 0,   passiveBonus: 1   },
  { id: 'golden-finger',  name: 'Doigt Doré',         emoji: '✨', desc: '+5 par clic',        baseCost: 200,    costMult: 1.3,  clickBonus: 5,   passiveBonus: 0   },
  { id: 'coin-factory',   name: 'Usine à Pièces',     emoji: '🏭', desc: '+5/s passif',        baseCost: 500,    costMult: 1.25, clickBonus: 0,   passiveBonus: 5   },
  { id: 'mega-clicker',   name: 'Méga Cliquer',       emoji: '💪', desc: '+20 par clic',       baseCost: 2000,   costMult: 1.35, clickBonus: 20,  passiveBonus: 0   },
  { id: 'crypto-miner',   name: 'Crypto Mineur',      emoji: '⛏️', desc: '+20/s passif',       baseCost: 5000,   costMult: 1.3,  clickBonus: 0,   passiveBonus: 20  },
  { id: 'time-machine',   name: 'Machine Temporelle', emoji: '⏰', desc: '×2 revenus passifs', baseCost: 20000,  costMult: 1.5,  clickBonus: 0,   passiveBonus: 0,  passiveMult: 2 },
  { id: 'universe',       name: "L'Univers",          emoji: '🌌', desc: '+500/s passif',      baseCost: 100000, costMult: 2,    clickBonus: 0,   passiveBonus: 500 },
];

export default class IdleClicker extends BaseGame {
  constructor(config) {
    super(config);
    this.state = null;
    this._loop = new GameLoop(this._tick.bind(this));
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  _gameId() { return 'idle-clicker'; }

  _buildFullState() {
    return {
      status: 'idle',
      coins: 0,
      totalEarned: 0,
      coinsPerClick: 1,
      coinsPerSecond: 0,
      upgrades: UPGRADES.map(u => ({ ...u, owned: 0, currentCost: u.baseCost })),
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
    this._loop.start(1000);
    EventBus.emit('game:tick', { state: s, action: 'play' });
  }

  _tick() {
    const s = this.state;
    if (s.status !== 'playing') return;
    const earned = s.coinsPerSecond;
    s.coins       += earned;
    s.totalEarned += earned;
    ScoreService.submit(this._gameId(), Math.floor(s.totalEarned));
    EventBus.emit('game:tick', { state: s, action: 'tick' });
  }

  click() {
    const s = this.state;
    if (s.status !== 'playing') return;
    s.coins       += s.coinsPerClick;
    s.totalEarned += s.coinsPerClick;
    ScoreService.submit(this._gameId(), Math.floor(s.totalEarned));
    EventBus.emit('game:tick', { state: s, action: 'click' });
  }

  buyUpgrade(id) {
    const s = this.state;
    if (s.status !== 'playing') return false;
    const upg = s.upgrades.find(u => u.id === id);
    if (!upg || s.coins < upg.currentCost) return false;
    s.coins -= upg.currentCost;
    upg.owned++;
    upg.currentCost = Math.ceil(upg.baseCost * Math.pow(upg.costMult, upg.owned));
    this._recomputeStats(s);
    EventBus.emit('game:tick', { state: s, action: 'upgrade' });
    return true;
  }

  _recomputeStats(s) {
    let cpc = 1, cps = 0, passiveMult = 1;
    for (const u of s.upgrades) {
      if (!u.owned) continue;
      if (u.passiveMult) passiveMult *= Math.pow(u.passiveMult, u.owned);
      cpc += (u.clickBonus   || 0) * u.owned;
      cps += (u.passiveBonus || 0) * u.owned;
    }
    s.coinsPerClick  = cpc;
    s.coinsPerSecond = Math.round(cps * passiveMult * 10) / 10;
  }

  _bindControls() {
    document.addEventListener('keydown', this._onKeyDown);
  }

  _unbindControls() {
    document.removeEventListener('keydown', this._onKeyDown);
  }

  _onKeyDown(e) {
    if (e.key === 'p' || e.key === 'P') EventBus.emit('game:pause-toggle');
    if (e.key === 'r' || e.key === 'R') EventBus.emit('game:restart');
  }

  _onPause()  { this._loop.stop(); }
  _onResume() { this._loop.start(1000); }

  restart() {
    this._loop.stop();
    this.state = this._buildFullState();
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  destroy() {
    this._loop.destroy();
    this._unbindControls();
    super.destroy();
  }
}
