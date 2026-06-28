import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

// ── Pièces canoniques (21 pièces Blokus) ──────────────────────────────────
const PIECE_DEFS = [
  { id:'I1', cells:[[0,0]] },
  { id:'I2', cells:[[0,0],[0,1]] },
  { id:'I3', cells:[[0,0],[0,1],[0,2]] },
  { id:'L3', cells:[[0,0],[1,0],[1,1]] },
  { id:'I4', cells:[[0,0],[0,1],[0,2],[0,3]] },
  { id:'L4', cells:[[0,0],[1,0],[2,0],[2,1]] },
  { id:'T4', cells:[[0,0],[0,1],[0,2],[1,1]] },
  { id:'S4', cells:[[0,0],[0,1],[1,1],[1,2]] },
  { id:'O4', cells:[[0,0],[0,1],[1,0],[1,1]] },
  { id:'F5', cells:[[0,1],[0,2],[1,0],[1,1],[2,1]] },
  { id:'I5', cells:[[0,0],[0,1],[0,2],[0,3],[0,4]] },
  { id:'L5', cells:[[0,0],[1,0],[2,0],[3,0],[3,1]] },
  { id:'N5', cells:[[0,0],[1,0],[1,1],[2,1],[3,1]] },
  { id:'P5', cells:[[0,0],[0,1],[1,0],[1,1],[2,0]] },
  { id:'T5', cells:[[0,0],[0,1],[0,2],[1,1],[2,1]] },
  { id:'U5', cells:[[0,0],[0,2],[1,0],[1,1],[1,2]] },
  { id:'V5', cells:[[0,0],[1,0],[2,0],[2,1],[2,2]] },
  { id:'W5', cells:[[0,0],[1,0],[1,1],[2,1],[2,2]] },
  { id:'X5', cells:[[0,1],[1,0],[1,1],[1,2],[2,1]] },
  { id:'Y5', cells:[[0,0],[0,1],[1,1],[2,1],[3,1]] },
  { id:'Z5', cells:[[0,0],[0,1],[1,1],[2,1],[2,2]] },
];

