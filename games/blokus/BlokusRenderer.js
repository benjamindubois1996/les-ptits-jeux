import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const ID = 'blokus';
const N  = 14;
const COLORS = { '-1': '#0d1220', 0: '#3366ff', 1: '#ff3344' };
const PIECE_NAMES = ['I1','I2','I3','L3','I4','L4','T4','S4','O4','F','I5','L5','N','P','T5','U','V','W','X','Y','Z'];

export default class BlokusRenderer {
  constructor(game, viewport, config) {
    this._game    = game;
    this._vp      = viewport;
    this._cfg     = config;
    this._wrapper = null;
    this._overlay = null;
    this._state   = null;

    this._selPiece   = -1;
    this._selOrient  = 0;
    this._hoverCell  = null;

    this._onTick    = this._onTick.bind(this);
    this._onOver    = this._onOver.bind(this);
    this._onWon     = this._onWon.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
    this._onRestart = this._onRestart.bind(this);
  }

  init() {
    this._injectStyles();
    this._buildLayout();
    this._overlay = new GameOverlay(this._vp);
    this._showStart();
    this._bindEvents();
  }

  destroy() {
    this._unbindEvents();
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById(`${ID}-styles`)?.remove();
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = `${ID}-wrapper`;

    // Board
    this._boardEl = document.createElement('div');
    this._boardEl.className = `${ID}-board`;
    this._boardEl.style.gridTemplateColumns = `repeat(${N},1fr)`;
    for (let i = 0; i < N * N; i++) {
      const cell = document.createElement('div');
      cell.className = `${ID}-cell`;
      cell.dataset.i = i;
      this._boardEl.appendChild(cell);
    }

    // Panel
    this._panelEl = document.createElement('div');
    this._panelEl.className = `${ID}-panel`;

    this._scoreEl = document.createElement('div');
    this._scoreEl.className = `${ID}-score`;

    this._hintEl = document.createElement('div');
    this._hintEl.className = `${ID}-hint`;
    this._hintEl.textContent = 'Q: tourner  E: retourner  Clic: placer';

    this._piecesEl = document.createElement('div');
    this._piecesEl.className = `${ID}-pieces`;

    this._panelEl.append(this._scoreEl, this._hintEl, this._piecesEl);
    this._wrapper.append(this._boardEl, this._panelEl);
    this._vp.appendChild(this._wrapper);

    // Board click
    this._boardEl.addEventListener('click',     e => this._onBoardClick(e));
    this._boardEl.addEventListener('mouseover', e => this._onBoardHover(e));
    this._boardEl.addEventListener('mouseleave', () => { this._hoverCell = null; this._refreshBoard(); });
  }

