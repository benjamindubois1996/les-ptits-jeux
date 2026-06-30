import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const PHASE_STYLE = {
  ready:    { bg: '#0d1117', label: 'Prépare-toi…' },
  waiting:  { bg: '#7a1f1f', label: 'ATTENDS…' },
  go:       { bg: '#1f7a3f', label: 'CLIQUE !' },
  'too-soon': { bg: '#aa3300', label: 'TROP TÔT !' },
  result:   { bg: '#1f3f7a', label: '' },
  timeout:  { bg: '#aa3300', label: 'TROP LENT !' },
  finished: { bg: '#0d1117', label: 'Terminé' },
};

export default class ReactionRenderer {
  constructor(game, viewport, config) {
    this._game     = game;
    this._viewport = viewport;
    this._wrapper  = null;
    this._overlay  = null;
    this._els      = {};

    this._onTick    = this._onTick.bind(this);
    this._onOver    = this._onOver.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
    this._onZoneClick = this._onZoneClick.bind(this);
  }

  init() {
    this._injectStyles();
    this._buildLayout();
    this._overlay = new GameOverlay(this._wrapper);
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
    if (document.getElementById('rx-styles')) return;
    const s = document.createElement('style');
    s.id = 'rx-styles';
    s.textContent = `
      .rx-wrapper {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; padding: 8px;
        box-sizing: border-box; gap: 8px;
        font-family: Orbitron, monospace;
        background: #05080f; overflow: hidden; color: #ccc;
      }
      .rx-info { display: flex; gap: 16px; font-size: 11px; color: rgba(255,255,255,0.5); }
      .rx-info strong { color: #ffd700; }
      .rx-zone {
        flex: 1; width: 100%; max-width: 420px;
        border-radius: 16px; cursor: pointer; user-select: none;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 10px; transition: background 0.12s;
        border: 2px solid rgba(255,255,255,0.08);
      }
      .rx-zone-label { font-size: 24px; font-weight: bold; color: #fff; letter-spacing: 0.06em; }
      .rx-zone-ms { font-size: 36px; font-weight: bold; color: #00ffe1; }
      .rx-rounds { display: flex; gap: 8px; }
      .rx-round-dot {
        width: 10px; height: 10px; border-radius: 50%;
        background: #1e2535; border: 1px solid #333;
      }
      .rx-round-dot.done { background: #00ffe1; border-color: #00ffe1; }
      .rx-round-dot.fail { background: #ff3355; border-color: #ff3355; }
      .rx-hint { font-size: 9px; color: rgba(255,255,255,0.25); letter-spacing: 0.08em; }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'rx-wrapper';
    this._wrapper.innerHTML = `
      <div class="rx-info">
        <span>Manche <strong id="rx-round">1</strong>/5</span>
        <span>Score : <strong id="rx-score">0</strong></span>
      </div>
      <div class="rx-zone" id="rx-zone">
        <div class="rx-zone-label" id="rx-label">Prépare-toi…</div>
        <div class="rx-zone-ms" id="rx-ms"></div>
      </div>
      <div class="rx-rounds" id="rx-rounds"></div>
      <div class="rx-hint">ESPACE ou clic dès que c'est vert · P pause · R restart</div>
    `;
    this._viewport.appendChild(this._wrapper);
    this._els = {
      round:  this._wrapper.querySelector('#rx-round'),
      score:  this._wrapper.querySelector('#rx-score'),
      zone:   this._wrapper.querySelector('#rx-zone'),
      label:  this._wrapper.querySelector('#rx-label'),
      ms:     this._wrapper.querySelector('#rx-ms'),
      rounds: this._wrapper.querySelector('#rx-rounds'),
    };
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    this._els.zone.addEventListener('click', this._onZoneClick);
  }

  _onZoneClick() { this._game.react(); }

  _onTick(e) {
    if (e.action === 'restart') { this._showStart(); return; }
    if (e.action === 'play')    { this._overlay.hide(); }
    const s = e.state;
    if (!s) return;

    this._els.round.textContent = Math.min(s.roundIndex + 1, s.totalRounds);
    this._els.score.textContent = s.score;

    const style = PHASE_STYLE[s.phase] ?? PHASE_STYLE.ready;
    this._els.zone.style.background = style.bg;
    this._els.label.textContent = style.label;

    if (s.phase === 'result') {
      const last = s.results[s.results.length - 1];
      this._els.ms.textContent = last && last.ms !== null ? `${last.ms} ms` : '';
    } else {
      this._els.ms.textContent = '';
    }

    this._renderRounds(s);
  }

  _renderRounds(s) {
    this._els.rounds.innerHTML = Array.from({ length: s.totalRounds }, (_, i) => {
      if (i >= s.results.length) return `<span class="rx-round-dot"></span>`;
      const r = s.results[i];
      return `<span class="rx-round-dot ${r.ms !== null ? 'done' : 'fail'}"></span>`;
    }).join('');
  }

  _onOver(e) {
    const avg = e.avgMs !== null && e.avgMs !== undefined ? `${e.avgMs} ms` : '—';
    const best = e.bestMs !== null && e.bestMs !== undefined ? `${e.bestMs} ms` : '—';
    this._overlay.showGameOver(
      { result: 'lose', icon: '⚡', title: 'RÉSULTATS', score: e.score, isRecord: e.isRecord,
        extraInfo: `<div class="overlay-score">Moyenne : ${avg} · Meilleur temps : ${best}</div><div class="overlay-score">Record score : ${e.best}</div>` },
      () => EventBus.emit('game:restart')
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); }

  destroy() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    this._els.zone?.removeEventListener('click', this._onZoneClick);
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById('rx-styles')?.remove();
  }
}
