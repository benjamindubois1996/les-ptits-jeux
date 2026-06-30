import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

// Points indexed 0-23, corresponding to board positions 1-24
// WHITE moves 23→0 (24→1), bears off below point 1
// BLACK moves 0→23 (1→24), bears off above point 24
// WHITE home board: indices 0-5 (points 1-6)
// BLACK home board: indices 18-23 (points 19-24)

const WHITE = 'white', BLACK = 'black';

function roll() { return Math.floor(Math.random() * 6) + 1; }

function oppColor(c) { return c === WHITE ? BLACK : WHITE; }

export default class Backgammon extends BaseGame {
  constructor(config) {
    super(config);
    this.state    = this._buildFullState();
    this._aiTimer = null;
  }

  _gameId() { return 'backgammon'; }

  _buildFullState() {
    const pts = Array.from({ length: 24 }, () => ({ count: 0, color: null }));

    // Standard starting position
    // White: point 24 (idx 23) ×2, point 13 (idx 12) ×5, point 8 (idx 7) ×3, point 6 (idx 5) ×5
    // Black: mirror image
    pts[23] = { count: 2, color: WHITE };
    pts[12] = { count: 5, color: WHITE };
    pts[7]  = { count: 3, color: WHITE };
    pts[5]  = { count: 5, color: WHITE };

    pts[0]  = { count: 2, color: BLACK };
    pts[11] = { count: 5, color: BLACK };
    pts[16] = { count: 3, color: BLACK };
    pts[18] = { count: 5, color: BLACK };

    return {
      status: 'idle',
      points: pts,
      bar:   { white: 0, black: 0 },
      borne: { white: 0, black: 0 },
      dice: [],
      movesLeft: [],
      currentPlayer: WHITE,
      phase: 'rolling',  // 'rolling' | 'moving'
      selected: null,    // point index 0-23 or 'bar'
      validMoves: [],    // [{ from, to }] for selected piece
      score: 0,
      message: 'Lancez les dés pour commencer !',
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
    s.message = 'Lancez les dés pour commencer !';
    EventBus.emit('game:tick', { state: s, action: 'play' });
  }

  rollDice() {
    const s = this.state;
    if (s.status !== 'playing') return;
    if (s.phase !== 'rolling' || s.currentPlayer !== WHITE) return;

    const d1 = roll(), d2 = roll();
    s.dice     = [d1, d2];
    s.movesLeft = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
    s.phase    = 'moving';
    s.message  = `Vous avez lancé ${d1} + ${d2}${d1 === d2 ? ' — Doubles !' : ''}`;

    if (!this._hasAnyMove(WHITE)) {
      s.message += ' — Aucun coup possible.';
      this._endTurn();
      return;
    }

    EventBus.emit('game:tick', { state: s });
  }

  selectPoint(idx) {
    const s = this.state;
    if (s.status !== 'playing' || s.currentPlayer !== WHITE || s.phase !== 'moving') return;

    // If already selected, check if this idx is a valid move destination
    if (s.selected !== null) {
      const match = s.validMoves.find(m => m.to === idx);
      if (match) { this._executeMove(match); return; }
    }

    // Select a source
    if (s.bar.white > 0) {
      // Must enter from bar
      if (idx !== 'bar-action') {
        s.message = 'Vous devez d\'abord faire entrer vos pions du bar !';
        s.selected = 'bar';
        s.validMoves = this._movesFromBar(WHITE);
        EventBus.emit('game:tick', { state: s });
        return;
      }
    }

    const pt = s.points[idx];
    if (!pt || pt.count === 0 || pt.color !== WHITE) {
      s.selected = null; s.validMoves = [];
      EventBus.emit('game:tick', { state: s }); return;
    }

    s.selected   = idx;
    s.validMoves = this._movesFrom(idx, WHITE);
    s.message    = s.validMoves.length > 0 ? 'Choisissez une destination.' : 'Aucun coup pour ce pion.';
    EventBus.emit('game:tick', { state: s });
  }

  selectBar() {
    const s = this.state;
    if (s.status !== 'playing' || s.currentPlayer !== WHITE || s.phase !== 'moving') return;
    if (s.bar.white === 0) return;
    s.selected   = 'bar';
    s.validMoves = this._movesFromBar(WHITE);
    s.message    = s.validMoves.length > 0 ? 'Choisissez une case d\'entrée.' : 'Aucune entrée possible.';
    EventBus.emit('game:tick', { state: s });
  }

  moveTo(toIdx) {
    const s = this.state;
    if (s.selected === null) return;
    const match = s.validMoves.find(m => m.to === toIdx);
    if (match) this._executeMove(match);
  }

  _movesFrom(fromIdx, player) {
    const s = this.state;
    const moves = [];
    const dir = player === WHITE ? -1 : 1; // WHITE decreases idx, BLACK increases

    for (const die of [...new Set(s.movesLeft)]) {
      const to = fromIdx + dir * die;

      if (player === WHITE && to < 0) {
        // Bear off
        if (this._allInHome(WHITE)) {
          // Valid if die = exact distance or no white piece further from home
          const dist = fromIdx + 1; // distance to bearing off (point 1 = index 0, dist = 1)
          if (die >= dist) {
            if (die === dist || !this._hasPieceHigherThan(fromIdx, WHITE)) {
              moves.push({ from: fromIdx, to: -1, die });
            }
          }
        }
        continue;
      }
      if (player === BLACK && to > 23) {
        if (this._allInHome(BLACK)) {
          const dist = 24 - fromIdx; // distance to bearing off
          if (die >= dist) {
            if (die === dist || !this._hasPieceLowerThan(fromIdx, BLACK)) {
              moves.push({ from: fromIdx, to: 24, die });
            }
          }
        }
        continue;
      }

      if (to < 0 || to > 23) continue;
      const pt = s.points[to];
      if (!pt || (pt.color === oppColor(player) && pt.count >= 2)) continue; // blocked
      moves.push({ from: fromIdx, to, die });
    }

    // Deduplicate
    const seen = new Set();
    return moves.filter(m => {
      const k = `${m.from}-${m.to}-${m.die}`;
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });
  }

  _movesFromBar(player) {
    const s = this.state;
    const moves = [];
    for (const die of [...new Set(s.movesLeft)]) {
      let to;
      if (player === WHITE) {
        // White enters at 24 - die (index), i.e., point 25-die
        to = 24 - die; // index 23 for die=1, index 18 for die=6
      } else {
        // Black enters at die-1 (index), i.e., point die
        to = die - 1;
      }
      if (to < 0 || to > 23) continue;
      const pt = s.points[to];
      if (!pt || (pt.color === oppColor(player) && pt.count >= 2)) continue;
      const seen = moves.some(m => m.to === to);
      if (!seen) moves.push({ from: 'bar', to, die });
    }
    return moves;
  }

  _allInHome(player) {
    const s = this.state;
    if (s.bar[player] > 0) return false;
    if (player === WHITE) {
      for (let i = 6; i <= 23; i++) {
        if (s.points[i].color === WHITE && s.points[i].count > 0) return false;
      }
    } else {
      for (let i = 0; i <= 17; i++) {
        if (s.points[i].color === BLACK && s.points[i].count > 0) return false;
      }
    }
    return true;
  }

  // Is there a white piece further from home than index i?
  _hasPieceHigherThan(idx, player) {
    const s = this.state;
    if (player === WHITE) {
      for (let i = idx + 1; i <= 5; i++) {
        if (s.points[i].color === WHITE && s.points[i].count > 0) return true;
      }
    }
    return false;
  }

  _hasPieceLowerThan(idx, player) {
    const s = this.state;
    if (player === BLACK) {
      for (let i = idx - 1; i >= 18; i--) {
        if (s.points[i].color === BLACK && s.points[i].count > 0) return true;
      }
    }
    return false;
  }

  _hasAnyMove(player) {
    const s = this.state;
    if (s.bar[player] > 0) return this._movesFromBar(player).length > 0;
    for (let i = 0; i <= 23; i++) {
      if (s.points[i].color === player && s.points[i].count > 0) {
        if (this._movesFrom(i, player).length > 0) return true;
      }
    }
    return false;
  }

  _executeMove(move) {
    const s = this.state;
    const { from, to, die } = move;
    const player = s.currentPlayer;
    const opp = oppColor(player);

    // Remove from source
    if (from === 'bar') {
      s.bar[player]--;
    } else {
      s.points[from].count--;
      if (s.points[from].count === 0) s.points[from].color = null;
    }

    // Bear off
    if (to === -1 || to === 24) {
      s.borne[player]++;
      if (s.borne[player] === 15) {
        this._winGame(player);
        return;
      }
    } else {
      // Hit a blot?
      if (s.points[to].color === opp && s.points[to].count === 1) {
        s.points[to].count = 0; s.points[to].color = null;
        s.bar[opp]++;
        s.message = `Pion ${opp === WHITE ? 'blanc' : 'noir'} envoyé au bar !`;
      }
      // Place piece
      if (s.points[to].count === 0) s.points[to].color = player;
      s.points[to].count++;
    }

    // Remove used die
    const idx = s.movesLeft.indexOf(die);
    if (idx !== -1) s.movesLeft.splice(idx, 1);

    s.selected = null;
    s.validMoves = [];

    if (s.movesLeft.length === 0 || !this._hasAnyMove(player)) {
      this._endTurn();
      return;
    }

    s.message = `${s.movesLeft.length} coup${s.movesLeft.length > 1 ? 's' : ''} restant(s).`;
    EventBus.emit('game:tick', { state: s });
  }

  _endTurn() {
    const s = this.state;
    s.movesLeft = [];
    s.selected  = null;
    s.validMoves = [];
    s.currentPlayer = oppColor(s.currentPlayer);
    s.phase = 'rolling';

    if (s.currentPlayer === WHITE) {
      s.message = 'Votre tour — lancez les dés.';
      EventBus.emit('game:tick', { state: s });
    } else {
      s.message = "L'IA lance les dés…";
      EventBus.emit('game:tick', { state: s });
      this._aiTimer = setTimeout(() => this._aiTurn(), 800);
    }
  }

  _aiTurn() {
    const s = this.state;
    if (s.status !== 'playing' || s.currentPlayer !== BLACK) return;

    const d1 = roll(), d2 = roll();
    s.dice      = [d1, d2];
    s.movesLeft = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
    s.message   = `IA lance ${d1}+${d2}${d1 === d2 ? ' (doubles)' : ''}`;
    s.phase     = 'moving';
    EventBus.emit('game:tick', { state: s });

    if (!this._hasAnyMove(BLACK)) {
      s.message += ' — Aucun coup possible.';
      EventBus.emit('game:tick', { state: s });
      this._aiTimer = setTimeout(() => this._endTurn(), 800);
      return;
    }

    this._aiTimer = setTimeout(() => this._aiMakeMoves(), 500);
  }

  _aiMakeMoves() {
    const s = this.state;
    if (s.status !== 'playing') return;

    while (s.movesLeft.length > 0 && this._hasAnyMove(BLACK)) {
      const move = this._bestAiMove();
      if (!move) break;
      this._executeAiMove(move);
      if (s.status !== 'playing') return;
    }

    EventBus.emit('game:tick', { state: s });
    this._aiTimer = setTimeout(() => this._endTurn(), 400);
  }

  _bestAiMove() {
    const s = this.state;
    const allMoves = [];

    // Collect all possible moves
    if (s.bar.black > 0) {
      allMoves.push(...this._movesFromBar(BLACK));
    } else {
      for (let i = 0; i <= 23; i++) {
        if (s.points[i].color === BLACK && s.points[i].count > 0) {
          allMoves.push(...this._movesFrom(i, BLACK));
        }
      }
    }

    if (allMoves.length === 0) return null;

    // Score each move
    const scored = allMoves.map(move => ({ move, score: this._scoreAiMove(move) }));
    scored.sort((a, b) => b.score - a.score);
    return scored[0].move;
  }

  _scoreAiMove(move) {
    const s = this.state;
    const { from, to } = move;
    let score = 0;

    // Prioritize bearing off
    if (to === 24) return 100;

    // Prioritize entering from bar
    if (from === 'bar') score += 50;

    const dest = s.points[to];
    // Hit a blot
    if (dest && dest.color === WHITE && dest.count === 1) score += 30;

    // Make a point (2+ own checkers)
    if (dest && dest.color === BLACK && dest.count >= 1) score += 15;

    // Advance toward home (higher indices = closer to home for black)
    if (typeof to === 'number') score += to * 0.5;

    // Avoid leaving blots near opponent's home board
    if (typeof from === 'number') {
      const fromPt = s.points[from];
      if (fromPt && fromPt.count === 1 && from <= 5) score -= 10; // leaving blot near white home
    }

    return score;
  }

  _executeAiMove(move) {
    const s = this.state;
    const { from, to, die } = move;
    const player = BLACK;
    const opp    = WHITE;

    if (from === 'bar') {
      s.bar[player]--;
    } else {
      s.points[from].count--;
      if (s.points[from].count === 0) s.points[from].color = null;
    }

    if (to === 24) {
      s.borne[player]++;
      if (s.borne[player] === 15) { this._winGame(player); return; }
    } else {
      if (s.points[to].color === opp && s.points[to].count === 1) {
        s.points[to].count = 0; s.points[to].color = null;
        s.bar[opp]++;
      }
      if (s.points[to].count === 0) s.points[to].color = player;
      s.points[to].count++;
    }

    const idx = s.movesLeft.indexOf(die);
    if (idx !== -1) s.movesLeft.splice(idx, 1);
  }

  _winGame(player) {
    const s = this.state;
    s.status  = player === WHITE ? 'won' : 'over';
    s.score   = player === WHITE ? 150 : 0;
    s.message = player === WHITE ? 'Vous avez gagné !' : "L'IA a gagné !";
    ScoreService.submit(this._gameId(), s.score);
    EventBus.emit('game:tick', { state: s });
    EventBus.emit(player === WHITE ? 'game:won' : 'game:over', { score: s.score });
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