  _showStart() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique',
         options: [{ value: 'basique', label: 'BASIQUE' }] }],
      sel => { this._overlay.hide(); this._game.start(sel); },
      { extraHtml: `<div style="color:rgba(255,255,255,0.5);font-size:10px;text-align:center;line-height:1.9;margin-bottom:4px">
          Blokus Duo — plateau 14×14<br>
          🟦 Bleu (toi) vs 🟥 Rouge (IA)<br>
          Pièces coin-à-coin, pas côte à côte<br>
          <strong>Q</strong> Tourner &nbsp;·&nbsp; <strong>E</strong> Retourner &nbsp;·&nbsp; <strong>Clic</strong> Placer
        </div>` }
    );
  }

  // ── Rendu ─────────────────────────────────────────────────────────────────

  _refreshBoard() {
    const s = this._state;
    if (!s) return;
    const cells   = this._boardEl.children;
    const preview = this._getPreviewCells();

    for (let i = 0; i < N * N; i++) {
      const r = Math.floor(i / N), c = i % N;
      const el  = cells[i];
      const val = s.board[i];
      el.className = `${ID}-cell`;
      if (val === 0)  el.classList.add(`${ID}-cell--blue`);
      if (val === 1)  el.classList.add(`${ID}-cell--red`);
      if (preview.valid.has(`${r},${c}`))   el.classList.add(`${ID}-cell--preview`);
      if (preview.invalid.has(`${r},${c}`)) el.classList.add(`${ID}-cell--invalid`);
    }
  }

  _getPreviewCells() {
    const result = { valid: new Set(), invalid: new Set() };
    if (this._selPiece < 0 || !this._hoverCell || !this._state) return result;
    const s = this._state;
    if (s.turn !== 'player') return result;

    const cells  = this._game.ORIENTATIONS[this._selPiece][this._selOrient];
    const [hr,hc] = this._hoverCell;

    // Anchor: place top-left of bounding box at hover cell
    const placed = cells.map(([dr,dc]) => [hr+dr, hc+dc]);
    const allIn  = placed.every(([pr,pc]) => pr>=0&&pr<N&&pc>=0&&pc<N);

    if (!allIn) { placed.forEach(([pr,pc]) => result.invalid.add(`${pr},${pc}`)); return result; }

    // Check validity
    const ok = this._game.placePlayerPiece.toString; // we'll use canPlace logic indirectly
    // Just highlight with color (green if valid, red if not)
    // We call the game to test: use a temp board copy
    const tempBoard = [...s.board];
    const testResult = this._testPlace(tempBoard, cells, hr, hc, s.playerFirst);
    const set = testResult ? result.valid : result.invalid;
    placed.forEach(([pr,pc]) => { if(pr>=0&&pr<N&&pc>=0&&pc<N) set.add(`${pr},${pc}`); });
    return result;
  }

  _testPlace(board, cells, r, c, isFirst) {
    const placed = cells.map(([dr,dc]) => [r+dr, c+dc]);
    if (placed.some(([pr,pc]) => pr<0||pr>=N||pc<0||pc>=N)) return false;
    if (placed.some(([pr,pc]) => board[pr*N+pc] !== -1)) return false;
    if (isFirst) {
      return placed.some(([pr,pc]) => pr===4 && pc===4);
    }
    const D4=[[-1,0],[1,0],[0,-1],[0,1]], D8=[[-1,-1],[-1,1],[1,-1],[1,1]];
    if (placed.some(([pr,pc]) => D4.some(([dr,dc])=>{const nr=pr+dr,nc=pc+dc;return nr>=0&&nr<N&&nc>=0&&nc<N&&board[nr*N+nc]===0;}))) return false;
    return placed.some(([pr,pc]) => D8.some(([dr,dc])=>{const nr=pr+dr,nc=pc+dc;return nr>=0&&nr<N&&nc>=0&&nc<N&&board[nr*N+nc]===0;}));
  }

  _refreshPieces() {
    const s = this._state;
    if (!s) return;
    this._piecesEl.innerHTML = '';

    for (let pi = 0; pi < 21; pi++) {
      if (!s.playerPieces[pi]) continue;
      const def   = this._game.PIECE_DEFS[pi];
      const cells = this._game.ORIENTATIONS[pi][this._selPiece === pi ? this._selOrient : 0];
      const maxR  = Math.max(...cells.map(c=>c[0])) + 1;
      const maxC  = Math.max(...cells.map(c=>c[1])) + 1;
      const SZ = 8;

      const mini = document.createElement('div');
      mini.className = `${ID}-mini${pi===this._selPiece ? ` ${ID}-mini--sel` : ''}`;
      mini.title = PIECE_NAMES[pi];
      mini.style.cssText = `width:${maxC*SZ+4}px;height:${maxR*SZ+4}px;position:relative;`;

      cells.forEach(([r,c]) => {
        const sq = document.createElement('div');
        sq.style.cssText = `position:absolute;left:${c*SZ+2}px;top:${r*SZ+2}px;width:${SZ-1}px;height:${SZ-1}px;background:#3366ff;border-radius:1px;`;
        mini.appendChild(sq);
      });
      mini.addEventListener('click', () => {
        this._selPiece  = (this._selPiece === pi) ? -1 : pi;
        this._selOrient = 0;
        this._refreshPieces();
        this._refreshBoard();
      });
      this._piecesEl.appendChild(mini);
    }
    this._scoreEl.textContent = `🟦 ${s.scores[0]}  🟥 ${s.scores[1]}`;
  }

  // ── Board interaction ────────────────────────────────────────────────────

  _onBoardClick(e) {
    const s = this._state;
    if (!s || s.turn !== 'player' || this._selPiece < 0) return;
    const i = +e.target.dataset.i;
    if (isNaN(i)) return;
    const r = Math.floor(i / N), c = i % N;
    const ok = this._game.placePlayerPiece(this._selPiece, this._selOrient, r, c);
    if (ok) {
      this._selPiece  = -1;
      this._selOrient = 0;
      this._refreshPieces();
    }
  }

  _onBoardHover(e) {
    const i = +e.target.dataset.i;
    if (isNaN(i)) return;
    this._hoverCell = [Math.floor(i/N), i%N];
    this._refreshBoard();
  }

  // ── EventBus ──────────────────────────────────────────────────────────────

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:won',     this._onWon);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
    this._onKey = e => {
      if (e.key==='p'||e.key==='P') { EventBus.emit('game:pause-toggle'); return; }
      if (e.key==='r'||e.key==='R') { this._game.restart(); return; }
      if ((e.key==='q'||e.key==='Q') && this._selPiece>=0) {
        const orients = this._game.ORIENTATIONS[this._selPiece];
        this._selOrient = (this._selOrient + 1) % orients.length;
        this._refreshPieces(); this._refreshBoard();
      }
      if ((e.key==='e'||e.key==='E') && this._selPiece>=0) {
        const orients = this._game.ORIENTATIONS[this._selPiece];
        this._selOrient = (this._selOrient - 1 + orients.length) % orients.length;
        this._refreshPieces(); this._refreshBoard();
      }
    };
    window.addEventListener('keydown', this._onKey);
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:won',     this._onWon);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    window.removeEventListener('keydown', this._onKey);
  }

  _onTick({ state, action }) {
    this._state = state;
    if (action === 'play') { this._selPiece=-1; this._selOrient=0; }
    if (state.status === 'playing') { this._refreshBoard(); this._refreshPieces(); }
  }

  _onOver({ result, icon, title, score, best, extraInfo }) {
    this._overlay.showGameOver(
      { result, icon, title, score, best, isRecord: false, extraInfo },
      () => { this._overlay.hide(); this._game.start({ mode: this._game.state?.mode }); }
    );
  }

  _onWon({ result, icon, title, score, best, isRecord, extraInfo }) {
    this._overlay.showGameOver(
      { result, icon, title, score, best, isRecord, extraInfo },
      () => { this._overlay.hide(); this._game.start({ mode: this._game.state?.mode }); }
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); this._refreshBoard(); this._refreshPieces(); }
  _onRestart() { this._selPiece=-1; this._selOrient=0; this._showStart(); }

  // ── Styles ────────────────────────────────────────────────────────────────

  _injectStyles() {
    if (document.getElementById(`${ID}-styles`)) return;
    const s = document.createElement('style');
    s.id = `${ID}-styles`;
    s.textContent = `
      .${ID}-wrapper {
        position: absolute; inset: 0;
        display: flex; align-items: flex-start; justify-content: center;
        background: #05080f; padding: 8px; box-sizing: border-box;
        font-family: Orbitron, monospace; gap: 10px; overflow: hidden;
      }
      .${ID}-board {
        display: grid; gap: 1px; background: #0a1220;
        border: 1px solid #1a2540; flex-shrink: 0;
        width: min(50vmin, 360px); height: min(50vmin, 360px);
        align-self: center;
      }
      .${ID}-cell {
        background: #0d1828; transition: background .08s;
        cursor: pointer; border-radius: 1px;
      }
      .${ID}-cell--blue    { background: #2255ee; }
      .${ID}-cell--red     { background: #dd2233; }
      .${ID}-cell--preview { background: rgba(50,120,255,.6); }
      .${ID}-cell--invalid { background: rgba(255,50,50,.4); }
      .${ID}-panel {
        display: flex; flex-direction: column; gap: 8px;
        width: 140px; flex-shrink: 0; overflow: hidden;
      }
      .${ID}-score { color: #aabbcc; font-size: 0.7rem; letter-spacing: 1px; }
      .${ID}-hint  { color: #445566; font-size: 0.55rem; letter-spacing: .5px; line-height: 1.6; }
      .${ID}-pieces {
        display: flex; flex-wrap: wrap; gap: 4px; align-content: flex-start;
        overflow-y: auto; flex: 1; padding: 2px;
      }
      .${ID}-mini {
        cursor: pointer; border: 1px solid #1a2540; border-radius: 3px;
        padding: 2px; background: #0d1220; transition: border-color .15s;
        box-sizing: content-box;
      }
      .${ID}-mini:hover  { border-color: #3355aa; }
      .${ID}-mini--sel   { border-color: #5588ff !important; box-shadow: 0 0 6px rgba(85,136,255,.4); }
    `;
    document.head.appendChild(s);
  }
}