// ── Transformation géométrique ─────────────────────────────────────────────
function normalize(cells) {
  const minR = Math.min(...cells.map(c => c[0]));
  const minC = Math.min(...cells.map(c => c[1]));
  return cells.map(c => [c[0]-minR, c[1]-minC]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
}
function rot90(cells) { return normalize(cells.map(([r,c]) => [c,-r])); }
function flipH(cells) { return normalize(cells.map(([r,c]) => [r,-c])); }
function key(cells)   { return cells.map(c=>c.join(',')).join(';'); }

function getOrientations(cells) {
  const seen = new Set(), result = [];
  let cur = normalize(cells);
  for (let f=0;f<2;f++) {
    for (let r=0;r<4;r++) {
      const k = key(cur);
      if (!seen.has(k)) { seen.add(k); result.push(cur.map(c=>[...c])); }
      cur = rot90(cur);
    }
    cur = flipH(cur);
  }
  return result;
}

const ORIENTATIONS = PIECE_DEFS.map(p => getOrientations(p.cells));
const N = 14;
const D4 = [[-1,0],[1,0],[0,-1],[0,1]];
const D8 = [[-1,-1],[-1,1],[1,-1],[1,1]];

// ── Placement ─────────────────────────────────────────────────────────────
function canPlace(board, cells, r, c, player, isFirst) {
  const placed = cells.map(([dr,dc]) => [r+dr, c+dc]);

  if (placed.some(([pr,pc]) => pr<0||pr>=N||pc<0||pc>=N)) return false;
  if (placed.some(([pr,pc]) => board[pr*N+pc] !== -1))       return false;

  if (isFirst) {
    const [sr,sc] = player===0 ? [4,4] : [9,9];
    return placed.some(([pr,pc]) => pr===sr && pc===sc);
  }

  // No edge adjacency to own pieces
  if (placed.some(([pr,pc]) =>
    D4.some(([dr,dc]) => {
      const nr=pr+dr, nc=pc+dc;
      return nr>=0&&nr<N&&nc>=0&&nc<N && board[nr*N+nc]===player;
    })
  )) return false;

  // At least one diagonal touch to own pieces
  return placed.some(([pr,pc]) =>
    D8.some(([dr,dc]) => {
      const nr=pr+dr, nc=pc+dc;
      return nr>=0&&nr<N&&nc>=0&&nc<N && board[nr*N+nc]===player;
    })
  );
}

function doPlace(board, cells, r, c, player) {
  cells.forEach(([dr,dc]) => { board[(r+dr)*N+(c+dc)] = player; });
}

// ── Jeu ───────────────────────────────────────────────────────────────────
export default class Blokus extends BaseGame {
  constructor(config) {
    super(config);
    this.PIECE_DEFS   = PIECE_DEFS;
    this.ORIENTATIONS = ORIENTATIONS;
    this.state = this._buildFullState();
  }

  _gameId() { return 'blokus'; }

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

  // Joueur place une pièce
  placePlayerPiece(pieceIdx, orientIdx, r, c) {
    const s = this.state;
    if (s.status !== 'playing' || s.turn !== 'player') return false;
    if (!s.playerPieces[pieceIdx]) return false;

    const cells = ORIENTATIONS[pieceIdx][orientIdx];
    if (!canPlace(s.board, cells, r, c, 0, s.playerFirst)) return false;

    doPlace(s.board, cells, r, c, 0);
    s.playerPieces[pieceIdx] = false;
    s.scores[0] += cells.length * this.config.scoring.squareValue;
    if (s.playerFirst) s.playerFirst = false;

    EventBus.emit('game:tick', { state: s, action: 'placed', player: 0 });

    if (this._checkEnd(s)) return true;
    s.turn = 'ai';
    EventBus.emit('game:tick', { state: s });
    setTimeout(() => this._aiTurn(), this.config.gameplay.aiDelay);
    return true;
  }

  _aiTurn() {
    const s = this.state;
    if (s.status !== 'playing') return;

    const move = this._findAIMove(s);
    if (!move) {
      s.aiPassed = true;
      if (this._checkEnd(s)) return;
      s.turn = 'player';
      EventBus.emit('game:tick', { state: s });
      return;
    }

    doPlace(s.board, move.cells, move.r, move.c, 1);
    s.aiPieces[move.pieceIdx] = false;
    s.scores[1] += move.cells.length * this.config.scoring.squareValue;
    if (s.aiFirst) s.aiFirst = false;

    if (this._checkEnd(s)) return;

    s.turn = 'player';
    EventBus.emit('game:tick', { state: s, action: 'placed', player: 1 });
  }

  _findAIMove(s) {
    // Try pieces from largest to smallest
    for (let size = 5; size >= 1; size--) {
      for (let pi = 0; pi < PIECE_DEFS.length; pi++) {
        if (!s.aiPieces[pi]) continue;
        if (PIECE_DEFS[pi].cells.length !== size) continue;
        for (const cells of ORIENTATIONS[pi]) {
          for (let r = 0; r < N; r++) {
            for (let c = 0; c < N; c++) {
              if (canPlace(s.board, cells, r, c, 1, s.aiFirst)) {
                return { pieceIdx: pi, cells, r, c };
              }
            }
          }
        }
      }
    }
    return null;
  }

  _checkEnd(s) {
    const playerCanPlay = s.playerPieces.some((avail, pi) => {
      if (!avail) return false;
      return ORIENTATIONS[pi].some(cells =>
        this._hasValidPlacement(s.board, cells, 0, s.playerFirst)
      );
    });
    const aiCanPlay = s.aiPieces.some((avail, pi) => {
      if (!avail) return false;
      return ORIENTATIONS[pi].some(cells =>
        this._hasValidPlacement(s.board, cells, 1, s.aiFirst)
      );
    });

    if (!playerCanPlay && !aiCanPlay) {
      this._endGame(s);
      return true;
    }
    if (!playerCanPlay && s.turn === 'player') {
      s.playerPassed = true;
      s.turn = 'ai';
      setTimeout(() => this._aiTurn(), this.config.gameplay.aiDelay);
      return true;
    }
    return false;
  }

  _hasValidPlacement(board, cells, player, isFirst) {
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (canPlace(board, cells, r, c, player, isFirst)) return true;
      }
    }
    return false;
  }

  _endGame(s) {
    s.status = s.scores[0] >= s.scores[1] ? 'won' : 'over';
    const pts = s.scores[0];
    const { best, isRecord } = ScoreService.submit(this._gameId(), pts);
    const ev = s.status === 'won' ? 'game:won' : 'game:over';
    const icon  = s.status === 'won' ? '🟦' : '🟥';
    const title = s.status === 'won' ? 'VICTOIRE BLEUE !' : "L'IA ROUGE GAGNE";
    EventBus.emit(ev, {
      result: s.status === 'won' ? 'win' : 'lose',
      icon, title, score: pts, best, isRecord,
      extraInfo: `<div class="overlay-score">Bleu: <strong>${s.scores[0]}</strong> pts &nbsp;|&nbsp; Rouge: <strong>${s.scores[1]}</strong> pts</div>`
    });
  }

  _buildFullState() {
    return {
      status: 'idle', mode: 'basique',
      board: new Array(N * N).fill(-1),
      playerPieces: new Array(PIECE_DEFS.length).fill(true),
      aiPieces:     new Array(PIECE_DEFS.length).fill(true),
      scores: [0, 0],
      turn: 'player',
      playerFirst: true,
      aiFirst: true,
      playerPassed: false,
      aiPassed: false,
    };
  }
}
