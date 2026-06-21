import EventBus    from '../../js/core/EventBus.js';
import GameOverlay  from '../../js/ui/components/GameOverlay.js';

const COLS = 'ABCDEFGHIJKL'.split('');
const ROWS = Array.from({ length: 12 }, (_, i) => String(i + 1));

export default class BattleshipRenderer {

  constructor(game, container, config) {
    this.game          = game;
    this.container     = container;
    this.config        = config;
    this._wrapper      = null;
    this._subs         = [];
    this._selectedSize = config.gameplay.defaultGridSize ?? 'M';
  }

  /* ============================================================
     CYCLE DE VIE
     ============================================================ */

  init() {
    this._injectStyles();
    this._buildLayout();
    this._bindEvents();
  }

  destroy() {
    this._subs.forEach(([ev, fn]) => EventBus.off(ev, fn));
    this._subs = [];
    this._overlay?.destroy();
    if (this._wrapper) { this._wrapper.remove(); this._wrapper = null; }
  }

  /* ============================================================
     CONSTRUCTION DU DOM
     ============================================================ */

  _buildLayout() {
    const w = document.createElement('div');
    w.className = 'bs-wrap';
    w.innerHTML = `

      <!-- ===== PHASE PLACEMENT ===== -->
      <div class="bs-screen hidden" id="bs-placing">
        <p class="bs-title">POSITIONNEZ VOS NAVIRES</p>
        <p class="bs-hint">Cliquez sur la grille pour placer · <kbd>R</kbd> pour pivoter</p>
        <div class="bs-fleet-place" id="bs-fleet-place"></div>
        <div class="bs-orient" id="bs-orient">↔ Horizontal</div>
        <div id="bs-board-place"></div>
      </div>

      <!-- ===== PHASE BATAILLE ===== -->
      <div class="bs-screen hidden" id="bs-battle">
        <div class="bs-turn" id="bs-turn">Votre tour</div>
        <div class="bs-battle-row">
          <div class="bs-zone">
            <div class="bs-zone-label">Zone ennemie</div>
            <div id="bs-board-enemy"></div>
          </div>
          <div class="bs-sidebar">
            <div class="bs-stat"><span class="bs-stat-l">SCORE</span><span class="bs-stat-v" id="bs-score">0</span></div>
            <div class="bs-stat"><span class="bs-stat-l">VOTRE FLOTTE</span><span class="bs-stat-v" id="bs-pl-rem">5</span></div>
            <div class="bs-stat"><span class="bs-stat-l">FLOTTE ENNEMIE</span><span class="bs-stat-v" id="bs-en-rem">5</span></div>
            <div class="bs-fleet-battle" id="bs-fleet-battle"></div>
          </div>
          <div class="bs-zone">
            <div class="bs-zone-label">Votre flotte</div>
            <div id="bs-board-player"></div>
          </div>
        </div>
      </div>

    `;

    this.container.appendChild(w);
    this._wrapper = w;

    this._overlay = new GameOverlay(w);
    this._showStartScreen();
  }

  _optionGroups() {
    const sizes = this.config.gameplay.gridSizes ?? [];
    return [
      { key: 'mode', label: 'MODE',   default: 'basique',         options: [{ value: 'basique', label: 'BASIQUE' }] },
      { key: 'size', label: 'GRILLE', default: this._selectedSize, options: sizes.map(s => ({ value: s.id, label: s.label })) },
    ];
  }

  _showStartScreen() {
    this._overlay.showStart(this._optionGroups(), (selections) => {
      this._selectedSize = selections.size;
      this.game.start({ gridSizeId: this._selectedSize });
    }, { extraHtml: '<div class="overlay-icon">⚓</div><div class="overlay-score">Coule la flotte ennemie avant d\'être coulé !</div>' });
  }

