import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const PREFIX = 'ru';

export default class RummyRenderer {
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
.ru-wrapper {
  position:absolute; inset:0; display:flex; flex-direction:column;
  align-items:center; padding:6px; box-sizing:border-box; gap:4px;
  font-family:Orbitron,monospace; overflow:hidden; background:#0a2218;
}
.ru-btn-sm { padding:5px 14px; background:transparent; border:1.5px solid #ffd700;
  color:#ffd700; border-radius:6px; cursor:pointer; font-size:.65rem;
  font-family:Orbitron,monospace; }
.ru-btn-sm:hover  { background:#ffd70022; }
.ru-btn-sm:disabled { opacity:.35; cursor:default; }
.ru-table { flex:1; width:100%; max-width:620px; display:flex; flex-direction:column; gap:5px; overflow:hidden; }
.ru-row   { display:flex; gap:5px; align-items:center; }
.ru-label { font-size:.6rem; color:#9ab; width:48px; flex-shrink:0; text-align:right; }
.ru-center { display:flex; justify-content:center; align-items:center; gap:12px; }
.ru-pile { display:flex; flex-direction:column; align-items:center; gap:2px; cursor:pointer; }
.ru-pile-label { font-size:.55rem; color:#9ab; }
.ru-pile-count { font-size:.55rem; color:#ffd700; }
.ru-info { display:flex; gap:10px; font-size:.6rem; color:#9ab; justify-content:center; }
.ru-info span { color:#ffd700; }
.ru-message { font-size:.65rem; color:#c8e6ff; text-align:center; min-height:18px; }
.ru-actions { display:flex; gap:6px; justify-content:center; flex-wrap:wrap; }
.ru-knock-result { background:#0a3322; border:1px solid #ffd700; border-radius:8px;
  padding:8px 14px; font-size:.7rem; color:#ffd700; text-align:center; display:none; }
.ru-knock-result.show { display:block; }
.ru-hand { display:flex; gap:3px; flex-wrap:wrap; justify-content:center; }
.ru-card {
  width:52px; height:74px; border-radius:7px; border:1.5px solid #ccc;
  background:#fff; display:flex; flex-direction:column; align-items:center;
  justify-content:space-between; padding:3px; box-sizing:border-box;
  font-weight:700; cursor:pointer; user-select:none; flex-shrink:0;
  transition:transform .1s;
}
.ru-card.red   { color:#cc0000; }
.ru-card.black { color:#111; }
.ru-card .c-tl { font-size:.65rem; line-height:1.2; align-self:flex-start; }
.ru-card .c-mid { font-size:1.1rem; }
.ru-card .c-br { font-size:.65rem; line-height:1.2; align-self:flex-end; transform:rotate(180deg); }
.ru-card.back {
  background:repeating-linear-gradient(45deg,#0d4a2e 0,#0d4a2e 4px,#0a6a3c 4px,#0a6a3c 8px);
  cursor:default;
}
.ru-card.selected  { transform:translateY(-10px); outline:2px solid #ffd700; }
.ru-card.in-meld   { outline:1.5px solid #4caf50; }
.ru-card.new-draw  { outline:2px solid #2196f3; }
.ru-drop-active    { outline:2px dashed #ffd700 !important; background:rgba(255,215,0,.1) !important; }
`;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'ru-wrapper';
    this._wrapper.innerHTML = `
      <div class="ru-table" id="ru-table">
        <div class="ru-info" id="ru-info">
          <div>Round : <span id="ru-round">1/5</span></div>
          <div>Vous : <span id="ru-score-player">0</span></div>
          <div>IA : <span id="ru-score-ai">0</span></div>
        </div>

        <div class="ru-row">
          <div class="ru-label">IA</div>
          <div class="ru-hand" id="ru-ai-hand"></div>
        </div>

        <div class="ru-center">
          <div class="ru-pile" id="ru-stock">
            <div class="ru-card back" style="cursor:pointer;" id="ru-stock-card"></div>
            <div class="ru-pile-label">Pioche</div>
            <div class="ru-pile-count" id="ru-stock-count">0</div>
          </div>
          <div class="ru-pile" id="ru-discard-pile">
            <div id="ru-discard-top" style="height:58px;width:40px;border:1.5px dashed #1a6644;border-radius:5px;"></div>
            <div class="ru-pile-label">Défausse</div>
          </div>
        </div>

        <div class="ru-message" id="ru-message"></div>
        <div class="ru-knock-result" id="ru-knock-result"></div>
        <div class="ru-actions" id="ru-actions"></div>

        <div class="ru-row" style="flex-direction:column;align-items:center;gap:3px;">
          <div class="ru-hand" id="ru-player-hand"></div>
          <div style="font-size:.55rem;color:#9ab;">Votre main — deadwood: <span id="ru-dw">0</span></div>
        </div>
      </div>
    `;
    this._vp.appendChild(this._wrapper);
  }

  _showStart() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique', options: [{ value: 'basique', label: 'BASIQUE (5 rounds)' }] }],
      _sel => { this._overlay.hide(); this._game.start(); },
      { extraHtml: `<div style="color:rgba(255,255,255,.5);font-size:10px;text-align:center;line-height:2;margin-bottom:4px">
        10 cartes · Formez suites et brelans · Frappez si deadwood ≤ 10<br>
        Gin (DW=0) = bonus +25 · Undercut = adversaire gagne
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

    this._q('#ru-stock').addEventListener('click',        () => this._game.drawStock());
    this._q('#ru-discard-pile').addEventListener('click', () => this._game.drawDiscard());

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

    this._q('#ru-round').textContent        = `${s.round}/${s.maxRounds}`;
    this._q('#ru-score-player').textContent = s.scores.player;
    this._q('#ru-score-ai').textContent     = s.scores.ai;
    this._q('#ru-stock-count').textContent  = s.stock.length;
    this._q('#ru-message').textContent      = s.message || '';

    const { deadwood } = this._calcDeadwood(s.playerHand, s.melds?.player);
    this._q('#ru-dw').textContent = deadwood;
    this._q('#ru-dw').style.color = deadwood === 0 ? '#4caf50' : deadwood <= 10 ? '#ffd700' : '#f44336';

    const aiEl = this._q('#ru-ai-hand');
    aiEl.innerHTML = '';
    s.aiHand.forEach(card => {
      const el = document.createElement('div');
      if (!card.faceUp) {
        el.className = 'ru-card back';
      } else {
        el.className = `ru-card ${card.isRed ? 'red' : 'black'}`;
        el.innerHTML = `<span class="c-tl">${card.rank}<br>${card.suit}</span><span class="c-mid">${card.suit}</span><span class="c-br">${card.rank}<br>${card.suit}</span>`;
      }
      aiEl.appendChild(el);
    });

    const discardTop = s.discard[s.discard.length - 1];
    const dtEl = this._q('#ru-discard-top');
    if (discardTop) {
      dtEl.className = `ru-card ${discardTop.isRed ? 'red' : 'black'}`;
      dtEl.innerHTML = `<span class="c-tl">${discardTop.rank}<br>${discardTop.suit}</span><span class="c-mid">${discardTop.suit}</span><span class="c-br">${discardTop.rank}<br>${discardTop.suit}</span>`;
      dtEl.style.cssText = '';
    } else {
      dtEl.className = '';
      dtEl.style.cssText = 'height:58px;width:40px;border:1.5px dashed #1a6644;border-radius:5px;';
    }

    const playerEl = this._q('#ru-player-hand');
    playerEl.innerHTML = '';
    const meldCards = new Set((s.melds?.player || []).flat());
    s.playerHand.forEach((card, idx) => {
      const el = document.createElement('div');
      el.className = `ru-card ${card.isRed ? 'red' : 'black'}`;
      if (s.selected === idx) el.classList.add('selected');
      if (meldCards.has(card)) el.classList.add('in-meld');
      if (card === s.drawnCard) el.classList.add('new-draw');
      el.innerHTML = `<span class="c-tl">${card.rank}<br>${card.suit}</span><span class="c-mid">${card.suit}</span><span class="c-br">${card.rank}<br>${card.suit}</span>`;
      if (s.turn === 'player' && s.phase === 'discard') {
        el.addEventListener('click', () => this._game.selectCard(idx));
        this._addDrag(el, idx);
      }
      playerEl.appendChild(el);
    });

    const actEl = this._q('#ru-actions');
    actEl.innerHTML = '';
    if (s.turn === 'player' && s.phase === 'discard' && s.selected !== null) {
      const discBtn = document.createElement('button');
      discBtn.className   = 'ru-btn-sm';
      discBtn.textContent = 'Défausser';
      discBtn.addEventListener('click', () => this._game.discardCard());
      actEl.appendChild(discBtn);

      const knockBtn = document.createElement('button');
      knockBtn.className   = 'ru-btn-sm';
      knockBtn.textContent = `Frapper (DW: ${deadwood})`;
      knockBtn.disabled    = deadwood > 10;
      knockBtn.addEventListener('click', () => this._game.knock());
      actEl.appendChild(knockBtn);
    } else if (s.turn === 'ai') {
      const span = document.createElement('span');
      span.style.cssText = 'color:#9ab;font-size:.7rem;';
      span.textContent = "L'IA joue...";
      actEl.appendChild(span);
    }

    const knockEl = this._q('#ru-knock-result');
    if (s.knockData) {
      knockEl.classList.add('show');
      knockEl.innerHTML = `
        ${s.knockData.desc}<br>
        Vous: ${s.knockData.playerDW} DW ${s.knockData.playerScore > 0 ? `(+${s.knockData.playerScore})` : ''} &nbsp;|&nbsp;
        IA: ${s.knockData.aiDW} DW ${s.knockData.aiScore > 0 ? `(+${s.knockData.aiScore})` : ''}
      `;
    } else {
      knockEl.classList.remove('show');
    }
  }

  _addDrag(el, idx) {
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault(); e.stopPropagation();
      this._game.selectCard(idx);
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
      const discardEl = this._q('#ru-discard-pile');
      const mv = e => {
        g.style.left = `${e.clientX - ox}px`;
        g.style.top  = `${e.clientY - oy}px`;
        const dr = discardEl?.getBoundingClientRect();
        if (dr && e.clientX >= dr.left && e.clientX <= dr.right && e.clientY >= dr.top && e.clientY <= dr.bottom) {
          discardEl.classList.add('ru-drop-active');
        } else {
          discardEl?.classList.remove('ru-drop-active');
        }
      };
      const up = e => {
        document.removeEventListener('pointermove', mv, true);
        document.removeEventListener('pointerup', up, true);
        g.remove(); el.style.opacity = '';
        discardEl?.classList.remove('ru-drop-active');
        const dr = discardEl?.getBoundingClientRect();
        if (dr && e.clientX >= dr.left && e.clientX <= dr.right && e.clientY >= dr.top && e.clientY <= dr.bottom) {
          this._game.discardCard();
        }
      };
      document.addEventListener('pointermove', mv, true);
      document.addEventListener('pointerup', up, true);
    });
  }

  _calcDeadwood(hand, melds) {
    if (!hand) return { deadwood: 0 };
    const meldCards = new Set((melds || []).flat());
    const dw = hand.filter(c => !meldCards.has(c)).reduce((sum, c) => {
      if (c.rank === 'A') return sum + 1;
      if (['J', 'Q', 'K'].includes(c.rank)) return sum + 10;
      return sum + parseInt(c.rank, 10);
    }, 0);
    return { deadwood: dw };
  }

  _showEnd(won, score) {
    const s = this._game.state;
    this._overlay.showGameOver(
      {
        result:    won ? 'win' : 'lose',
        score,
        extraInfo: `<div style="font-size:.7rem;color:#9ab;text-align:center">
          Vous : ${s?.scores?.player ?? 0} pts &nbsp;|&nbsp; IA : ${s?.scores?.ai ?? 0} pts
        </div>`,
      },
      () => EventBus.emit('game:restart')
    );
  }
}
