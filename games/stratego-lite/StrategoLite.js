import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

// 6×6 board, 7 pieces per side
// Pieces: FLAG(0), BOMB(11,immov), MINER(3), SCOUT(4,multi), CAPTAIN(6), GENERAL(8), MARSHAL(10)
// SPY(1) beats MARSHAL when SPY attacks

const COLS = 6, ROWS = 6;

export const PIECES = {
  FLAG:    { id: 'FLAG',    rank: 0,  label: 'F',  name: 'Drapeau',  move: 0 },
  BOMB:    { id: 'BOMB',    rank: 11, label: 'B',  name: 'Bombe',    move: 0 },
  SPY:     { id: 'SPY',     rank: 1,  label: '1',  name: 'Espion',   move: 1 },
  MINER:   { id: 'MINER',   rank: 3,  label: '3',  name: 'Mineur',   move: 1 },
  SCOUT:   { id: 'SCOUT',   rank: 4,  label: '4',  name: 'Éclaireur',move: 99 },
  CAPTAIN: { id: 'CAPTAIN', rank: 6,  label: '6',  name: 'Capitaine',move: 1 },
  MARSHAL: { id: 'MARSHAL', rank: 10, label: '10', name: 'Maréchal', move: 1 },
};

// Order for setup panel
export const PLAYER_PIECES = ['FLAG','BOMB','MINER','SCOUT','CAPTAIN','MARSHAL','SPY'];

function battle(attacker, defender) {
  // Returns 'attacker' | 'defender' | 'tie'
  if (defender.id === 'FLAG') return 'attacker';
  if (defender.id === 'BOMB') {
    return attacker.id === 'MINER' ? 'attacker' : 'defender';
  }
  if (attacker.id === 'SPY' && defender.id === 'MARSHAL') return 'attacker';
  if (attacker.rank > defender.rank) return 'attacker';
  if (attacker.rank < defender.rank) return 'defender';
  return 'tie';
}

export default class StrategoLite extends BaseGame {
  constructor(config) {
    super(config);
    this.state    = this._buildFullState();
    this._aiTimer = null;
  }

  _gameId() { return 'stratego-lite'; }

