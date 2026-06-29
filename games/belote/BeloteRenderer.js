import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const PREFIX = 'be';

export default class BeloteRenderer {
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
.be-wrapper {
  position:absolute; inset:0; display:flex; flex-direction:column;
  align-items:center; padding:6px; box-sizing:border-box; gap:4px;
  font-family:Orbitron,monospace; overflow:hidden; background:#12001a;
}
.be-table {
  flex:1; width:100%; max-width:620px; display:flex; flex-direction:column; gap:5px; overflow:hidden;
}
.be-hud { display:flex; gap:10px; font-size:.6rem; color:#9ab; justify-content:center; align-items:center; }
.be-hud .atout { color:#ffd700; font-size:.8rem; }
.be-hud .score { color:#c8e6ff; }
.be-hud .val   { color:#ffd700; }
.be-ai-row { display:flex; justify-content:space-between; align-items:flex-start; gap:4px; }
.be-seat { display:flex; flex-direction:column; align-items:center; gap:2px; }
.be-seat-label { font-size:.55rem; color:#9ab; }
.be-partner-badge { font-size:.5rem; color:#4caf50; }
.be-center {
  flex:1; display:flex; align-items:center; justify-content:center;
}
.be-trick-grid {
  display:grid; grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr;
  gap:6px; width:110px; height:130px;
}
.be-trick-cell { display:flex; align-items:center; justify-content:center; }
.be-message { font-size:.6rem; color:#c8e6ff; text-align:center; min-height:16px; }
.be-player-area { display:flex; flex-direction:column; align-items:center; gap:3px; }
.be-player-label { font-size:.55rem; color:#9ab; }
.be-hand { display:flex; gap:3px; justify-content:center; flex-wrap:wrap; }
.be-card {
  width:56px; height:80px; border-radius:8px; border:1.5px solid #ccc;
  background:#fff; display:flex; flex-direction:column; align-items:center;
  justify-content:space-between; padding:4px; box-sizing:border-box;
  font-weight:700; cursor:pointer; user-select:none; flex-shrink:0;
  transition:transform .1s;
}
.be-card.red   { color:#cc0000; }
.be-card.black { color:#111; }
.be-card .c-tl { font-size:.7rem; line-height:1.2; align-self:flex-start; }
.be-card .c-mid { font-size:1.3rem; }
.be-card .c-br { font-size:.7rem; line-height:1.2; align-self:flex-end; transform:rotate(180deg); }
.be-card.back {
  background:repeating-linear-gradient(135deg,#2a0040 0,#2a0040 4px,#380055 4px,#380055 8px);
  cursor:default;
}
.be-card.atout-card { outline:2px solid #ffd700; }
.be-card.playable   { box-shadow:0 0 8px 3px rgba(255,215,0,.6); transform:translateY(-5px); }
.be-card.sm { width:28px; height:40px; }
.be-card.sm .c-tl,.be-card.sm .c-mid,.be-card.sm .c-br { font-size:.5rem; }
.be-drop-active { outline:2px dashed #ffd700 !important; background:rgba(255,215,0,.08) !important; }
`;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'be-wrapper';
    this._wrapper.innerHTML = `
      <div class="be-table" id="be-table">
        <div class="be-hud" id="be-hud">
          <span>Atout : <span class="atout" id="be-atout">?</span></span>
          <span>Round : <span class="val" id="be-round">1/4</span></span>
          <span class="score">Vous+Part : <span class="val" id="be-score-0">0</span></span>
          <span class="score">IAs : <span class="val" id="be-score-1">0</span></span>
        </div>

        <div class="be-ai-row">
          <div class="be-seat" id="be-seat-3">
            <div class="be-seat-label">Ouest</div>
            <div class="be-hand be-small" id="be-hand-3"></div>
          </div>
          <div class="be-seat" id="be-seat-2">
            <div class="be-seat-label">Nord</div>
            <div class="be-partner-badge">▲ Partenaire</div>
            <div class="be-hand be-small" id="be-hand-2"></div>
          </div>
          <div class="be-seat" id="be-seat-1">
            <div class="be-seat-label">Est</div>
            <div class="be-hand be-small" id="be-hand-1"></div>
          </div>
        </div>

        <div class="be-center">
          <div class="be-trick-grid" id="be-trick-grid"></div>
        </div>

        <div class="be-message" id="be-message"></div>

        <div class="be-player-area">
          <div class="be-hand" id="be-hand-0"></div>
          <div class="be-player-label">Vous (Sud)</div>
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
        32 cartes · Vous + Nord (partenaire) contre Est + Ouest<br>
        Atout tiré au sort · J=20pts, 9=14pts · 4 rounds
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

    this._q('#be-atout').textContent   = s.atout ? `${s.atout} (${s.atoutLabel})` : '?';
    this._q('#be-round').textContent   = `${s.round}/${s.maxRounds}`;
    this._q('#be-score-0').textContent = s.scores[0];
    this._q('#be-score-1').textContent = s.scores[1];
    this._q('#be-message').textContent = s.message || '';

    [1, 2, 3].forEach(p => {
      const el = this._q(`#be-hand-${p}`);
      if (!el) return;
      el.innerHTML = '';
      s.hands[p].forEach(card => {
        const c = document.createElement('div');
        if (!card.faceUp) {
          c.className = 'be-card back sm';
        } else {
          c.className = `be-card sm ${card.isRed ? 'red' : 'black'}${card.suit === s.atout ? ' atout-card' : ''}`;
          c.innerHTML = `<span class="c-tl">${card.rank}${card.suit}</span>`;
        }
        el.appendChild(c);
      });
    });

    const grid = this._q('#be-trick-grid');
    if (grid) {
      grid.innerHTML = '';
      [2, 3, 1, 0].forEach(p => {
        const cell = document.createElement('div');
        cell.className = 'be-trick-cell';
        const c = s.trick[p];
        if (c) {
          const el = document.createElement('div');
          el.className = `be-card ${c.isRed ? 'red' : 'black'}${c.suit === s.atout ? ' atout-card' : ''}`;
          if (p === s.leadPlayer) el.style.outline = '2px solid gold';
          el.innerHTML = `
            <span class="c-tl">${c.rank}<br>${c.suit}</span>
            <span class="c-mid">${c.suit}</span>
            <span class="c-br">${c.rank}<br>${c.suit}</span>
          `;
          cell.appendChild(el);
        } else {
          cell.innerHTML = `<div style="width:40px;height:58px;border:1px dashed #380055;border-radius:5px;"></div>`;
        }
        grid.appendChild(cell);
      });
    }

    const hand0  = this._q('#be-hand-0');
    if (hand0) {
      hand0.innerHTML = '';
      const canPlay = s.currentPlayer === 0 && s.status === 'playing';
      s.hands[0].forEach((card, idx) => {
        const el = document.createElement('div');
        el.className = `be-card ${card.isRed ? 'red' : 'black'}${card.suit === s.atout ? ' atout-card' : ''}`;
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
      const trickGrid = this._q('#be-trick-grid');
      const mv = e => {
        g.style.left = `${e.clientX - ox}px`;
        g.style.top  = `${e.clientY - oy}px`;
        const tr = trickGrid?.getBoundingClientRect();
        if (tr && e.clientX >= tr.left && e.clientX <= tr.right && e.clientY >= tr.top && e.clientY <= tr.bottom) {
          trickGrid.classList.add('be-drop-active');
        } else {
          trickGrid?.classList.remove('be-drop-active');
        }
      };
      const up = e => {
        document.removeEventListener('pointermove', mv, true);
        document.removeEventListener('pointerup', up, true);
        g.remove(); el.style.opacity = '';
        trickGrid?.classList.remove('be-drop-active');
        const handRect = this._q('#be-hand-0')?.getBoundingClientRect();
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
    this._overlay.showGameOver(
      {
        result:    won ? 'win' : 'lose',
        score,
        extraInfo: `<div style="font-size:.7rem;color:#9ab;text-align:center">
          Votre équipe : ${s?.scores[0] ?? 0} pts &nbsp;|&nbsp; Équipe adverse : ${s?.scores[1] ?? 0} pts
        </div>`,
      },
      () => EventBus.emit('game:restart')
    );
  }
}
