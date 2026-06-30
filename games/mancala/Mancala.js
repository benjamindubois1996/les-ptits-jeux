import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

// Kalah variant
// Pits 0-5 : player (bottom), pit 6 : player store
// Pits 7-12: AI    (top),    pit 13: AI store
// Sow counter-clockwise: 0→1→2→3→4→5→6→7→8→9→10→11→12→(skip 13)→0→...
// When player sows: skip pit 13 (AI store). When AI sows: skip pit 6 (player store).
const PLAYER_STORE = 6;
const AI_STORE     = 13;
const TOTAL_PITS   = 14;
const SEEDS_EACH   = 4;

// Opposite pit for capture: player pit i (0-5) ↔ AI pit (12-i)
function oppositePit(i) { return 12 - i; }

export default class Mancala extends BaseGame {
  constructor(config) {
    super(config);
    this.state = this._buildFullState();
    this._aiTimer = null;
  }

  _gameId() { return 'mancala'; }

  _buildFullState() {
    const pits = new Array(TOTAL_PITS).fill(0);
    for (let i = 0; i < TOTAL_PITS; i++) {
      if (i !== PLAYER_STORE && i !== AI_STORE) pits[i] = SEEDS_EACH;
    }
    return {
      status: 'idle',
      pits,
      currentPlayer: 'player',
      score: 0,
      message: '',
      lastPit: null,
      extraTurn: false,
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
    s.status = 'playing';
    s.currentPlayer = 'player';
    s.message = 'Choisissez un trou pour semer !';
    EventBus.emit('game:tick', { state: s, action: 'play' });
  }

  // Player picks pit index (0-5)
  pick(pitIndex) {
    const s = this.state;
    if (s.status !== 'playing') return;
    if (s.currentPlayer !== 'player') return;
    if (pitIndex < 0 || pitIndex > 5) return;
    if (s.pits[pitIndex] === 0) return;

    const extraTurn = this._sow(pitIndex, 'player');
    s.lastPit = pitIndex;

    if (this._checkEnd()) return;

    if (extraTurn) {
      s.message = 'Rejouer ! (dernier grain dans votre grenier)';
      s.extraTurn = true;
    } else {
      s.currentPlayer = 'ai';
      s.extraTurn = false;
      s.message = "L'IA réfléchit…";
    }

    s.score = s.pits[PLAYER_STORE];
    EventBus.emit('game:score-update', { score: s.score });
    EventBus.emit('game:tick', { state: s });

    if (!extraTurn && s.status === 'playing') {
      this._aiTimer = setTimeout(() => this._aiTurn(), 700);
    }
  }

  _sow(pitIndex, player) {
    const s = this.state;
    const skipStore = player === 'player' ? AI_STORE : PLAYER_STORE;
    let seeds = s.pits[pitIndex];
    s.pits[pitIndex] = 0;

    let current = pitIndex;
    let lastPit;
    while (seeds > 0) {
      current = (current + 1) % TOTAL_PITS;
      if (current === skipStore) current = (current + 1) % TOTAL_PITS;
      s.pits[current]++;
      seeds--;
      lastPit = current;
    }

    // Extra turn if last seed lands in own store
    const ownStore = player === 'player' ? PLAYER_STORE : AI_STORE;
    if (lastPit === ownStore) return true;

    // Capture: if last seed lands in own empty pit (now has 1 seed) with seeds opposite
    if (player === 'player' && lastPit >= 0 && lastPit <= 5 && s.pits[lastPit] === 1) {
      const opp = oppositePit(lastPit);
      if (s.pits[opp] > 0) {
        s.pits[PLAYER_STORE] += s.pits[opp] + 1;
        s.pits[opp]     = 0;
        s.pits[lastPit] = 0;
        s.message = `Capture ! +${s.pits[PLAYER_STORE]} graines dans votre grenier.`;
      }
    } else if (player === 'ai' && lastPit >= 7 && lastPit <= 12 && s.pits[lastPit] === 1) {
      // AI pit j (7-12): opposite player pit = 12-j  (e.g. j=7 → pit 5, j=12 → pit 0)
      const oppIdx = 12 - lastPit;
      if (s.pits[oppIdx] > 0) {
        s.pits[AI_STORE] += s.pits[oppIdx] + 1;
        s.pits[oppIdx]    = 0;
        s.pits[lastPit]   = 0;
      }
    }

    return false;
  }

  _aiTurn() {
    const s = this.state;
    if (s.status !== 'playing' || s.currentPlayer !== 'ai') return;

    const move = this._bestAiMove();
    if (move === -1) {
      this._checkEnd();
      return;
    }

    const extraTurn = this._sow(move, 'ai');
    s.lastPit = move;

    if (this._checkEnd()) return;

    if (extraTurn) {
      s.message = "L'IA rejoue !";
      EventBus.emit('game:tick', { state: s });
      this._aiTimer = setTimeout(() => this._aiTurn(), 700);
    } else {
      s.currentPlayer = 'player';
      s.message = 'Choisissez un trou pour semer !';
      s.score = s.pits[PLAYER_STORE];
      EventBus.emit('game:score-update', { score: s.score });
      EventBus.emit('game:tick', { state: s });
    }
  }

  _bestAiMove() {
    const s = this.state;
    const valid = [];
    for (let i = 7; i <= 12; i++) {
      if (s.pits[i] > 0) valid.push(i);
    }
    if (valid.length === 0) return -1;

    // Strategy: prefer pit that gives extra turn (lands in AI store)
    for (const pit of valid) {
      const seeds = s.pits[pit];
      const dist  = AI_STORE - pit;
      if (seeds === dist) return pit; // exactly lands in AI store
    }

    // Prefer capture
    for (const pit of valid) {
      const testPits = [...s.pits];
      let seeds  = testPits[pit];
      testPits[pit] = 0;
      let cur = pit;
      while (seeds > 0) {
        cur = (cur + 1) % TOTAL_PITS;
        if (cur === PLAYER_STORE) cur = (cur + 1) % TOTAL_PITS;
        testPits[cur]++;
        seeds--;
      }
      if (cur >= 7 && cur <= 12 && testPits[cur] === 1) {
        const oppIdx = 12 - cur; // AI pit j → opposite player pit = 12-j
        if (oppIdx >= 0 && oppIdx <= 5 && s.pits[oppIdx] > 0) return pit;
      }
    }

    // Otherwise: pick the pit with most seeds (sow further)
    return valid.reduce((best, pit) => s.pits[pit] > s.pits[best] ? pit : best, valid[0]);
  }

  _checkEnd() {
    const s = this.state;

    // Check if player's side is empty
    const playerEmpty = [0, 1, 2, 3, 4, 5].every(i => s.pits[i] === 0);
    // Check if AI's side is empty
    const aiEmpty = [7, 8, 9, 10, 11, 12].every(i => s.pits[i] === 0);

    if (playerEmpty || aiEmpty) {
      // Collect remaining seeds to the respective store
      for (let i = 0; i <= 5; i++) { s.pits[PLAYER_STORE] += s.pits[i]; s.pits[i] = 0; }
      for (let i = 7; i <= 12; i++) { s.pits[AI_STORE] += s.pits[i]; s.pits[i] = 0; }

      s.status = 'over';
      s.score  = s.pits[PLAYER_STORE];
      ScoreService.submit(this._gameId(), s.score);

      const playerSeeds = s.pits[PLAYER_STORE];
      const aiSeeds     = s.pits[AI_STORE];

      if (playerSeeds > aiSeeds) {
        s.message = `Victoire ! Vous : ${playerSeeds} · IA : ${aiSeeds}`;
        s.status  = 'won';
        EventBus.emit('game:tick', { state: s });
        EventBus.emit('game:won',  { score: s.score });
      } else if (aiSeeds > playerSeeds) {
        s.message = `Défaite. Vous : ${playerSeeds} · IA : ${aiSeeds}`;
        EventBus.emit('game:tick', { state: s });
        EventBus.emit('game:over', { score: s.score });
      } else {
        s.message = `Égalité ! ${playerSeeds} graines chacun.`;
        EventBus.emit('game:tick', { state: s });
        EventBus.emit('game:over', { score: s.score });
      }
      return true;
    }
    return false;
  }

  restart() {
    if (this._aiTimer) { clearTimeout(this._aiTimer); this._aiTimer = null; }
    this.state = this._buildFullState();
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  destroy() {
    if (this._aiTimer) { clearTimeout(this._aiTimer); this._aiTimer = null; }
    super.destroy();
  }
}