  _buildFullState() {
    const board = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
    return {
      status: 'idle',
      phase: 'setup',      // 'setup' | 'play'
      board,
      setupLeft: [...PLAYER_PIECES], // pieces player still needs to place
      currentPlayer: 'player',
      selected: null,      // { r, c }
      validMoves: [],      // [{ r, c }]
      score: 0,
      message: 'Placez vos pièces dans les 2 rangées du bas.',
      lastBattle: null,    // { r, c, result, attacker, defender }
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
    s.phase  = 'setup';
    s.message = 'Placez vos 7 pièces dans les 2 rangées du bas.';
    EventBus.emit('game:tick', { state: s, action: 'play' });
  }

  // Called during setup: place a piece on (r, c) from setupLeft
  setupPlace(r, c, pieceId) {
    const s = this.state;
    if (s.phase !== 'setup') return;
    if (r < 4 || r > 5) return; // only rows 4-5 (bottom 2 rows)
    if (!s.setupLeft.includes(pieceId)) return;

    // If cell occupied by player piece, swap or remove
    if (s.board[r][c] && s.board[r][c].color === 'player') {
      s.setupLeft.push(s.board[r][c].id);
      s.board[r][c] = null;
    }
    if (s.board[r][c]) return;

    const idx = s.setupLeft.indexOf(pieceId);
    if (idx !== -1) s.setupLeft.splice(idx, 1);
    s.board[r][c] = { ...PIECES[pieceId], color: 'player', revealed: false };
    s.message = s.setupLeft.length > 0
      ? `Placez encore : ${s.setupLeft.map(id => PIECES[id].name).join(', ')}`
      : 'Toutes les pièces placées — appuyez sur COMMENCER !';
    EventBus.emit('game:tick', { state: s });
  }

  // Remove a piece during setup (click existing piece)
  setupRemove(r, c) {
    const s = this.state;
    if (s.phase !== 'setup') return;
    if (!s.board[r][c] || s.board[r][c].color !== 'player') return;
    s.setupLeft.push(s.board[r][c].id);
    s.board[r][c] = null;
    s.message = `Placez encore : ${s.setupLeft.map(id => PIECES[id].name).join(', ')}`;
    EventBus.emit('game:tick', { state: s });
  }

  startGame() {
    const s = this.state;
    if (s.setupLeft.length > 0) return;
    this._aiSetup();
    s.phase = 'play';
    s.currentPlayer = 'player';
    s.message = 'Votre tour — sélectionnez une pièce.';
    EventBus.emit('game:tick', { state: s });
  }

  _aiSetup() {
    const s = this.state;
    // AI places in rows 0-1
    const aiPieces = [...PLAYER_PIECES];
    const cells = [];
    for (let r = 0; r <= 1; r++) {
      for (let c = 0; c < COLS; c++) cells.push([r, c]);
    }
    // Shuffle cells
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    // Strategic placement: FLAG in corner of row 0, BOMB next to it
    const flagCell = cells.find(([r]) => r === 0) || [0, 0];
    cells.splice(cells.indexOf(flagCell), 1);
    s.board[flagCell[0]][flagCell[1]] = { ...PIECES.FLAG, color: 'ai', revealed: false };

    const bombCandidates = cells.filter(([r, c]) =>
      Math.abs(r - flagCell[0]) + Math.abs(c - flagCell[1]) === 1
    );
    const bombCell = bombCandidates[0] || cells[0];
    cells.splice(cells.indexOf(bombCell), 1);
    s.board[bombCell[0]][bombCell[1]] = { ...PIECES.BOMB, color: 'ai', revealed: false };

    const remaining = aiPieces.filter(id => id !== 'FLAG' && id !== 'BOMB');
    for (const pieceId of remaining) {
      const cell = cells.shift();
      if (!cell) break;
      s.board[cell[0]][cell[1]] = { ...PIECES[pieceId], color: 'ai', revealed: false };
    }
  }

  // Play phase: click to select own piece or move
  selectCell(r, c) {
    const s = this.state;
    if (s.phase !== 'play' || s.status !== 'playing') return;
    if (s.currentPlayer !== 'player') return;

    // If something selected and this is a valid move
    if (s.selected !== null) {
      const isValid = s.validMoves.some(m => m.r === r && m.c === c);
      if (isValid) {
        this._executeMove(s.selected.r, s.selected.c, r, c);
        return;
      }
    }

    // Select own piece
    const cell = s.board[r][c];
    if (!cell || cell.color !== 'player' || cell.move === 0) {
      s.selected   = null;
      s.validMoves = [];
      EventBus.emit('game:tick', { state: s });
      return;
    }

    s.selected   = { r, c };
    s.validMoves = this._computeMoves(r, c, cell, 'player');
    s.message    = `${cell.name} sélectionné${s.validMoves.length === 0 ? ' — aucun coup possible' : ''}.`;
    EventBus.emit('game:tick', { state: s });
  }

  _computeMoves(r, c, piece, player) {
    const s = this.state;
    const opp = player === 'player' ? 'ai' : 'player';
    const moves = [];
    const dirs  = [[-1,0],[1,0],[0,-1],[0,1]];
    const maxSteps = piece.id === 'SCOUT' ? Math.max(ROWS, COLS) : 1;

    for (const [dr, dc] of dirs) {
      for (let step = 1; step <= maxSteps; step++) {
        const nr = r + dr * step, nc = c + dc * step;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
        const target = s.board[nr][nc];
        if (!target) {
          moves.push({ r: nr, c: nc });
        } else if (target.color === opp) {
          moves.push({ r: nr, c: nc }); // attack
          break; // Scout can't pass through
        } else {
          break; // Own piece blocks
        }
      }
    }
    return moves;
  }

  _executeMove(fr, fc, tr, tc) {
    const s = this.state;
    const attacker = s.board[fr][fc];
    const target   = s.board[tr][tc];

    s.selected   = null;
    s.validMoves = [];
    s.lastBattle = null;

    if (!target) {
      s.board[tr][tc] = attacker;
      s.board[fr][fc] = null;
    } else {
      // Battle
      attacker.revealed = true;
      target.revealed   = true;
      const result = battle(attacker, target);
      s.lastBattle = { r: tr, c: tc, result, attacker: attacker.name, defender: target.name };

      if (result === 'attacker') {
        s.board[tr][tc] = attacker;
        s.board[fr][fc] = null;
        if (target.id === 'FLAG') {
          this._endGame('player');
          return;
        }
        s.message = `${attacker.name} bat ${target.name} !`;
      } else if (result === 'defender') {
        s.board[fr][fc] = null;
        s.message = `${attacker.name} perd contre ${target.name} !`;
      } else {
        s.board[fr][fc] = null;
        s.board[tr][tc] = null;
        s.message = `Égalité ! ${attacker.name} vs ${target.name} — les deux disparaissent.`;
      }
    }

    s.score++;
    EventBus.emit('game:score-update', { score: s.score });
    EventBus.emit('game:tick', { state: s });

    // Check if AI has any pieces left (besides FLAG/BOMB — can't win by pieces alone)
    if (!this._hasMovablePieces('ai')) {
      this._endGame('player');
      return;
    }

    s.currentPlayer = 'ai';
    s.message       = "L'IA réfléchit…";
    EventBus.emit('game:tick', { state: s });
    this._aiTimer   = setTimeout(() => this._aiMove(), 700);
  }

  _aiMove() {
    const s = this.state;
    if (s.status !== 'playing' || s.currentPlayer !== 'ai') return;

    const moves = this._allAiMoves();
    if (moves.length === 0) {
      // AI has no moves — player wins
      this._endGame('player');
      return;
    }

    const best = this._scoreAiMoves(moves);
    const { fr, fc, tr, tc } = best;
    const attacker = s.board[fr][fc];
    const target   = s.board[tr][tc];

    s.lastBattle = null;
    if (!target) {
      s.board[tr][tc] = attacker;
      s.board[fr][fc] = null;
    } else {
      attacker.revealed = true;
      target.revealed   = true;
      const result = battle(attacker, target);
      s.lastBattle = { r: tr, c: tc, result, attacker: attacker.name, defender: target.name };

      if (result === 'attacker') {
        s.board[tr][tc] = attacker;
        s.board[fr][fc] = null;
        if (target.id === 'FLAG') {
          this._endGame('ai');
          return;
        }
        s.message = `IA : ${attacker.name} bat votre ${target.name} !`;
      } else if (result === 'defender') {
        s.board[fr][fc] = null;
        s.message = `IA : ${attacker.name} perd contre votre ${target.name} !`;
      } else {
        s.board[fr][fc] = null;
        s.board[tr][tc] = null;
        s.message = `IA : Égalité — ${attacker.name} vs votre ${target.name}.`;
      }
    }

    if (!this._hasMovablePieces('player')) {
      this._endGame('ai');
      return;
    }

    s.currentPlayer = 'player';
    EventBus.emit('game:tick', { state: s });
  }

  _allAiMoves() {
    const s = this.state;
    const moves = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = s.board[r][c];
        if (!cell || cell.color !== 'ai' || cell.move === 0) continue;
        const targets = this._computeMoves(r, c, cell, 'ai');
        targets.forEach(t => moves.push({ fr: r, fc: c, tr: t.r, tc: t.c, piece: cell }));
      }
    }
    return moves;
  }

  _scoreAiMoves(moves) {
    const s = this.state;
    return moves.reduce((best, move) => {
      const target = s.board[move.tr][move.tc];
      let score = 0;

      if (target) {
        if (target.id === 'FLAG') score += 1000; // WIN
        // Attack unknown (unrevealed) piece cautiously
        if (!target.revealed) score += 5;
        // Attack known weaker piece
        if (target.revealed && move.piece.rank > target.rank) score += 10 + target.rank;
        // Avoid known stronger piece
        if (target.revealed && move.piece.rank < target.rank) score -= 20;
      }

      // Advance toward player's territory
      score += (5 - move.tr) * 2;

      // Small random tiebreaker
      score += Math.random() * 0.5;

      if (!best || score > best.score) return { ...move, score };
      return best;
    }, null);
  }

  _hasMovablePieces(player) {
    const s = this.state;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = s.board[r][c];
        if (cell && cell.color === player && cell.move > 0) {
          if (this._computeMoves(r, c, cell, player).length > 0) return true;
        }
      }
    }
    return false;
  }

  _endGame(winner) {
    const s = this.state;
    s.status  = winner === 'player' ? 'won' : 'over';
    s.score   = winner === 'player' ? 100 + s.score : 0;
    s.message = winner === 'player' ? 'Vous capturez le drapeau ennemi !' : 'L\'IA capture votre drapeau !';
    // Reveal all AI pieces
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (s.board[r][c]) s.board[r][c].revealed = true;
      }
    }
    ScoreService.submit(this._gameId(), s.score);
    EventBus.emit('game:tick', { state: s });
    EventBus.emit(winner === 'player' ? 'game:won' : 'game:over', { score: s.score });
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
