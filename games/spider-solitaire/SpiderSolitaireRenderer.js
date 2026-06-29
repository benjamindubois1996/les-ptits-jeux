import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const PREFIX = 'sp';

export default class SpiderSolitaireRenderer {
  constructor(game, viewport, config) {
    this._game     = game;
    this._vp       = viewport;
    this._cfg      = config;
    this._wrapper  = null;
    this._overlay  = null;
    this._handlers = {};
    this._keyH     = null;
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
    document.getElementById(`${PREFIX}-styles`)?.remove();
  }

  _injectStyles() {
    if (document.getElementById(`${PREFIX}-styles`)) return;
    const s = document.createElement('style');
    s.id = `${PREFIX}-styles`;
    s.textContent = `
.sp-wrapper {
  position:absolute; inset:0; display:flex; flex-direction:column;
  align-items:center; padding:6px; box-sizing:border-box; gap:4px;
  font-family:Orbitron,monospace; overflow:hidden; background:#0a3322;
}
.sp-hud { display:flex; align-items:center; gap:12px; font-size:.65rem; color:#9ab; width:100%; }
.sp-hud .sp-hud-val { color:#ffd700; }
.sp-hud .sp-stock-btn { padding:4px 10px; background:#1a6644; border:none; border-radius:4px;
  color:#fff; cursor:pointer; font-size:.65rem; font-family:Orbitron,monospace; }
.sp-hud .sp-stock-btn:hover { background:#1e7a50; }
.sp-hud .sp-stock-btn:disabled { opacity:.4; cursor:default; }
.sp-tableau {
  flex:1; width:100%; display:flex; gap:3px; overflow:hidden; align-items:flex-start;
}
.sp-col {
  flex:1; min-width:0; display:flex; flex-direction:column; align-items:center;
  position:relative; min-height:60px; overflow:visible;
}
.sp-col-empty {
  width:44px; height:62px; border:1.5px dashed #1a6644; border-radius:6px;
  cursor:pointer; flex-shrink:0;
}
.sp-card {
  width:44px; height:62px; border-radius:6px; border:1px solid #ccc;
  background:#fff; display:flex; flex-direction:column; align-items:center;
  justify-content:space-between; padding:3px; box-sizing:border-box;
  position:relative; font-weight:700; cursor:pointer; flex-shrink:0;
  user-select:none;
}
.sp-card.red   { color:#cc0000; }
.sp-card.black { color:#111; }
.sp-card .c-tl { font-size:.58rem; line-height:1.2; align-self:flex-start; }
.sp-card .c-mid { font-size:1rem; }
.sp-card .c-br { font-size:.58rem; line-height:1.2; align-self:flex-end; transform:rotate(180deg); }
.sp-card.back {
  background:repeating-linear-gradient(45deg,#0d5c2e 0,#0d5c2e 4px,#0a7a3c 4px,#0a7a3c 8px);
}
.sp-card.selected { outline:2.5px solid #ffd700; transform:translateY(-4px); z-index:5; }
.sp-card.movable  { outline:1px solid rgba(255,215,0,.4); }
.sp-col .sp-card { margin-top:-44px; }
.sp-col .sp-card:first-child { margin-top:0; }
.sp-col .sp-card.back { margin-top:-54px; }
.sp-col .sp-card.back:first-child { margin-top:0; }
.sp-drag-over { outline:2px dashed #ffd700 !important; }
.sp-foundations { display:flex; gap:4px; }
.sp-foundation { width:40px; height:56px; border:1.5px dashed #1a6644; border-radius:5px;
  display:flex; align-items:center; justify-content:center; font-size:.65rem; color:#1a6644; }
.sp-foundation.done { background:#0d5c2e; border-color:#ffd700; color:#ffd700; }
`;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'sp-wrapper';
    this._wrapper.innerHTML = `
      <div class="sp-hud" id="sp-hud">
        <span>Suites : <span class="sp-hud-val" id="sp-completed">0/8</span></span>
        <span>Coups : <span class="sp-hud-val" id="sp-moves">0</span></span>
        <span>Score : <span class="sp-hud-val" id="sp-score">0</span></span>
        <button class="sp-stock-btn" id="sp-stock-btn">Piocher (×<span id="sp-stock-left">5</span>)</button>
      </div>
      <div class="sp-tableau" id="sp-tableau"></div>
    `;
    this._vp.appendChild(this._wrapper);
  }