  /* Reconstruit les 3 plateaux avec la bonne taille */
  _rebuildBoards(gridSize) {
    ['bs-board-place', 'bs-board-enemy', 'bs-board-player'].forEach(id => {
      const el = this._el(id);
      if (el) el.innerHTML = '';
      this._buildBoard(id, id === 'bs-board-place' ? 'place' : 'battle', gridSize);
    });
  }

  _buildBoard(containerId, variant, gridSize) {
    const el = this._el(containerId);
    if (!el) return;

    const G    = gridSize;
    const cw   = variant === 'place' ? this._cellPx(G, 'place')  : this._cellPx(G, 'battle');
    const rh   = cw;
    const hdrW = G >= 10 ? 22 : 18;
    const hdrH = 18;

    const board = document.createElement('div');
    board.className = `bs-board`;
    board.style.gridTemplateColumns = `${hdrW}px repeat(${G}, ${cw}px)`;
    board.style.gridTemplateRows    = `${hdrH}px repeat(${G}, ${rh}px)`;

    // Corner
    let html = '<div class="bs-cell bs-cell--hdr"></div>';
    // Column headers
    COLS.slice(0, G).forEach(c => {
      html += `<div class="bs-cell bs-cell--hdr">${c}</div>`;
    });
    // Rows
    for (let r = 0; r < G; r++) {
      html += `<div class="bs-cell bs-cell--hdr">${ROWS[r]}</div>`;
      for (let c = 0; c < G; c++) {
        html += `<div class="bs-cell" data-cell="${r * G + c}"></div>`;
      }
    }

    board.innerHTML = html;
    el.appendChild(board);
  }

  _cellPx(gridSize, variant) {
    if (variant === 'place') return gridSize <= 8 ? 40 : gridSize <= 10 ? 34 : 28;
    return gridSize <= 8 ? 32 : gridSize <= 10 ? 26 : 22;
  }

  /* ============================================================
     BINDING ÉVÉNEMENTS
     ============================================================ */

  _bindEvents() {
    const sub = (ev, fn) => { EventBus.on(ev, fn); this._subs.push([ev, fn]); };

    sub('game:tick',    ({ state, action }) => this._render(state, action));
    sub('game:won',     data => this._showWon(data));
    sub('game:over',    data => this._showLost(data));
    sub('game:paused',  ()   => this._overlay.showPause(() => EventBus.emit('game:pause-toggle')));
    sub('game:resumed', ()   => this._overlay.hide());

    // Délégation sur les conteneurs — survit à _rebuildBoards()
    const placeContainer = this._el('bs-board-place');
    if (placeContainer) {
      placeContainer.addEventListener('mouseover', e => {
        const cell = this._cellIdx(e);
        if (cell !== null) this.game.previewPlacement(cell);
      });
      placeContainer.addEventListener('mouseleave', () => this.game.clearPreview());
      placeContainer.addEventListener('click', e => {
        const cell = this._cellIdx(e);
        if (cell !== null) this.game.placeShip(cell);
      });
    }

    const enemyContainer = this._el('bs-board-enemy');
    if (enemyContainer) {
      enemyContainer.addEventListener('click', e => {
        const cell = this._cellIdx(e);
        if (cell !== null) this.game.shoot(cell);
      });
    }
  }

  _cellIdx(e) {
    const el = e.target.closest('[data-cell]');
    return el ? parseInt(el.dataset.cell) : null;
  }

  _el(id) { return document.getElementById(id); }

  /* ============================================================
     RENDU PRINCIPAL
     ============================================================ */

  _render(state, action) {
    if (!state) return;

    switch (state.status) {
      case 'idle':
        this._showScreen(null);
        this._showStartScreen();
        break;

      case 'placing':
        this._overlay.hide();
        this._showScreen('bs-placing');
        if (action === 'start-placing') this._rebuildBoards(state.gridSize);
        this._renderPlacing(state);
        break;

      case 'playing':
      case 'won':
      case 'gameover':
        this._overlay.hide();
        this._showScreen('bs-battle');
        this._renderBattle(state);
        break;
    }
  }

