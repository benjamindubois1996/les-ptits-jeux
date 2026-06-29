import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const PREFIX = 'he';

export default class HeartsRenderer {
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
.he-wrapper {
  position:absolute; inset:0; display:flex; flex-direction:column;
  align-items:center; padding:6px; box-sizing:border-box; gap:4px;
  font-family:Orbitron,monospace; overflow:hidden; background:#1a0a2e;
}
.he-table {
  flex:1; width:100%; max-width:620px; display:grid;
  grid-template-rows:auto 1fr auto; gap:4px; overflow:hidden;
}
.he-ai-row { display:flex; justify-content:space-between; align-items:flex-start; gap:4px; }
.he-seat { display:flex; flex-direction:column; align-items:center; gap:2px; }
.he-seat-label { font-size:.55rem; color:#9ab; }
.he-seat-score { font-size:.6rem; color:#ffd700; }
.he-ai-hand { display:flex; gap:2px; }
.he-ai-hand .he-card { width:24px; height:36px; }
.he-ai-hand .he-card .c-tl,.he-ai-hand .he-card .c-mid,.he-ai-hand .he-card .c-br { font-size:.5rem; }
.he-trick-area {
  width:180px; height:120px; border:1px dashed #4a0060; border-radius:8px;
  position:relative; display:flex; align-items:center; justify-content:center;
  flex-direction:column; gap:4px; margin:0 auto;
}
.he-message { font-size:.6rem; color:#c8e6ff; text-align:center; min-height:16px; }
.he-trick-grid { display:grid; grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr; gap:4px; }
.he-player-hand { display:flex; gap:3px; justify-content:center; flex-wrap:wrap; }
.he-card {
  width:52px; height:74px; border-radius:7px; border:1.5px solid #ccc;
  background:#fff; display:flex; flex-direction:column; align-items:center;
  justify-content:space-between; padding:3px; box-sizing:border-box;
  font-weight:700; cursor:pointer; user-select:none; flex-shrink:0;
  transition:transform .1s;
}
.he-card.red   { color:#cc0000; }
.he-card.black { color:#111; }
.he-card .c-tl { font-size:.65rem; line-height:1.2; align-self:flex-start; }
.he-card .c-mid { font-size:1.2rem; }
.he-card .c-br { font-size:.65rem; line-height:1.2; align-self:flex-end; transform:rotate(180deg); }
.he-card.back {
  background:repeating-linear-gradient(135deg,#4a0080 0,#4a0080 4px,#5a0099 4px,#5a0099 8px);
}
.he-card.playable { box-shadow:0 0 6px 3px rgba(255,215,0,.7); transform:translateY(-4px); }
.he-drop-zone-active { outline:2px dashed #ffd700 !important; background:rgba(255,215,0,.08) !important; }
`;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'he-wrapper';
    this._wrapper.innerHTML = `
      <div class="he-table" id="he-table">
        <div class="he-ai-row" id="he-ai-row">
          <div class="he-seat" id="he-seat-3">
            <div class="he-seat-label">Ouest</div>
            <div class="he-ai-hand" id="he-hand-3"></div>
            <div class="he-seat-score" id="he-score-3">0 pts</div>
          </div>
          <div class="he-seat" id="he-seat-2">
            <div class="he-seat-label">Nord</div>
            <div class="he-ai-hand" id="he-hand-2"></div>
            <div class="he-seat-score" id="he-score-2">0 pts</div>
          </div>
          <div class="he-seat" id="he-seat-1">
            <div class="he-seat-label">Est</div>
            <div class="he-ai-hand" id="he-hand-1"></div>
            <div class="he-seat-score" id="he-score-1">0 pts</div>
          </div>
        </div>

        <div class="he-trick-area" id="he-trick-area">
          <div class="he-message" id="he-message"></div>
          <div class="he-trick-grid" id="he-trick-grid"></div>
        </div>

        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
          <div class="he-seat-score" id="he-score-0">0 pts</div>
          <div class="he-player-hand" id="he-hand-0"></div>
          <div style="font-size:.55rem;color:#9ab;">Vous (Sud)</div>
        </div>
      </div>
    `;
    this._vp.appendChild(this._wrapper);
  }

  _showStart() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] }],
      _sel => { this._overlay.hide(); this._game.start(); },
      { extraHtml: `<div style="color:rgba(255,255,255,.5);font-size:10px;text-align:center;line-height:2;margin-bottom:4px">
        Évitez les cœurs (1 pt) et la Dame de Pique (13 pts)<br>
        Tirer les marrons = +26 à tous vos adversaires · Premier à 100 pts perd
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

    s.scores.forEach((sc, i) => {
      const el = this._q(`#he-score-${i}`);
      if (el) el.textContent = `${sc} pts`;
    });

    [1, 2, 3].forEach(p => {
      const el = this._q(`#he-hand-${p}`);
      if (!el) return;
      el.innerHTML = '';
      const show = Math.min(s.hands[p].length, 5);
      for (let i = 0; i < show; i++) {
        const c = document.createElement('div');
        c.className = 'he-card back';
        el.appendChild(c);
      }
    });

    const trickGrid = this._q('#he-trick-grid');
    if (trickGrid) {
      trickGrid.innerHTML = '';
      [2, 3, 1, 0].forEach(p => {
        const c = s.trick[p];
        const cell = document.createElement('div');
        if (c) {
          cell.className = `he-card ${c.isRed ? 'red' : 'black'}`;
          cell.innerHTML = `
            <span class="c-tl">${c.rank}<br>${c.suit}</span>
            <span class="c-mid">${c.suit}</span>
            <span class="c-br">${c.rank}<br>${c.suit}</span>
          `;
          if (p === s.leadPlayer) cell.style.outline = '1.5px solid #ffd700';
        } else {
          cell.style.cssText = 'width:40px;height:58px;border:1px dashed #4a0060;border-radius:5px;';
        }
        trickGrid.appendChild(cell);
      });
    }

    this._q('#he-message').textContent = s.message || '';

    const hand0 = this._q('#he-hand-0');
    if (hand0) {
      hand0.innerHTML = '';
      const canPlay = s.currentPlayer === 0 && s.phase === 'trick' && s.status === 'playing';
      s.hands[0].forEach((card, idx) => {
        const el = document.createElement('div');
        el.className = `he-card ${card.isRed ? 'red' : 'black'}`;
        el.innerHTML = `
          <span class="c-tl">${card.rank}<br>${card.suit}</span>
          <span class="c-mid">${card.suit}</span>
          <span class="c-br">${card.rank}<br>${card.suit}</span>
        `;
        if (canPlay) {
          el.classList.add('playable');
          el.addEventListener('click', () => this._game.playCard(idx));
          this._addDrag(el, idx);
        } else {
          el.style.cursor = 'default';
        }
        hand0.appendChild(el);
      });
    }
  }

  _addDrag(el, idx) {
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault(); e.stopPropagation();
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
      const trickArea = this._q('#he-trick-area');
      const mv = e => {
        g.style.left = `${e.clientX - ox}px`;
        g.style.top  = `${e.clientY - oy}px`;
        const tr = trickArea?.getBoundingClientRect();
        if (tr && e.clientX >= tr.left && e.clientX <= tr.right && e.clientY >= tr.top && e.clientY <= tr.bottom) {
          trickArea.classList.add('he-drop-zone-active');
        } else {
          trickArea?.classList.remove('he-drop-zone-active');
        }
      };
      const up = e => {
        document.removeEventListener('pointermove', mv, true);
        document.removeEventListener('pointerup', up, true);
        g.remove(); el.style.opacity = '';
        trickArea?.classList.remove('he-drop-zone-active');
        const handRect = this._q('#he-hand-0')?.getBoundingClientRect();
        if (!handRect || e.clientY < handRect.top - 10) {
          this._game.playCard(idx);
        }
      };
      document.addEventListener('pointermove', mv, true);
      document.addEventListener('pointerup', up, true);
    });
  }

  _showEnd(won, score) {
    const s = this._game.state;
    const names  = s?.names  || ['Vous', 'Est', 'Nord', 'Ouest'];
    const scores = s?.scores || [0, 0, 0, 0];
    const extraInfo = `<div style="font-size:.7rem;color:#9ab;text-align:center;line-height:1.8">
      ${names.map((n, i) => `${n}: ${scores[i]} pts`).join(' &nbsp;|&nbsp; ')}
    </div>`;
    this._overlay.showGameOver(
      { result: won ? 'win' : 'lose', score, extraInfo },
      () => EventBus.emit('game:restart')
    );
  }
}