  _showStart() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique', options: [{ value: 'basique', label: '1 COULEUR' }] }],
      sel => { this._overlay.hide(); this._game.start({ mode: sel.mode }); },
      { extraHtml: `<div style="color:rgba(255,255,255,.5);font-size:10px;text-align:center;line-height:2;margin-bottom:4px">
        104 cartes · Forme 8 suites K→A pour gagner<br>
        Clic = sélectionner · Clic colonne = poser · Stock = piocher
      </div>` }
    );
  }

  _bindEvents() {
    this._on('game:tick', e => {
      if (e.action === 'restart') { this._showStart(); return; }
      this._render(e.state);
    });
    this._on('game:paused',  () => this._overlay.showPause(() => EventBus.emit('game:pause-toggle')));
    this._on('game:resumed', () => this._overlay.hide());
    this._on('game:over',    e => this._showEnd(false, e?.score ?? 0));
    this._on('game:won',     e => this._showEnd(true,  e?.score ?? 0));

    this._q('#sp-stock-btn').addEventListener('click', () => this._game.dealStock());

    this._keyH = e => {
      if (e.key === 'p' || e.key === 'P') EventBus.emit('game:pause-toggle');
      if (e.key === 'r' || e.key === 'R') EventBus.emit('game:restart');
    };
    document.addEventListener('keydown', this._keyH);
  }

  _unbindEvents() {
    Object.entries(this._handlers).forEach(([evt, fn]) => EventBus.off(evt, fn));
    if (this._keyH) document.removeEventListener('keydown', this._keyH);
  }

  _on(evt, fn) { this._handlers[evt] = fn; EventBus.on(evt, fn); }
  _q(sel) { return this._wrapper.querySelector(sel); }

  _render(s) {
    if (!s || s.status === 'idle') return;

    this._q('#sp-completed').textContent  = `${s.completed}/8`;
    this._q('#sp-moves').textContent      = s.moves;
    this._q('#sp-score').textContent      = s.score;
    this._q('#sp-stock-left').textContent = s.stockDeals;
    this._q('#sp-stock-btn').disabled     = s.stockDeals <= 0 || s.stock.length < 10;

    const tableau = this._q('#sp-tableau');
    tableau.innerHTML = '';

    s.columns.forEach((col, colIdx) => {
      const colEl = document.createElement('div');
      colEl.className = 'sp-col';

      if (col.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'sp-col-empty';
        empty.addEventListener('click', () => this._game.moveTo(colIdx));
        colEl.appendChild(empty);
      } else {
        col.forEach((card, cardIdx) => {
          const el = this._cardEl(card, colIdx, cardIdx, s.selected);
          colEl.appendChild(el);
        });
        colEl.addEventListener('click', e => {
          if (e.target === colEl) this._game.moveTo(colIdx);
        });
      }
      tableau.appendChild(colEl);
    });
  }

  _cardEl(card, colIdx, cardIdx, selected) {
    const el = document.createElement('div');
    if (!card.faceUp) {
      el.className = 'sp-card back';
      el.addEventListener('click', e => {
        e.stopPropagation();
        if (selected) this._game.moveTo(colIdx);
      });
    } else {
      const isSel = selected?.col === colIdx && selected?.idx === cardIdx;
      el.className = `sp-card ${card.isRed ? 'red' : 'black'}${isSel ? ' selected' : ''}`;
      el.innerHTML = `
        <span class="c-tl">${card.rank}<br>${card.suit}</span>
        <span class="c-mid">${card.suit}</span>
        <span class="c-br">${card.rank}<br>${card.suit}</span>
      `;
      el.addEventListener('click', e => {
        e.stopPropagation();
        if (selected && (selected.col !== colIdx || selected.idx !== cardIdx)) {
          this._game.moveTo(colIdx);
        } else {
          this._game.select(colIdx, cardIdx);
        }
      });
      this._addDrag(el, colIdx, cardIdx);
    }
    return el;
  }

  _addDrag(el, fromCol, fromIdx) {
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault(); e.stopPropagation();

      this._game.select(fromCol, fromIdx);

      const r = el.getBoundingClientRect();
      const ox = e.clientX - r.left, oy = e.clientY - r.top;

      const g = el.cloneNode(true);
      Object.assign(g.style, {
        position:'fixed', pointerEvents:'none', zIndex:'9999',
        width:`${r.width}px`, height:`${r.height}px`,
        left:`${e.clientX - ox}px`, top:`${e.clientY - oy}px`,
        opacity:'.85', transform:'rotate(2deg) scale(1.05)',
        boxShadow:'0 8px 24px rgba(0,0,0,.6)', transition:'none',
      });
      document.body.appendChild(g);
      el.style.opacity = '.3';

      let hoveredCol = null;
      const cols = () => this._wrapper.querySelectorAll('.sp-col');

      const mv = e => {
        g.style.left = `${e.clientX - ox}px`;
        g.style.top  = `${e.clientY - oy}px`;
        // Highlight colonne cible
        cols().forEach((c, i) => {
          const rect = c.getBoundingClientRect();
          if (e.clientX >= rect.left && e.clientX <= rect.right) {
            c.classList.add('sp-drag-over'); hoveredCol = i;
          } else {
            c.classList.remove('sp-drag-over');
          }
        });
      };

      const up = () => {
        document.removeEventListener('pointermove', mv, true);
        document.removeEventListener('pointerup', up, true);
        g.remove(); el.style.opacity = '';
        cols().forEach(c => c.classList.remove('sp-drag-over'));
        if (hoveredCol !== null && hoveredCol !== fromCol) {
          this._game.moveTo(hoveredCol);
        }
      };

      document.addEventListener('pointermove', mv, true);
      document.addEventListener('pointerup', up, true);
    });
  }

  _showEnd(won, score) {
    const s = this._game.state;
    this._overlay.showGameOver(
      {
        result:    won ? 'win' : 'lose',
        score,
        extraInfo: won
          ? `<div style="font-size:.7rem;color:#9ab;text-align:center">${s?.moves ?? 0} coups</div>`
          : `<div style="font-size:.7rem;color:#9ab;text-align:center">${s?.completed ?? 0}/8 suites complétées · ${s?.moves ?? 0} coups</div>`,
      },
      () => EventBus.emit('game:restart')
    );
  }
}
