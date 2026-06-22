import EventBus    from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import GameLoop     from '../../js/core/GameLoop.js';
import { randInt, randChoice } from '../../js/utils/Random.js';

const WORDS = [
  'chat','chien','arbre','maison','voiture','soleil','lune','étoile','livre','table',
  'chaise','fenêtre','porte','jardin','fleur','rivière','montagne','nuage','pluie','vent',
  'feu','eau','terre','ciel','nuit','jour','vache','lapin','oiseau','poisson',
  'pain','lait','sucre','sel','huile','beurre','farine','soupe','viande','fruit',
  'rouge','bleu','vert','jaune','blanc','noir','rose','violet','orange','gris',
  'petit','grand','rapide','lent','fort','doux','chaud','froid','haut','bas',
  'marcher','courir','sauter','nager','voler','tomber','lever','dormir','manger','boire',
  'bonjour','merci','pardon','amour','espoir','bonheur','lumière','chemin','voyage','rêve',
  'forêt','désert','océan','plage','ville','route','pont','tour','château','village',
  'musique','danse','chanson','peinture','dessin','roman','poème','théâtre','cinéma','jeu',
];

export default class TypingRush extends BaseGame {
  constructor(config) {
    super(config);
    this.state   = this._buildFullState();
    this._loop   = new GameLoop(() => this._tick());
    this._spawnTimer = null;
    this._nextId = 0;
  }

  _gameId() { return 'typing-rush'; }

  async init() {
    this._setupEventBusBindings();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() {
    super.destroy();
    this._loop.stop();
    clearTimeout(this._spawnTimer);
  }

  start(options = {}) {
    this._loop.stop();
    clearTimeout(this._spawnTimer);
    this._nextId = 0;
    const lanes = this.config.gameplay.laneCount;
    this.state = {
      ...this._buildFullState(),
      status:  'playing',
      mode:    options.mode ?? 'basique',
      words:   [],
      typed:   '',
      score:   0,
      combo:   0,
      speed:   this.config.gameplay.startSpeed,
      spawnInterval: this.config.gameplay.spawnIntervalBase,
    };
    this.lives.reset();
    EventBus.emit('game:score-update', { score: 0 });
    EventBus.emit('game:tick', { state: this.state, action: 'new-game' });
    this._loop.start(16);
    this._scheduleSpawn();
  }

  restart() {
    this._loop.stop();
    clearTimeout(this._spawnTimer);
    this.state = { ...this._buildFullState(), status: 'idle' };
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  type(char) {
    if (this.state.status !== 'playing') return;
    if (char === 'Backspace') {
      this.state.typed = this.state.typed.slice(0, -1);
    } else if (char === 'Enter') {
      this._tryMatch();
    } else if (char.length === 1) {
      this.state.typed += char;
      this._tryMatch();
    }
    EventBus.emit('game:tick', { state: this.state, action: 'type' });
  }

  _tryMatch() {
    const typed = this.state.typed.toLowerCase();
    const idx   = this.state.words.findIndex(w => w.text.toLowerCase() === typed);
    if (idx === -1) return;
    const word = this.state.words.splice(idx, 1)[0];
    this.state.typed  = '';
    this.state.combo++;
    const pts = word.text.length * this.config.scoring.perChar
              + this.state.combo * this.config.scoring.combo;
    this.state.score += pts;
    EventBus.emit('game:score-update', { score: this.state.score });
    EventBus.emit('game:tick', { state: this.state, action: 'match', word });
    // Increase difficulty
    this.state.speed         = Math.min(this.config.gameplay.maxSpeed, this.state.speed + 0.4);
    this.state.spawnInterval = Math.max(this.config.gameplay.spawnIntervalMin, this.state.spawnInterval - 30);
  }

  _tick() {
    if (this.state.status !== 'playing') return;
    const dt  = 16 / 1000;
    const hit = [];
    for (const w of this.state.words) {
      w.y += this.state.speed * dt;
      if (w.y >= 100) hit.push(w);
    }
    if (hit.length) {
      for (const w of hit) {
        this.state.words = this.state.words.filter(x => x !== w);
        this.state.combo = 0;
        this.lives.lose();
        if (this.lives.count <= 0) { this._gameOver(); return; }
        EventBus.emit('game:lives-update', { lives: this.lives.count });
      }
    }
    EventBus.emit('game:tick', { state: this.state, action: 'tick' });
  }

  _scheduleSpawn() {
    if (this.state.status !== 'playing') return;
    this._spawnTimer = setTimeout(() => {
      if (this.state.status !== 'playing') return;
      this._spawnWord();
      this._scheduleSpawn();
    }, this.state.spawnInterval);
  }

  _spawnWord() {
    const minLen = this.config.gameplay.wordLengthMin;
    const maxLen = Math.min(this.config.gameplay.wordLengthMax, minLen + Math.floor(this.state.score / 200));
    const pool   = WORDS.filter(w => w.length >= minLen && w.length <= maxLen
      && !this.state.words.find(x => x.text === w));
    if (!pool.length) return;
    const text = randChoice(pool);
    const lanes = this.config.gameplay.laneCount;
    const lane  = randInt(lanes);
    this.state.words.push({ id: this._nextId++, text, y: 0, lane });
    EventBus.emit('game:tick', { state: this.state, action: 'spawn' });
  }

  _gameOver() {
    this._loop.stop();
    clearTimeout(this._spawnTimer);
    this.state.status = 'over';
    const { best } = ScoreService.submit(this._gameId(), this.state.score);
    EventBus.emit('game:over', {
      result: 'lose', icon: '⌨️', title: 'GAME OVER',
      score: this.state.score, best,
    });
  }

  _buildFullState() {
    return { status: 'idle', mode: 'basique', words: [], typed: '', score: 0, combo: 0, speed: 0, spawnInterval: 0 };
  }
}
