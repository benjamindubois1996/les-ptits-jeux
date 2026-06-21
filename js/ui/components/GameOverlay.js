/**
 * GameOverlay — composant unique pour TOUS les écrans superposés d'un jeu
 * (démarrage, pause, fin de partie).
 *
 * Usage minimal dans un renderer :
 *
 *   init() {
 *     this._overlay = new GameOverlay(this.viewport);
 *     this._overlay.showStart(this._optionGroups(), (sel) => this.game.start(sel));
 *   }
 *
 * Sur desktop, showStart() délègue les options au panneau latéral de GameShell
 * et n'affiche que le bouton JOUER sur le canvas.
 * Sur mobile, il affiche le plein écran classique (chips + JOUER).
 *
 * CSS associé : `.ov-*` dans index.html.
 */

import EventBus from '../../../js/core/EventBus.js';

const RESULT_PRESETS = {
  win:  { icon: '🏆', title: 'VICTOIRE !', titleColor: 'var(--neon-green)' },
  lose: { icon: '💀', title: 'GAME OVER',  titleColor: 'var(--neon-pink)'  },
};

export default class GameOverlay {

  constructor(viewport) {
    this.el = document.createElement('div');
    this.el.className = 'ov-panel ov-panel--hidden';
    viewport.appendChild(this.el);
  }

  /* ============================================================
     VISIBILITÉ
     ============================================================ */

  show() {
    this.el.classList.remove('ov-panel--hidden');
    document.getElementById('gs-overlay')?.classList.add('hidden');
  }

  hide() {
    this.el.classList.add('ov-panel--hidden');
  }

  destroy() {
    this.el.remove();
  }

  /* ============================================================
     API D'INSTANCE
     ============================================================ */

  showStart(optionGroups, onPlay, opts = {}) {
    // Notifie le panneau latéral pour qu'il affiche les options
    EventBus.emit('game:sidebar-register', { groups: optionGroups, onPlay });

    // Desktop (sidebar visible inline) : juste le bouton JOUER sur le canvas
    // Mobile (sidebar en drawer fixe)  : plein écran avec chips + JOUER
    const sidebar = document.getElementById('gs-sidebar');
    const hasSidebar = sidebar && window.getComputedStyle(sidebar).position !== 'fixed';

    if (hasSidebar) {
      const { playLabel = 'JOUER' } = opts;
      this.el.innerHTML = `<button class="ov-play-btn" id="ov-play-btn">${playLabel}</button>`;
      this.el.querySelector('#ov-play-btn')?.addEventListener('click', () => {
        EventBus.emit('game:play-requested');
      });
    } else {
      GameOverlay.renderStart(this.el, optionGroups, onPlay, opts);
    }
    this.show();
  }

  showGameOver(data, onReplay, onHome) {
    GameOverlay.renderGameOver(this.el, data, onReplay, onHome);
    this.show();
  }

  showPause(onResume) {
    GameOverlay.renderPause(this.el, onResume);
    this.show();
  }

  /* ============================================================
     API STATIQUE — rendu pur sur un élément donné
     Utilisée par GameShell.js pour son overlay générique de secours.
     ============================================================ */

  static renderStart(root, optionGroups, onPlay, opts = {}) {
    const { playLabel = 'JOUER', extraHtml = '' } = opts;

    root.innerHTML = `
      ${extraHtml}
      ${optionGroups.map(group => `
        <div class="ov-group">
          <div class="ov-group-label">${group.label}</div>
          <div class="ov-chips" data-key="${group.key}">
            ${group.options.map(o => `
              <button class="ov-chip${o.value === group.default ? ' ov-chip--on' : ''}" data-value="${o.value}">${o.label}</button>
            `).join('')}
          </div>
        </div>
      `).join('')}
      <button class="ov-play-btn" id="ov-play-btn">${playLabel}</button>
    `;

    const selections = {};
    optionGroups.forEach(g => { selections[g.key] = g.default; });

    root.querySelectorAll('.ov-chips').forEach(group => {
      group.addEventListener('click', e => {
        const btn = e.target.closest('.ov-chip');
        if (!btn) return;
        const raw       = btn.dataset.value;
        const isNumeric = raw !== '' && !isNaN(Number(raw));
        selections[group.dataset.key] = isNumeric ? Number(raw) : raw;
        group.querySelectorAll('.ov-chip').forEach(b => b.classList.remove('ov-chip--on'));
        btn.classList.add('ov-chip--on');
      });
    });

    root.querySelector('#ov-play-btn')?.addEventListener('click', () => onPlay(selections));
  }

  static renderGameOver(root, data, onReplay, onHome) {
    const preset = RESULT_PRESETS[data.result] || RESULT_PRESETS.lose;
    const icon   = data.icon  ?? preset.icon;
    const title  = data.title ?? preset.title;

    root.innerHTML = `
      <div class="overlay-icon">${icon}</div>
      <div class="overlay-title" style="color:${preset.titleColor}">${title}</div>
      ${data.score !== undefined ? `<div class="overlay-score">Score final : <strong>${data.score}</strong></div>` : ''}
      ${data.extraInfo || ''}
      ${data.isRecord ? '<div class="overlay-record">🏆 Nouveau record !</div>' : ''}
      <div class="overlay-actions">
        <button class="ov-play-btn" id="ov-replay-btn">REJOUER</button>
        ${onHome ? '<button class="btn btn-ghost" id="ov-home-btn">Accueil</button>' : ''}
      </div>
    `;

    root.querySelector('#ov-replay-btn')?.addEventListener('click', onReplay);
    if (onHome) root.querySelector('#ov-home-btn')?.addEventListener('click', onHome);
  }

  static renderPause(root, onResume) {
    root.innerHTML = `
      <div class="overlay-icon">⏸</div>
      <div class="overlay-title">PAUSE</div>
      <button class="ov-play-btn" id="ov-resume-btn">REPRENDRE</button>
    `;
    root.querySelector('#ov-resume-btn')?.addEventListener('click', onResume);
  }
}