  /* ============================================================
     PHASE PLACEMENT
     ============================================================ */

  _renderPlacing(state) {
    const orient = this._el('bs-orient');
    if (orient) orient.textContent = state.orientation === 'h' ? '↔ Horizontal' : '↕ Vertical';

    const fleet = this._el('bs-fleet-place');
    if (fleet) {
      fleet.innerHTML = state.playerShips.map((ship, i) => {
        let cls = 'bs-ship';
        if (ship.cells.length) cls += ' bs-ship--placed';
        if (i === state.currentShipIdx) cls += ' bs-ship--current';
        return `<div class="${cls}">
          <span class="bs-ship-name">${ship.name}</span>
          <div class="bs-ship-cells">
            ${Array(ship.size).fill('<div class="bs-ship-cell"></div>').join('')}
          </div>
        </div>`;
      }).join('');
    }

    const boardEl = this._el('bs-board-place')?.querySelector('.bs-board');
    this._renderBoard(boardEl, state.playerGrid, {
      showShips: true,
      preview: { cells: state.previewCells, valid: state.previewValid },
    });
  }

  /* ============================================================
     PHASE BATAILLE
     ============================================================ */

  _renderBattle(state) {
    const isPlayerTurn = state.status === 'playing' && state.turn === 'player';
    const isGameOver   = state.status === 'gameover';

    const turnEl = this._el('bs-turn');
    if (turnEl) {
      if (state.status === 'playing') {
        turnEl.textContent = state.turn === 'player'
          ? 'Votre tour — Choisissez une cible'
          : "Tour de l'ennemi…";
        turnEl.className = `bs-turn bs-turn--${state.turn === 'player' ? 'player' : 'enemy'}`;
      } else if (isGameOver) {
        turnEl.textContent = 'Défaite — Flotte coulée !';
        turnEl.className = 'bs-turn bs-turn--over';
      }
    }

    const scoreEl = this._el('bs-score');
    if (scoreEl) scoreEl.textContent = state.score;
    const plRem = this._el('bs-pl-rem');
    if (plRem) plRem.textContent = state.playerRemaining;
    const enRem = this._el('bs-en-rem');
    if (enRem) enRem.textContent = state.enemiesRemaining;

    const fleetEl = this._el('bs-fleet-battle');
    if (fleetEl) {
      fleetEl.innerHTML = state.playerShips.map(ship => `
        <div class="bs-ship-row ${ship.sunk ? 'bs-ship-row--sunk' : ''}">
          <div class="bs-ship-cells">
            ${Array(ship.size).fill('<div class="bs-ship-cell"></div>').join('')}
          </div>
        </div>
      `).join('');
    }

    this._renderBoard(
      this._el('bs-board-enemy')?.querySelector('.bs-board'),
      state.enemyGrid,
      { showShips: isGameOver, interactive: isPlayerTurn }
    );
    this._renderBoard(
      this._el('bs-board-player')?.querySelector('.bs-board'),
      state.playerGrid,
      { showShips: true }
    );
  }

  /* ============================================================
     RENDU GÉNÉRIQUE D'UN PLATEAU
     ============================================================ */

  _renderBoard(boardEl, grid, opts = {}) {
    if (!boardEl || !grid) return;
    boardEl.querySelectorAll('.bs-cell[data-cell]').forEach(el => {
      const idx = parseInt(el.dataset.cell);
      const val = grid[idx];
      el.className   = 'bs-cell';
      el.textContent = '';

      const inPreview = opts.preview?.cells?.includes(idx);
      if (inPreview) {
        el.classList.add(opts.preview.valid ? 'bs-cell--prev-ok' : 'bs-cell--prev-err');
      } else if (val === 'hit') {
        el.classList.add('bs-cell--hit');
        el.textContent = '×';
      } else if (val === 'miss') {
        el.classList.add('bs-cell--miss');
        el.textContent = '•';
      } else if (val === 'ship' && opts.showShips) {
        el.classList.add('bs-cell--ship');
      } else if (opts.interactive && val !== 'hit' && val !== 'miss') {
        el.classList.add('bs-cell--target');
      }
    });
  }

