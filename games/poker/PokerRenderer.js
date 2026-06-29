import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const PREFIX = 'po';

export default class PokerRenderer {
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
.po-wrapper {
  position:absolute; inset:0; display:flex; flex-direction:column;
  align-items:center; padding:8px; box-sizing:border-box; gap:6px;
  font-family:Orbitron,monospace; overflow:hidden; background:#0a1628;
}
.po-btn-sm { padding:5px 14px; background:transparent; border:1.5px solid #ffd700;
  color:#ffd700; border-radius:6px; cursor:pointer; font-size:.7rem;
  font-family:Orbitron,monospace; }
.po-btn-sm:hover { background:#ffd70033; }
.po-table {
  flex:1; width:100%; max-width:600px; display:flex; flex-direction:column;
  gap:6px; overflow:hidden;
}
.po-seat { display:flex; align-items:center; gap:6px; min-height:56px; }
.po-seat-label { color:#9ab; font-size:.65rem; width:55px; text-align:right; flex-shrink:0; }
.po-hand { display:flex; gap:4px; align-items:center; flex-wrap:wrap; }
.po-info { color:#ffd700; font-size:.65rem; margin-left:auto; text-align:right; }
.po-center {
  flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px;
}
.po-community { display:flex; gap:6px; justify-content:center; }
.po-pot { color:#ffd700; font-size:.75rem; }
.po-message { color:#c8e6ff; font-size:.7rem; text-align:center; min-height:18px; }
.po-result { font-size:.7rem; text-align:center; }
.po-result.win  { color:#4caf50; }
.po-result.lose { color:#f44336; }
.po-result.tie  { color:#ffd700; }
.po-actions { display:flex; gap:6px; justify-content:center; flex-wrap:wrap; min-height:36px; }
.po-act { padding:6px 14px; border-radius:6px; border:none; cursor:pointer;
  font-family:Orbitron,monospace; font-size:.7rem; font-weight:700; }
.po-act.fold  { background:#c0392b; color:#fff; }
.po-act.check { background:#27ae60; color:#fff; }
.po-act.call  { background:#2980b9; color:#fff; }
.po-act.raise { background:#8e44ad; color:#fff; }
.po-act:hover { opacity:.85; }
.po-card {
  width:62px; height:90px; border-radius:8px; border:1.5px solid #ccc;
  background:#fff; display:flex; flex-direction:column; align-items:center;
  justify-content:space-between; padding:4px; box-sizing:border-box;
  font-weight:700; flex-shrink:0; cursor:default; user-select:none;
}
.po-card.red   { color:#cc0000; }
.po-card.black { color:#111; }
.po-card .c-tl { font-size:.75rem; line-height:1.2; align-self:flex-start; }
.po-card .c-mid { font-size:1.5rem; }
.po-card .c-br { font-size:.75rem; line-height:1.2; align-self:flex-end; transform:rotate(180deg); }
.po-card.back {
  background:repeating-linear-gradient(45deg,#1a237e 0,#1a237e 4px,#283593 4px,#283593 8px);
}
.po-stackbar { height:6px; width:80px; background:#1a2b4a; border-radius:3px; overflow:hidden; }
.po-stackbar-fill { height:100%; background:#ffd700; transition:width .3s; border-radius:3px; }
`;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'po-wrapper';
    this._wrapper.innerHTML = `
      <div class="po-table" id="po-table">
        <div class="po-seat">
          <div class="po-seat-label">IA</div>
          <div class="po-hand" id="po-ai-hand"></div>
          <div class="po-info" id="po-ai-info"></div>
        </div>
        <div class="po-center">
          <div class="po-pot" id="po-pot">Pot : 0</div>
          <div class="po-community" id="po-community"></div>
          <div class="po-message" id="po-message"></div>
          <div class="po-result" id="po-result" style="display:none"></div>
        </div>
        <div class="po-seat">
          <div class="po-seat-label">Vous</div>
          <div class="po-hand" id="po-player-hand"></div>
          <div class="po-info" id="po-player-info"></div>
        </div>
        <div class="po-actions" id="po-actions"></div>
      </div>
    `;
    this._vp.appendChild(this._wrapper);
  }

  _showStart() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] }],
      _sel => { this._overlay.hide(); this._game.start(); },
      { extraHtml: `<div style="color:rgba(255,255,255,.5);font-size:10px;text-align:center;line-height:2;margin-bottom:4px">
        Heads-up Texas Hold'em — 1000 jetons, blindes 10/20<br>
        Fold · Check · Call · Raise — P pause · R restart
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

    this._renderHand(this._q('#po-ai-hand'),    s.aiHand,    false);
    this._renderHand(this._q('#po-community'),   s.community, true);
    this._renderHand(this._q('#po-player-hand'), s.playerHand, true);

    const maxChips = 1000;
    this._q('#po-ai-info').innerHTML = `
      <div>${s.chips.ai} jetons</div>
      <div class="po-stackbar"><div class="po-stackbar-fill" style="width:${Math.min(100, s.chips.ai / maxChips * 100)}%"></div></div>
      ${s.bet.ai > 0 ? `<div>Mise: ${s.bet.ai}</div>` : ''}
    `;
    this._q('#po-player-info').innerHTML = `
      <div>${s.chips.player} jetons</div>
      <div class="po-stackbar"><div class="po-stackbar-fill" style="width:${Math.min(100, s.chips.player / maxChips * 100)}%"></div></div>
      ${s.bet.player > 0 ? `<div>Mise: ${s.bet.player}</div>` : ''}
    `;

    this._q('#po-pot').textContent     = `Pot : ${s.pot}`;
    this._q('#po-message').textContent = s.message || '';

    const resEl = this._q('#po-result');
    if (s.result) {
      resEl.style.display = '';
      resEl.className = `po-result ${s.result.winner === 'player' ? 'win' : s.result.winner === 'ai' ? 'lose' : 'tie'}`;
      resEl.textContent = s.result.playerHandName
        ? `Vous: ${s.result.playerHandName} · IA: ${s.result.aiHandName || '?'}`
        : (s.result.desc || '');
    } else {
      resEl.style.display = 'none';
    }

    const actEl = this._q('#po-actions');
    actEl.innerHTML = '';
    if (s.turn === 'player' && s.actions.length) {
      const labels = { fold:'Se coucher', check:'Checker', call:`Suivre (${s.bet.ai - s.bet.player})`, raise:`Relancer (${s.raiseSize})` };
      s.actions.forEach(a => {
        const btn = document.createElement('button');
        btn.className = `po-act ${a}`;
        btn.textContent = labels[a] || a;
        btn.addEventListener('click', () => this._game.playerAction(a));
        actEl.appendChild(btn);
      });
    } else if (s.turn === 'ai') {
      const span = document.createElement('span');
      span.style.cssText = 'color:#9ab;font-size:.7rem;';
      span.textContent = "L'IA réfléchit...";
      actEl.appendChild(span);
    }
  }

  _renderHand(el, cards) {
    el.innerHTML = '';
    (cards || []).forEach(c => el.appendChild(this._cardEl(c)));
  }

  _cardEl(card) {
    const el = document.createElement('div');
    if (!card.faceUp) {
      el.className = 'po-card back';
    } else {
      el.className = `po-card ${card.isRed ? 'red' : 'black'}`;
      el.innerHTML = `
        <span class="c-tl">${card.rank}<br>${card.suit}</span>
        <span class="c-mid">${card.suit}</span>
        <span class="c-br">${card.rank}<br>${card.suit}</span>
      `;
    }
    return el;
  }

  _showEnd(won, score) {
    const s = this._game.state;
    this._overlay.showGameOver(
      {
        result:    won ? 'win' : 'lose',
        score,
        extraInfo: `<div style="font-size:.7rem;color:#9ab;text-align:center">
          Vous : ${s?.chips?.player ?? 0} jetons &nbsp;|&nbsp; IA : ${s?.chips?.ai ?? 0} jetons<br>
          ${s?.handsPlayed ?? 0} mains jouées
        </div>`,
      },
      () => EventBus.emit('game:restart')
    );
  }
}
