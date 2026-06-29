import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const WHEEL_ORDER = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const BET_AMOUNTS = [1, 5, 10, 25, 50];
const CHIP_COLORS = ['#cc2222','#1155cc','#228822','#cc8800','#882288'];

function numColor(n) {
  if (n === 0) return '#1a8a1a';
  return RED_NUMBERS.has(n) ? '#cc2222' : '#222';
}

export default class RouletteRenderer {
  constructor(game, viewport, config) {
    this._game     = game;
    this._viewport = viewport;
    this._wrapper  = null;
    this._canvas   = null;
    this._ctx      = null;
    this._overlay  = null;
    this._state    = null;
    this._spinning = false;
    this._spinStart = null;
    this._wheelAngle = 0;
    this._raf = null;

    this._onTick    = this._onTick.bind(this);
    this._onOver    = this._onOver.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
    this._onRestart = this._onRestart.bind(this);
  }

  init() {
    this._injectStyles();
    this._buildLayout();
    this._overlay = new GameOverlay(this._viewport);
    this._showStart();
    this._bindEvents();
  }

  _showStart() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] }],
      () => { this._overlay.hide(); this._game.start(); }
    );
  }

  _injectStyles() {
    if (document.getElementById('roulette-styles')) return;
    const s = document.createElement('style');
    s.id = 'roulette-styles';
    s.textContent = `
      .rlt-wrapper {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; padding: 8px;
        box-sizing: border-box; gap: 6px;
        font-family: Orbitron, monospace; overflow: hidden;
      }
      .rlt-main { display: flex; gap: 12px; width: 100%; justify-content: center; align-items: flex-start; flex: 1; overflow: hidden; }
      .rlt-left { display: flex; flex-direction: column; align-items: center; gap: 6px; }
      .rlt-info { color: #a0c4ff; font-size: 11px; text-align: center; }
      .rlt-chips-val { color: #ffd700; font-size: 14px; font-weight: bold; }
      .rlt-msg { color: #e0e0e0; font-size: 10px; min-height: 14px; text-align: center; }
      .rlt-history { display: flex; gap: 3px; flex-wrap: wrap; justify-content: center; max-width: 180px; }
      .rlt-hdot { width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 7px; color: #fff; font-weight: bold; }
      .rlt-right { display: flex; flex-direction: column; gap: 5px; min-width: 130px; }
      .rlt-chip-row { display: flex; gap: 3px; flex-wrap: wrap; }
      .rlt-chip {
        width: 34px; height: 34px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 9px; font-weight: bold; cursor: pointer; color: #fff;
        border: 2px solid rgba(255,255,255,0.4); transition: transform 0.1s;
      }
      .rlt-chip:hover { transform: scale(1.1); }
      .rlt-chip.sel { border-color: #ffd700; box-shadow: 0 0 6px #ffd700; }
      .rlt-section-label { color: #888; font-size: 9px; }
      .rlt-bet-row { display: flex; gap: 4px; }
      .rlt-bet-btn {
        flex: 1; padding: 5px 4px; border: 1px solid rgba(255,255,255,0.2);
        background: rgba(255,255,255,0.05); color: #e0e0e0;
        font-size: 9px; cursor: pointer; border-radius: 4px;
        display: flex; flex-direction: column; align-items: center; gap: 1px;
        font-family: Orbitron, monospace; transition: background 0.15s;
      }
      .rlt-bet-btn:hover { background: rgba(255,255,255,0.12); }
      .rlt-bet-amt { color: #ffd700; font-size: 8px; min-height: 10px; }
      .rlt-num-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
      .rlt-num-btn {
        aspect-ratio: 1; font-size: 7px; border: 1px solid rgba(255,255,255,0.15);
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        border-radius: 2px; color: #fff; font-family: Orbitron, monospace;
        transition: filter 0.1s;
      }
      .rlt-num-btn:hover { filter: brightness(1.4); }
      .rlt-num-btn.active-bet { outline: 1px solid #ffd700; }
      .rlt-actions { display: flex; gap: 6px; justify-content: center; }
      .rlt-spin-btn {
        padding: 7px 16px; background: linear-gradient(135deg,#4a0,#2a7);
        color: #fff; border: none; font-family: Orbitron,monospace;
        font-size: 11px; cursor: pointer; border-radius: 6px;
      }
      .rlt-spin-btn:disabled { opacity: 0.5; cursor: default; }
      .rlt-clear-btn {
        padding: 7px 10px; background: rgba(150,50,50,0.3);
        color: #e0a0a0; border: 1px solid rgba(150,50,50,0.4);
        font-family: Orbitron,monospace; font-size: 10px; cursor: pointer; border-radius: 6px;
      }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'rlt-wrapper';

    // Canvas (roue)
    this._canvas = document.createElement('canvas');
    this._canvas.width = 160; this._canvas.height = 160;
    this._ctx = this._canvas.getContext('2d');

    const left = document.createElement('div');
    left.className = 'rlt-left';
    left.innerHTML = `
      <div class="rlt-info">Jetons : <span class="rlt-chips-val" id="rlt-chips">100</span></div>
      <div class="rlt-msg" id="rlt-msg"></div>
      <div class="rlt-history" id="rlt-history"></div>
    `;
    left.prepend(this._canvas);

    // Right side: chips + bets + grid + actions
    const right = document.createElement('div');
    right.className = 'rlt-right';

    // Chip selector
    const chipRow = document.createElement('div');
    chipRow.className = 'rlt-chip-row';
    BET_AMOUNTS.forEach((amt, i) => {
      const chip = document.createElement('div');
      chip.className = 'rlt-chip' + (i === 1 ? ' sel' : '');
      chip.style.background = CHIP_COLORS[i];
      chip.textContent = amt;
      chip.addEventListener('click', () => {
        document.querySelectorAll('.rlt-chip').forEach(c => c.classList.remove('sel'));
        chip.classList.add('sel');
        this._game.setBetAmount(amt);
      });
      chipRow.appendChild(chip);
    });

    right.innerHTML = `<div class="rlt-section-label">MISE PAR CLIC</div>`;
    right.appendChild(chipRow);
    right.innerHTML += `<div class="rlt-section-label" style="margin-top:2px">CHANCES SIMPLES</div>`;

    const betsDiv = document.createElement('div');
    betsDiv.innerHTML = `
      <div class="rlt-bet-row">
        <button class="rlt-bet-btn" data-bet="red" style="border-left:2px solid #cc2222">Rouge<div class="rlt-bet-amt" id="bet-red"></div></button>
        <button class="rlt-bet-btn" data-bet="black" style="border-left:2px solid #555">Noir<div class="rlt-bet-amt" id="bet-black"></div></button>
      </div>
      <div class="rlt-bet-row" style="margin-top:3px">
        <button class="rlt-bet-btn" data-bet="even">Pair<div class="rlt-bet-amt" id="bet-even"></div></button>
        <button class="rlt-bet-btn" data-bet="odd">Impair<div class="rlt-bet-amt" id="bet-odd"></div></button>
      </div>
    `;
    right.appendChild(betsDiv);

    right.innerHTML += `<div class="rlt-section-label" style="margin-top:2px">NUMÉRO PLEIN (×36)</div>`;
    const numGrid = document.createElement('div');
    numGrid.className = 'rlt-num-grid';
    for (let n = 0; n <= 36; n++) {
      const btn = document.createElement('div');
      btn.className = 'rlt-num-btn';
      btn.id = `rlt-n${n}`;
      btn.style.background = numColor(n);
      btn.textContent = n;
      btn.addEventListener('click', () => this._game.placeBet('number', n));
      numGrid.appendChild(btn);
    }
    right.appendChild(numGrid);

    const actions = document.createElement('div');
    actions.className = 'rlt-actions';
    actions.innerHTML = `
      <button class="rlt-clear-btn" id="rlt-clear">Annuler</button>
      <button class="rlt-spin-btn" id="rlt-spin">Lancer !</button>
    `;
    right.appendChild(actions);

    const main = document.createElement('div');
    main.className = 'rlt-main';
    main.append(left, right);
    this._wrapper.appendChild(main);
    this._viewport.appendChild(this._wrapper);
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);

    document.getElementById('rlt-spin')?.addEventListener('click',  () => this._game.spin());
    document.getElementById('rlt-clear')?.addEventListener('click', () => this._game.clearBets());
    document.querySelectorAll('.rlt-bet-btn[data-bet]').forEach(btn => {
      btn.addEventListener('click', () => this._game.placeBet(btn.dataset.bet));
    });
  }

  _onTick({ state }) {
    this._state = state;
    this._updateUI(state);
    if (state.spinning && !this._spinning) this._startSpinAnim(state);
    else if (!state.spinning) this._drawWheel(state.result ? WHEEL_ORDER.indexOf(state.result.number) : -1);
  }

  _onOver({ score }) {
    this._overlay.showGameOver(
      { result: 'lose', score, title: 'FAUCHÉ !', extraInfo: '<div style="color:#aaa;font-size:11px">Plus de jetons.</div>' },
      () => { this._overlay.hide(); this._game.restart(); }
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); }
  _onRestart() { this._showStart(); }

  _startSpinAnim(state) {
    this._spinning  = true;
    this._spinStart = performance.now();
    const totalTime = 3000;
    const totalRot  = Math.PI * 2 * 8;
    const landIdx   = state.result ? WHEEL_ORDER.indexOf(state.result.number) : 0;

    const animate = (now) => {
      if (!this._spinning) return;
      const t    = Math.min((now - this._spinStart) / totalTime, 1);
      const ease = 1 - (1 - t) ** 3;
      this._wheelAngle = ease * totalRot;
      const ballAngle  = -this._wheelAngle * 1.5;
      this._drawWheel(-1, this._wheelAngle, ballAngle);
      if (t < 1) { this._raf = requestAnimationFrame(animate); }
      else { this._spinning = false; this._drawWheel(landIdx); }
    };
    this._raf = requestAnimationFrame(animate);
  }

  _drawWheel(landingIdx = -1, wheelAngle = 0, ballAngle = null) {
    const ctx = this._ctx;
    const cx = 80, cy = 80, R = 74, innerR = 50;
    ctx.clearRect(0, 0, 160, 160);

    ctx.beginPath(); ctx.arc(cx, cy, R + 4, 0, Math.PI * 2);
    ctx.fillStyle = '#8B6914'; ctx.fill();

    const count = 37;
    for (let i = 0; i < count; i++) {
      const sa = (i / count) * Math.PI * 2 + wheelAngle - Math.PI / 2;
      const ea = ((i + 1) / count) * Math.PI * 2 + wheelAngle - Math.PI / 2;
      const num = WHEEL_ORDER[i];
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, sa, ea); ctx.closePath();
      ctx.fillStyle = numColor(num); ctx.fill();
      ctx.strokeStyle = '#8B6914'; ctx.lineWidth = 0.5; ctx.stroke();
      // Number
      const mid = (sa + ea) / 2;
      const tr = (R + innerR) / 2;
      const tx = cx + Math.cos(mid) * tr, ty = cy + Math.sin(mid) * tr;
      ctx.save(); ctx.translate(tx, ty); ctx.rotate(mid + Math.PI / 2);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 6px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(num.toString(), 0, 0); ctx.restore();
    }

    // Inner circle
    ctx.beginPath(); ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(cx - 8, cy - 8, 0, cx, cy, innerR);
    g.addColorStop(0, '#228'); g.addColorStop(1, '#114');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#8B6914'; ctx.lineWidth = 2; ctx.stroke();

    // Highlight landing
    if (landingIdx >= 0) {
      const sa = (landingIdx / count) * Math.PI * 2 + wheelAngle - Math.PI / 2;
      const ea = ((landingIdx + 1) / count) * Math.PI * 2 + wheelAngle - Math.PI / 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, sa, ea); ctx.closePath();
      ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2; ctx.stroke();
    }

    // Ball
    const ba = ballAngle !== null ? ballAngle
      : (landingIdx >= 0
        ? ((landingIdx + 0.5) / count) * Math.PI * 2 + wheelAngle - Math.PI / 2
        : -Math.PI / 2);
    const bx = cx + Math.cos(ba) * (R - 5), by = cy + Math.sin(ba) * (R - 5);
    const bg = ctx.createRadialGradient(bx - 1, by - 1, 0, bx, by, 5);
    bg.addColorStop(0, '#fff'); bg.addColorStop(1, '#bbb');
    ctx.beginPath(); ctx.arc(bx, by, 5, 0, Math.PI * 2);
    ctx.fillStyle = bg; ctx.fill();

    // Pointer
    ctx.fillStyle = '#ffd700';
    ctx.beginPath(); ctx.moveTo(cx, cy - R + 3); ctx.lineTo(cx - 4, cy - R - 5); ctx.lineTo(cx + 4, cy - R - 5); ctx.closePath(); ctx.fill();
  }

  _updateUI(state) {
    const $ = (id) => document.getElementById(id);
    if ($('rlt-chips')) $('rlt-chips').textContent = state.chips;
    if ($('rlt-msg'))   $('rlt-msg').textContent   = state.message;

    [['red','bet-red'],['black','bet-black'],['even','bet-even'],['odd','bet-odd']].forEach(([key, id]) => {
      const el = $(id); if (!el) return;
      const amt = state.bets[key];
      el.textContent = amt > 0 ? amt : '';
      el.parentElement.style.boxShadow = amt > 0 ? '0 0 4px #ffd700' : '';
    });

    const activeN = state.bets.number;
    document.querySelectorAll('.rlt-num-btn').forEach(btn => {
      const n = parseInt(btn.textContent);
      btn.classList.toggle('active-bet', n === activeN && state.bets.numberAmt > 0);
    });

    const spinBtn = $('rlt-spin');
    if (spinBtn) spinBtn.disabled = state.spinning || state.phase !== 'betting';

    const histEl = $('rlt-history');
    if (histEl) {
      histEl.innerHTML = (state.lastResults || []).map(r =>
        `<div class="rlt-hdot" style="background:${numColor(r.number)}">${r.number}</div>`
      ).join('');
    }
  }

  destroy() {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById('roulette-styles')?.remove();
  }
}