  /* ============================================================
     ÉCRAN VICTOIRE
     ============================================================ */

  _showWon(data) {
    this._overlay.showGameOver(
      { result: 'win', score: data.score, isRecord: data.isRecord },
      () => EventBus.emit('game:restart'),
      () => EventBus.emit('game:exit'),
    );
  }

  _showLost(data) {
    this._overlay.showGameOver(
      { result: 'lose', score: data.score, isRecord: data.isRecord },
      () => EventBus.emit('game:restart'),
      () => EventBus.emit('game:exit'),
    );
  }

  /* ============================================================
     UTILITAIRES DOM
     ============================================================ */

  _showScreen(id) {
    ['bs-placing', 'bs-battle'].forEach(s => {
      const el = this._el(s);
      if (el) el.classList.toggle('hidden', s !== id);
    });
  }

  _show(id) { const el = this._el(id); if (el) el.classList.remove('hidden'); }
  _hide(id) { const el = this._el(id); if (el) el.classList.add('hidden'); }

  /* ============================================================
     STYLES INJECTÉS
     ============================================================ */

  _injectStyles() {
    if (document.getElementById('bs-css')) return;
    const s = document.createElement('style');
    s.id = 'bs-css';
    s.textContent = `

    .bs-wrap {
      position: relative;
      width: 100%;
      height: 100%;
      min-height: 500px;
    }

    /* Screens */
    .bs-screen {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      padding: 16px 12px;
      width: 100%;
      box-sizing: border-box;
    }
    .bs-screen.hidden { display: none !important; }

    /* Écrans démarrage / pause / fin de partie : entièrement gérés par
       GameOverlay (js/ui/components/GameOverlay.js), monté sur .bs-wrap.
       Voir .ov-* dans index.html pour le CSS associé. */

    /* Titles / hints */
    .bs-title {
      font-family: var(--font-display);
      font-size: var(--text-base);
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: 0.1em;
      margin: 0;
    }
    .bs-hint { font-size: 12px; color: var(--text-muted); margin: 0; }
    .bs-hint kbd {
      background: rgba(255,255,255,0.1);
      padding: 1px 6px;
      border-radius: 3px;
      font-family: monospace;
      font-size: 11px;
    }

    /* Orientation badge */
    .bs-orient {
      font-family: var(--font-display);
      font-size: 11px;
      color: var(--neon-cyan);
      letter-spacing: 0.1em;
      background: rgba(0,255,225,0.08);
      border: 1px solid rgba(0,255,225,0.25);
      padding: 4px 14px;
      border-radius: var(--radius-sm);
    }

    /* Ship list (placement phase) */
    .bs-fleet-place { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
    .bs-ship {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 6px 10px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: rgba(255,255,255,0.02);
      opacity: 0.45;
      transition: all 0.2s;
    }
    .bs-ship--current {
      border-color: var(--neon-cyan);
      box-shadow: 0 0 10px rgba(0,255,225,0.2);
      opacity: 1;
      background: rgba(0,255,225,0.05);
    }
    .bs-ship--placed {
      opacity: 0.75;
      border-color: rgba(0,200,120,0.4);
      background: rgba(0,200,120,0.06);
    }
    .bs-ship-name { font-size: 9px; font-family: var(--font-display); color: var(--text-secondary); letter-spacing: 0.04em; }
    .bs-ship-cells { display: flex; gap: 2px; }
    .bs-ship-cell {
      width: 13px; height: 13px;
      background: rgba(0,180,120,0.55);
      border-radius: 2px;
      transition: background 0.2s;
    }
    .bs-ship--current .bs-ship-cell { background: var(--neon-cyan); box-shadow: 0 0 4px rgba(0,255,225,0.5); }
    .bs-ship--placed .bs-ship-cell  { background: rgba(0,200,120,0.75); }

    /* Board */
    .bs-board {
      display: grid;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 4px;
      overflow: hidden;
      user-select: none;
    }

    /* Cells */
    .bs-cell {
      display: flex;
      align-items: center;
      justify-content: center;
      border-right: 1px solid rgba(255,255,255,0.06);
      border-bottom: 1px solid rgba(255,255,255,0.06);
      box-sizing: border-box;
      background: rgba(8,18,36,0.7);
      font-size: 12px;
      font-weight: 700;
      transition: background 0.1s;
    }
    .bs-cell--hdr {
      background: rgba(0,0,0,0.45);
      color: var(--text-muted);
      font-family: var(--font-display);
      font-size: 9px;
      letter-spacing: 0.04em;
      font-weight: 400;
    }
    .bs-cell--ship  { background: rgba(0,175,115,0.35); border-color: rgba(0,175,115,0.5); }
    .bs-cell--hit   { background: rgba(255,55,55,0.5); border-color: rgba(255,55,55,0.75); color: #ff7070; font-size: 15px; }
    .bs-cell--miss  { background: rgba(80,110,150,0.2); color: rgba(150,180,220,0.5); font-size: 16px; }
    .bs-cell--prev-ok  { background: rgba(0,255,180,0.25); border-color: rgba(0,255,180,0.7); }
    .bs-cell--prev-err { background: rgba(255,60,60,0.25); border-color: rgba(255,60,60,0.7); }
    .bs-cell--target   { cursor: crosshair; }
    .bs-cell--target:hover { background: rgba(0,200,255,0.18); border-color: rgba(0,200,255,0.45); }

    /* Battle layout */
    .bs-turn {
      font-family: var(--font-display);
      font-size: 11px;
      letter-spacing: 0.1em;
      padding: 5px 18px;
      border-radius: var(--radius-sm);
      text-align: center;
      transition: all 0.3s;
    }
    .bs-turn--player { color: var(--neon-cyan); background: rgba(0,255,225,0.07); border: 1px solid rgba(0,255,225,0.25); }
    .bs-turn--enemy  { color: #ff6666; background: rgba(255,60,60,0.07); border: 1px solid rgba(255,60,60,0.25); }
    .bs-turn--over   { color: #ff6666; background: rgba(255,60,60,0.1); border: 1px solid rgba(255,60,60,0.3); }

    .bs-battle-row {
      display: flex;
      gap: 14px;
      align-items: flex-start;
      justify-content: center;
      flex-wrap: wrap;
    }
    .bs-zone { display: flex; flex-direction: column; gap: 6px; align-items: center; }
    .bs-zone-label {
      font-family: var(--font-display);
      font-size: 9px;
      color: var(--text-muted);
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    /* Sidebar */
    .bs-sidebar {
      display: flex;
      flex-direction: column;
      gap: 10px;
      align-items: center;
      min-width: 80px;
      padding-top: 22px;
    }
    .bs-stat { display: flex; flex-direction: column; align-items: center; gap: 1px; }
    .bs-stat-l { font-family: var(--font-display); font-size: 8px; color: var(--text-muted); letter-spacing: 0.1em; text-align: center; }
    .bs-stat-v { font-family: var(--font-display); font-size: var(--text-xl); font-weight: 700; color: var(--neon-cyan); text-shadow: var(--glow-cyan); }

    /* Fleet status (sidebar) */
    .bs-fleet-battle { display: flex; flex-direction: column; gap: 5px; align-items: center; margin-top: 4px; }
    .bs-ship-row { transition: opacity 0.3s; }
    .bs-ship-row .bs-ship-cells { gap: 1px; }
    .bs-ship-row .bs-ship-cell  { width: 10px; height: 10px; }
    .bs-ship-row--sunk { opacity: 0.25; }
    .bs-ship-row--sunk .bs-ship-cell { background: rgba(100,100,100,0.5); }

    `;
    document.head.appendChild(s);
  }
}
