import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const ID = 'mmc';

export default class MiniMotsCroisesRenderer {
  constructor(game, viewport, config) {
    this._game = game; this._vp = viewport;
    this._wrapper = null; this._overlay = null; this._state = null;
    this._onTick = this._onTick.bind(this);
    this._onWon  = this._onWon.bind(this);
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

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = `${ID}-wrapper`;

    this._header = document.createElement('div');
    this._header.className = `${ID}-header`;

    this._gridEl = document.createElement('div');
    this._gridEl.className = `${ID}-grid-area`;

    this._cluesEl = document.createElement('div');
    this._cluesEl.className = `${ID}-clues`;

    this._wrapper.append(this._header, this._gridEl, this._cluesEl);
    this._vp.appendChild(this._wrapper);
  }

  _showStart() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] }],
      sel => { this._overlay.hide(); this._game.start(sel); },
      { extraHtml: `<div style="color:rgba(255,255,255,0.5);font-size:10px;text-align:center;line-height:1.8;margin-bottom:4px">
        Clique sur une case, puis tape les lettres<br>
        Clique deux fois pour changer de direction<br>
        3 grilles à compléter !
      </div>` }
    );
  }

  _renderGrid(s) {
    if (!s.puzzle) return;
    const p = s.puzzle;
    this._gridEl.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = `${ID}-grid`;
    grid.style.gridTemplateColumns = `repeat(${p.cols}, 1fr)`;
    grid.style.gridTemplateRows    = `repeat(${p.rows}, 1fr)`;

    const selWord = s.selWord;
    const inSel = new Set();
    if (selWord) {
      for (let i = 0; i < selWord.answer.length; i++) {
        const [wr, wc] = selWord.dir === 'A'
          ? [selWord.r, selWord.c + i]
          : [selWord.r + i, selWord.c];
        inSel.add(`${wr},${wc}`);
      }
    }

    for (let r = 0; r < p.rows; r++) {
      for (let c = 0; c < p.cols; c++) {
        const cell = document.createElement('div');
        const ch = p.grid[r][c];
        if (ch === '#') {
          cell.className = `${ID}-cell ${ID}-cell--black`;
        } else {
          cell.className = `${ID}-cell`;
          if (s.selected?.[0] === r && s.selected?.[1] === c) cell.classList.add(`${ID}-cell--active`);
          else if (inSel.has(`${r},${c}`)) cell.classList.add(`${ID}-cell--sel`);
          const num = s.numbered[`${r},${c}`];
          if (num) {
            const nb = document.createElement('span');
            nb.className = `${ID}-num`;
            nb.textContent = num;
            cell.appendChild(nb);
          }
          const letter = document.createElement('span');
          letter.className = `${ID}-letter`;
          const typed = s.userGrid[r]?.[c] ?? '';
          letter.textContent = typed;
          if (typed && typed === ch) letter.classList.add(`${ID}-letter--ok`);
          cell.appendChild(letter);
          cell.addEventListener('click', () => this._game.select(r, c));
        }
        grid.appendChild(cell);
      }
    }
    this._gridEl.appendChild(grid);
  }

  _renderClues(s) {
    if (!s.puzzle) return;
    const p = s.puzzle;
    const across = p.words.filter(w => w.dir === 'A');
    const down   = p.words.filter(w => w.dir === 'D');
    const num    = s.numbered;

    const clueItem = (w) => {
      const [sr, sc] = [w.r, w.c];
      const n = num[`${sr},${sc}`] ?? '?';
      const div = document.createElement('div');
      div.className = `${ID}-clue` + (s.selWord === w ? ` ${ID}-clue--sel` : '');
      div.textContent = `${n}${w.dir} — ${w.clue}`;
      div.addEventListener('click', () => {
        this._game.state.selDir = w.dir;
        this._game.select(w.r, w.c);
      });
      return div;
    };

    this._cluesEl.innerHTML = '';
    const aH = document.createElement('div');
    aH.className = `${ID}-clue-head`; aH.textContent = 'HORIZONTAUX';
    const dH = document.createElement('div');
    dH.className = `${ID}-clue-head`; dH.textContent = 'VERTICAUX';

    this._cluesEl.append(aH);
    across.forEach(w => this._cluesEl.appendChild(clueItem(w)));
    this._cluesEl.append(dH);
    down.forEach(w => this._cluesEl.appendChild(clueItem(w)));
  }

  _refreshHeader(s) {
    const m = Math.floor(s.elapsed / 60), sec = s.elapsed % 60;
    this._header.innerHTML =
      `<span style="color:#ffe033">${s.score} pts</span>` +
      `<span style="color:#88ffcc">${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}</span>` +
      `<span style="color:#88aaff">Grille ${(s.puzzleIdx ?? 0) + 1}/3</span>`;
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:won',     this._onWon);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);

    this._onKey = e => {
      const s = this._state;
      if (!s || s.status !== 'playing') return;

      const [sr, sc] = s.selected ?? [null, null];

      // P/R only as hotkeys when no cell is selected (otherwise they're letters to type)
      if (sr === null) {
        if (e.key === 'p' || e.key === 'P') { EventBus.emit('game:pause-toggle'); return; }
        if (e.key === 'r' || e.key === 'R') { this._game.restart(); return; }
        return;
      }
      e.preventDefault();

      if (e.key === 'Backspace') {
        this._game.clearCell(sr, sc);
        this._moveSel(s, -1);
      } else if (e.key === 'Tab' || e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        this._moveSel(s, 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        this._moveSel(s, -1);
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        this._game.typeChar(sr, sc, e.key);
        this._moveSel(s, 1);
      }
    };
    window.addEventListener('keydown', this._onKey);
  }

  _moveSel(s, delta) {
    if (!s.selected || !s.selWord) return;
    const w = s.selWord;
    const [cr, cc] = s.selected;
    const nr = w.dir === 'D' ? cr + delta : cr;
    const nc = w.dir === 'A' ? cc + delta : cc;
    if (nr >= w.r && nc >= w.c &&
        (w.dir === 'A' ? nc < w.c + w.answer.length : nr < w.r + w.answer.length)) {
      this._game.select(nr, nc);
    }
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:won',     this._onWon);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    window.removeEventListener('keydown', this._onKey);
  }

  _onTick({ state, action }) {
    this._state = state;
    if (state.status !== 'playing') return;
    this._refreshHeader(state);
    if (action !== 'timer') { this._renderGrid(state); this._renderClues(state); }
  }

  _onWon(data) {
    this._overlay.showGameOver(data, () => { this._overlay.hide(); this._game.start({}); });
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); }
  _onRestart() { this._showStart(); }

  _injectStyles() {
    if (document.getElementById(`${ID}-styles`)) return;
    const s = document.createElement('style');
    s.id = `${ID}-styles`;
    s.textContent = `
      .${ID}-wrapper {
        position:absolute;inset:0;display:flex;flex-direction:column;
        align-items:center;gap:6px;padding:8px 10px;box-sizing:border-box;
        font-family:Orbitron,monospace;background:#05080f;overflow:hidden;
      }
      .${ID}-header {
        display:flex;gap:16px;font-size:0.72rem;letter-spacing:1px;
        align-items:center;justify-content:center;width:100%;flex-wrap:wrap;
      }
      .${ID}-grid-area { display:flex;align-items:center;justify-content:center;flex:1;min-height:0; }
      .${ID}-grid {
        display:grid;gap:2px;
      }
      .${ID}-cell {
        width:clamp(28px,7vw,40px);height:clamp(28px,7vw,40px);
        background:#0d1a30;border:1px solid #1e3a6a;
        position:relative;display:flex;align-items:center;justify-content:center;
        cursor:pointer;transition:background .1s;
      }
      .${ID}-cell:hover { background:#162240; }
      .${ID}-cell--black { background:#000;border-color:#000;cursor:default; }
      .${ID}-cell--sel  { background:#0a2060;border-color:#3366cc; }
      .${ID}-cell--active { background:#1a4080;border-color:#55aaff; }
      .${ID}-num { position:absolute;top:1px;left:2px;font-size:0.45rem;color:#7aadff;line-height:1; }
      .${ID}-letter { font-size:clamp(0.7rem,2.5vw,1rem);font-weight:700;color:#cce4ff;text-transform:uppercase; }
      .${ID}-letter--ok { color:#48bb78; }
      .${ID}-clues {
        width:100%;max-width:380px;font-size:0.62rem;letter-spacing:.5px;
        overflow-y:auto;max-height:130px;display:flex;flex-wrap:wrap;gap:3px 12px;
      }
      .${ID}-clue-head { width:100%;color:#4477aa;font-size:0.58rem;margin-top:4px; }
      .${ID}-clue { color:#7a9acc;cursor:pointer;padding:2px 0;transition:color .15s; }
      .${ID}-clue:hover { color:#aaccff; }
      .${ID}-clue--sel { color:#ffe033; }
    `;
    document.head.appendChild(s);
  }
}
