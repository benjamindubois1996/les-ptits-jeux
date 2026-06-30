import EventBus from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';
import { ARENA_W, ARENA_H } from './RetrovaultBoss.js';

const PHASE_LABELS = {
  dodge:  'PHASE 1 — ESQUIVE',
  memory: 'PHASE 2 — MÉMOIRE',
  reflex: 'PHASE 3 — RÉFLEXES',
  boss:   'PHASE 4 — DUEL FINAL',
};

const MEMORY_COLORS = ['#ff4d6d', '#4dff88', '#4dc8ff', '#ffd24d'];

export default class RetrovaultBossRenderer {
  constructor(game, viewport, config) {
    this._game     = game;
    this._viewport = viewport;
    this._wrapper  = null;
    this._canvas   = null;
    this._ctx      = null;
    this._overlay  = null;
    this._els      = {};
    this._memoryPads = [];
    this._reflexHoles = [];
    this._lastPhase = null;

    this._onTick    = this._onTick.bind(this);
    this._onOver    = this._onOver.bind(this);
    this._onWon     = this._onWon.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
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
    if (document.getElementById('rb-styles')) return;
    const s = document.createElement('style');
    s.id = 'rb-styles';
    s.textContent = `
      .rb-wrapper {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; padding: 8px;
        box-sizing: border-box; gap: 6px;
        font-family: Orbitron, monospace;
        background: #05080f; overflow: hidden; color: #ccc;
      }
      .rb-info { display: flex; gap: 14px; font-size: 11px; color: rgba(255,255,255,0.55); flex-wrap: wrap; justify-content: center; }
      .rb-info strong { color: #ffd700; }
      .rb-phase-label { color: #9d7bff; font-weight: bold; letter-spacing: 0.05em; font-size: 11px; }
      .rb-stage {
        position: relative; flex: 1; width: 100%;
        display: flex; align-items: center; justify-content: center;
        overflow: hidden;
      }
      .rb-canvas { display: block; border-radius: 8px; }
      .rb-memory, .rb-reflex {
        position: absolute; inset: 0;
        display: none; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
      }
      .rb-pads { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; width: 100%; max-width: 220px; }
      .rb-pad { aspect-ratio: 1; border-radius: 14px; border: none; cursor: pointer; opacity: 0.55; transition: opacity 0.1s, transform 0.1s; }
      .rb-pad.lit { opacity: 1; transform: scale(1.06); box-shadow: 0 0 24px currentColor; }
      .rb-holes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; width: 100%; max-width: 240px; }
      .rb-hole { aspect-ratio: 1; border-radius: 50%; background: #0d1117; border: 2px solid #1e2535; cursor: pointer; transition: background 0.1s, border-color 0.1s; }
      .rb-hole.active { background: #ffd700; border-color: #fff3aa; box-shadow: 0 0 16px #ffd70077; }
      .rb-sub-label { font-size: 12px; color: #9d7bff; font-weight: bold; min-height: 16px; }
      .rb-hint { font-size: 9px; color: rgba(255,255,255,0.25); letter-spacing: 0.06em; text-align: center; }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'rb-wrapper';
    this._wrapper.innerHTML = `
      <div class="rb-info">
        <span class="rb-phase-label" id="rb-phase">—</span>
        <span>❤ × <strong id="rb-lives">3</strong></span>
        <span>Score : <strong id="rb-score">0</strong></span>
      </div>
      <div class="rb-stage">
        <canvas class="rb-canvas" id="rb-canvas"></canvas>
        <div class="rb-memory" id="rb-memory">
          <div class="rb-sub-label" id="rb-memory-label"></div>
          <div class="rb-pads" id="rb-pads"></div>
        </div>
        <div class="rb-reflex" id="rb-reflex">
          <div class="rb-sub-label" id="rb-reflex-label">Clique les puces dorées !</div>
          <div class="rb-holes" id="rb-holes"></div>
        </div>
      </div>
      <div class="rb-hint" id="rb-hint">↑↓←→ / WASD : se déplacer · P pause · R restart</div>
    `;
    this._viewport.appendChild(this._wrapper);

    this._canvas = this._wrapper.querySelector('#rb-canvas');
    this._ctx    = this._canvas.getContext('2d');
    this._canvas.width  = ARENA_W;
    this._canvas.height = ARENA_H;

    this._els = {
      phase: this._wrapper.querySelector('#rb-phase'),
      lives: this._wrapper.querySelector('#rb-lives'),
      score: this._wrapper.querySelector('#rb-score'),
      memoryWrap:  this._wrapper.querySelector('#rb-memory'),
      memoryLabel: this._wrapper.querySelector('#rb-memory-label'),
      reflexWrap:  this._wrapper.querySelector('#rb-reflex'),
      reflexLabel: this._wrapper.querySelector('#rb-reflex-label'),
      pads:  this._wrapper.querySelector('#rb-pads'),
      holes: this._wrapper.querySelector('#rb-holes'),
      hint:  this._wrapper.querySelector('#rb-hint'),
    };

    MEMORY_COLORS.forEach((color, i) => {
      const btn = document.createElement('button');
      btn.className = 'rb-pad';
      btn.style.background = color;
      btn.dataset.note = i;
      this._els.pads.appendChild(btn);
      this._memoryPads.push(btn);
    });

    for (let i = 0; i < 9; i++) {
      const hole = document.createElement('button');
      hole.className = 'rb-hole';
      hole.dataset.index = i;
      this._els.holes.appendChild(hole);
      this._reflexHoles.push(hole);
    }
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:won',     this._onWon);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    this._els.pads.addEventListener('click', e => {
      const btn = e.target.closest('.rb-pad');
      if (btn) this._game.press(Number(btn.dataset.note));
    });
    this._els.holes.addEventListener('click', e => {
      const hole = e.target.closest('.rb-hole');
      if (hole) this._game.hitHole(Number(hole.dataset.index));
    });
  }

  _onTick(e) {
    if (e.action === 'restart') { this._showStart(); return; }
    if (e.action === 'play')    { this._overlay.hide(); }

    const s = e.state;
    if (!s || s.status === 'idle') return;

    this._els.lives.textContent = s.lives;
    this._els.score.textContent = s.score;
    this._els.phase.textContent = PHASE_LABELS[s.phase] ?? '';

    if (s.phase !== this._lastPhase) {
      this._lastPhase = s.phase;
      this._switchPhaseView(s.phase);
    }

    if (s.phase === 'dodge' || s.phase === 'boss') this._renderCanvas(s);
    if (s.phase === 'memory') this._renderMemory(s, e);
    if (s.phase === 'reflex') this._renderReflex(s);
  }

  _switchPhaseView(phase) {
    this._canvas.style.display          = (phase === 'dodge' || phase === 'boss') ? 'block' : 'none';
    this._els.memoryWrap.style.display  = phase === 'memory' ? 'flex' : 'none';
    this._els.reflexWrap.style.display  = phase === 'reflex' ? 'flex' : 'none';
    this._els.hint.textContent = phase === 'memory'
      ? '1-4 ou clic sur un pad · P pause · R restart'
      : phase === 'reflex'
        ? 'Clic sur les puces dorées · P pause · R restart'
        : '↑↓←→ / WASD : se déplacer · P pause · R restart';
  }

  _renderCanvas(s) {
    const ctx = this._ctx;
    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(0, 0, ARENA_W, ARENA_H);

    if (s.phase === 'dodge') {
      const d = s.dodge;
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '11px Orbitron, monospace';
      ctx.fillText(`Survis ${Math.ceil(d.timeLeft / 1000)}s`, 10, 18);

      ctx.fillStyle = '#ff4466';
      d.bullets.forEach(b => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
        ctx.fill();
      });

      const blink = d.invuln > 0 && Math.floor(d.invuln / 100) % 2 === 0;
      ctx.fillStyle = blink ? 'rgba(0,255,225,0.4)' : '#00ffe1';
      ctx.beginPath();
      ctx.arc(d.player.x, d.player.y, 9, 0, Math.PI * 2);
      ctx.fill();
    }

    if (s.phase === 'boss') {
      const b = s.boss;

      // Barre de vie du boss
      const barW = ARENA_W - 30;
      ctx.fillStyle = '#1e2535';
      ctx.fillRect(15, 14, barW, 10);
      ctx.fillStyle = '#ff4466';
      ctx.fillRect(15, 14, barW * Math.max(0, b.hp / b.maxHp), 10);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.strokeRect(15, 14, barW, 10);

      // Boss
      ctx.fillStyle = '#9d2bff';
      ctx.beginPath();
      ctx.arc(ARENA_W / 2, 60, 26, 0, Math.PI * 2);
      ctx.fill();

      // Tirs joueur
      ctx.fillStyle = '#00ffe1';
      b.playerBullets.forEach(pb => {
        ctx.fillRect(pb.x - 2, pb.y - 6, 4, 12);
      });

      // Tirs boss
      ctx.fillStyle = '#ff8844';
      b.bossBullets.forEach(bb => {
        ctx.beginPath();
        ctx.arc(bb.x, bb.y, 5, 0, Math.PI * 2);
        ctx.fill();
      });

      // Joueur
      const blink = b.invuln > 0 && Math.floor(b.invuln / 100) % 2 === 0;
      ctx.fillStyle = blink ? 'rgba(0,255,225,0.4)' : '#00ffe1';
      ctx.beginPath();
      ctx.moveTo(b.player.x, b.player.y - 12);
      ctx.lineTo(b.player.x - 11, b.player.y + 10);
      ctx.lineTo(b.player.x + 11, b.player.y + 10);
      ctx.closePath();
      ctx.fill();
    }
  }

  _renderMemory(s, e) {
    const m = s.memory;
    this._memoryPads.forEach((pad, i) => pad.classList.toggle('lit', m.activeColor === i));

    const labels = {
      'show-on': 'Écoute bien…', 'show-gap': 'Écoute bien…',
      waiting: 'À toi de jouer !', mistake: 'Oups !', complete: 'Bien joué !',
    };
    this._els.memoryLabel.textContent = `Manche ${m.round + 1}/${m.totalRounds} — ${labels[m.sub] ?? ''}`;

    if (e.action === 'memory-press' && !e.correct) {
      const pad = this._memoryPads[e.note];
      pad?.classList.add('lit');
      setTimeout(() => pad?.classList.remove('lit'), 200);
    }
  }

  _renderReflex(s) {
    const r = s.reflex;
    this._reflexHoles.forEach((hole, i) => hole.classList.toggle('active', r.holes[i].active));
    this._els.reflexLabel.textContent = `${r.hits}/${r.target} puces · ${Math.ceil(r.timeLeft / 1000)}s`;
  }

  _onOver(e) {
    const phaseNames = { dodge: 'Esquive', memory: 'Mémoire', reflex: 'Réflexes', boss: 'Duel final' };
    this._overlay.showGameOver(
      { result: 'lose', icon: '💀', title: 'RUN TERMINÉ', score: e.score, isRecord: e.isRecord,
        extraInfo: `<div class="overlay-score">Tombé en phase : ${phaseNames[e.phase] ?? e.phase}</div><div class="overlay-score">Record : ${e.best}</div>` },
      () => EventBus.emit('game:restart')
    );
  }

  _onWon(e) {
    this._overlay.showGameOver(
      { result: 'win', icon: '👑', title: 'BOSS VAINCU !', score: e.score, isRecord: e.isRecord,
        extraInfo: `<div class="overlay-score">Record : ${e.best}</div>` },
      () => EventBus.emit('game:restart')
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); }

  destroy() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:won',     this._onWon);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById('rb-styles')?.remove();
  }
}
