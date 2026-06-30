import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import GameLoop     from '../../js/core/GameLoop.js';

const TICK_MS = 3000; // 3 real seconds = 1 game hour
const PET_NAMES = ['Pixi', 'Blobby', 'Zuzu', 'Mochi', 'Doki', 'Coco'];

function rndName() { return PET_NAMES[Math.floor(Math.random() * PET_NAMES.length)]; }

export default class Tamagotchi extends BaseGame {
  constructor(config) {
    super(config);
    this.state = null;
    this._loop = new GameLoop(this._tick.bind(this));
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  _gameId() { return 'tamagotchi'; }

  _buildFullState() {
    return {
      status: 'idle',
      pet: {
        name:      rndName(),
        hunger:    100,
        happiness: 100,
        energy:    100,
        age:       0,
        sleeping:  false,
        mood:      'happy',
      },
      score:   0,
      message: '',
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
    s.pet.name = rndName();
    s.message  = `${s.pet.name} est né · Prends-en soin !`;
    this._loop.start(TICK_MS);
    EventBus.emit('game:tick', { state: s, action: 'play' });
  }

  _tick() {
    const s = this.state;
    if (s.status !== 'playing') return;
    const p = s.pet;

    p.age++;

    if (p.sleeping) {
      p.energy    = Math.min(100, p.energy    + 25);
      p.hunger    = Math.max(0,   p.hunger    - 3);
      p.happiness = Math.max(0,   p.happiness - 1);
      if (p.energy >= 100) {
        p.sleeping = false;
        s.message  = `${p.name} se réveille, plein d'énergie !`;
      }
    } else {
      p.hunger    = Math.max(0, p.hunger    - 8);
      p.happiness = Math.max(0, p.happiness - 5);
      p.energy    = Math.max(0, p.energy    - 6);
    }

    p.mood  = this._computeMood(p);
    s.score = p.age;

    if (p.hunger <= 0 || p.happiness <= 0 || p.energy <= 0) {
      const why = p.hunger <= 0 ? 'faim' : p.happiness <= 0 ? 'tristesse' : 'épuisement';
      s.message = `${p.name} est mort de ${why}…`;
      s.status  = 'over';
      this._loop.stop();
      const res = ScoreService.submit(this._gameId(), s.score);
      EventBus.emit('game:over', { score: s.score, best: res.best, isRecord: res.isRecord });
      return;
    }

    ScoreService.submit(this._gameId(), s.score);
    EventBus.emit('game:tick', { state: s, action: 'tick' });
  }

  _computeMood(p) {
    const avg = (p.hunger + p.happiness + p.energy) / 3;
    if (avg >= 80) return 'happy';
    if (avg >= 55) return 'ok';
    if (avg >= 30) return 'sad';
    return 'critical';
  }

  feed() {
    const s = this.state;
    if (s.status !== 'playing' || s.pet.sleeping) return;
    const p = s.pet;
    p.hunger    = Math.min(100, p.hunger    + 30);
    p.energy    = Math.max(0,   p.energy    - 3);
    p.happiness = Math.min(100, p.happiness + 5);
    p.mood      = this._computeMood(p);
    s.message   = `${p.name} mange avec appétit !`;
    EventBus.emit('game:tick', { state: s, action: 'action' });
  }

  play() {
    const s = this.state;
    if (s.status !== 'playing' || s.pet.sleeping) return;
    const p = s.pet;
    if (p.energy < 15) {
      s.message = `${p.name} est trop fatigué pour jouer !`;
      EventBus.emit('game:tick', { state: s, action: 'action' });
      return;
    }
    p.happiness = Math.min(100, p.happiness + 25);
    p.hunger    = Math.max(0,   p.hunger    - 10);
    p.energy    = Math.max(0,   p.energy    - 10);
    p.mood      = this._computeMood(p);
    s.message   = `${p.name} joue et s'amuse !`;
    EventBus.emit('game:tick', { state: s, action: 'action' });
  }

  sleep() {
    const s = this.state;
    if (s.status !== 'playing') return;
    const p = s.pet;
    p.sleeping = !p.sleeping;
    s.message  = p.sleeping
      ? `${p.name} s'endort… 💤`
      : `${p.name} se réveille !`;
    EventBus.emit('game:tick', { state: s, action: 'action' });
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
  _onResume() { this._loop.start(TICK_MS); }

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
