/**
 * TouchControls — Overlay de contrôles tactiles universel
 *
 * Principe : lire le champ "touchControls" de la config du jeu,
 * rendre les boutons appropriés dans la touch-zone du GameShell,
 * et émettre des KeyboardEvent synthétiques sur document.
 *
 * Les jeux existants reçoivent ces events comme s'ils venaient
 * du clavier — aucune modification de leur logique requise.
 *
 * Types supportés :
 *  - "dpad"     : croix directionnelle ± boutons action
 *  - "swipe"    : détection de geste sur le viewport (2048, etc.)
 *  - "hold"     : grand bouton à maintenir (Flappy Bird)
 *  - "keyboard" : proxy input → clavier natif du téléphone
 *  - "tap"      : (défaut) rien à rendre, les clicks natifs suffisent
 */

const TouchControls = (() => {

  let _zone          = null;   // #gs-touch-zone
  let _viewportWrap  = null;   // .game-shell__viewport-wrap (pour swipe)
  let _config        = null;
  let _swipeHandlers = null;

  /* ─── API publique ──────────────────────────────── */

  function isMobile() {
    return window.matchMedia('(pointer: coarse)').matches;
  }

  /**
   * @param {HTMLElement} zone         — la touch-zone du GameShell
   * @param {Object}      touchConfig  — config.touchControls du jeu
   * @param {HTMLElement} viewportWrap — .game-shell__viewport-wrap
   */
  function init(zone, touchConfig, viewportWrap) {
    destroy();

    _zone         = zone;
    _viewportWrap = viewportWrap;
    _config       = touchConfig || { type: 'tap' };

    if (!isMobile()) return;

    const type = _config.type || 'tap';
    if (type === 'tap') return;

    if      (type === 'dpad')     _renderDpad();
    else if (type === 'swipe')    _setupSwipe();
    else if (type === 'hold')     _renderHold();
    else if (type === 'keyboard') _renderKeyboard();
  }

  function destroy() {
    if (_zone) _zone.innerHTML = '';
    _removeSwipe();
    _zone         = null;
    _viewportWrap = null;
    _config       = null;
  }

  /* ─── D-PAD ─────────────────────────────────────── */

  function _renderDpad() {
    const actions = _config.actions || [];

    _zone.innerHTML = `
      <div class="tc-layout">
        <div class="tc-dpad">
          <div class="tc-dpad-row">
            <span class="tc-dpad-cell"></span>
            <button class="tc-btn tc-dpad-btn" data-key="ArrowUp" data-hold="1">▲</button>
            <span class="tc-dpad-cell"></span>
          </div>
          <div class="tc-dpad-row">
            <button class="tc-btn tc-dpad-btn" data-key="ArrowLeft" data-hold="1">◀</button>
            <span class="tc-dpad-center"></span>
            <button class="tc-btn tc-dpad-btn" data-key="ArrowRight" data-hold="1">▶</button>
          </div>
          <div class="tc-dpad-row">
            <span class="tc-dpad-cell"></span>
            <button class="tc-btn tc-dpad-btn" data-key="ArrowDown" data-hold="1">▼</button>
            <span class="tc-dpad-cell"></span>
          </div>
        </div>

        ${actions.length ? `
          <div class="tc-actions">
            ${actions.map(a => `
              <button class="tc-btn tc-action-btn" data-key="${a.key}">${a.label}</button>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;

    _bindButtons();
  }

  /* ─── SWIPE ─────────────────────────────────────── */

  function _setupSwipe() {
    if (!_viewportWrap) return;

    let startX = null;
    let startY = null;
    const THRESHOLD = 40;

    const onStart = e => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };

    const onEnd = e => {
      if (startX == null) return;
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      startX = startY = null;

      if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return;

      const key = Math.abs(dx) > Math.abs(dy)
        ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft')
        : (dy > 0 ? 'ArrowDown'  : 'ArrowUp');

      _dispatch(key, 'keydown');
      setTimeout(() => _dispatch(key, 'keyup'), 50);
    };

    _viewportWrap.addEventListener('touchstart', onStart, { passive: true });
    _viewportWrap.addEventListener('touchend',   onEnd,   { passive: true });
    _swipeHandlers = { onStart, onEnd };
  }

  function _removeSwipe() {
    if (!_swipeHandlers || !_viewportWrap) return;
    _viewportWrap.removeEventListener('touchstart', _swipeHandlers.onStart);
    _viewportWrap.removeEventListener('touchend',   _swipeHandlers.onEnd);
    _swipeHandlers = null;
  }

  /* ─── HOLD (Flappy Bird style) ──────────────────── */

  function _renderHold() {
    const actions = _config.actions || [];
    const primary = actions[0] || { label: 'TAP', key: ' ' };

    _zone.innerHTML = `
      <div class="tc-layout tc-layout--hold">
        <button class="tc-btn tc-hold-btn" data-key="${primary.key}">${primary.label}</button>
      </div>
    `;
    _bindButtons();
  }

  /* ─── KEYBOARD (Wordle / Hangman / Typing Rush) ─── */

  function _renderKeyboard() {
    _zone.innerHTML = `
      <div class="tc-layout tc-layout--keyboard">
        <input class="tc-proxy-input" type="text" inputmode="text"
               autocomplete="off" autocorrect="off"
               autocapitalize="off" spellcheck="false" />
        <button class="tc-kb-trigger">⌨ CLAVIER</button>
        <p class="tc-kb-hint">Ou tapez directement sur le champ ci-dessus</p>
      </div>
    `;

    const proxy   = _zone.querySelector('.tc-proxy-input');
    const trigger = _zone.querySelector('.tc-kb-trigger');

    trigger.addEventListener('click', () => proxy.focus());

    // Backspace / Entrée via keydown (fonctionnent même sur mobile)
    proxy.addEventListener('keydown', e => {
      if (e.key === 'Backspace' || e.key === 'Enter') {
        e.preventDefault();
        document.dispatchEvent(new KeyboardEvent('keydown', {
          key: e.key, code: e.code, bubbles: true, cancelable: true,
        }));
      }
    });

    // Caractères alphanumériques via input (certains claviers mobiles n'envoient pas keydown)
    proxy.addEventListener('input', () => {
      const val = proxy.value;
      if (!val) return;
      const ch = val[val.length - 1].toUpperCase();
      proxy.value = '';
      if (/^[A-ZÉÈÀÙÂÊÎÔÛÇ]$/.test(ch)) {
        document.dispatchEvent(new KeyboardEvent('keydown', {
          key: ch, code: `Key${ch}`, bubbles: true, cancelable: true,
        }));
      }
    });
  }

  /* ─── Bind events sur tous les boutons ──────────── */

  function _bindButtons() {
    _zone.querySelectorAll('.tc-btn').forEach(btn => {
      const key  = btn.dataset.key;
      const hold = !!btn.dataset.hold;

      btn.addEventListener('touchstart', e => {
        e.preventDefault();
        btn.classList.add('tc-btn--active');
        _dispatch(key, 'keydown');
      }, { passive: false });

      btn.addEventListener('touchend', e => {
        e.preventDefault();
        btn.classList.remove('tc-btn--active');
        if (hold) _dispatch(key, 'keyup');
      }, { passive: false });

      btn.addEventListener('touchcancel', () => {
        btn.classList.remove('tc-btn--active');
        if (hold) _dispatch(key, 'keyup');
      });

      // Empêcher le double-déclenchement (touchstart → click sur mobile)
      btn.addEventListener('click', e => e.preventDefault());
    });
  }

  /* ─── Dispatch KeyboardEvent synthétique ────────── */

  function _dispatch(key, type) {
    const codeMap = {
      'ArrowUp':    'ArrowUp',
      'ArrowDown':  'ArrowDown',
      'ArrowLeft':  'ArrowLeft',
      'ArrowRight': 'ArrowRight',
      ' ':          'Space',
      'Enter':      'Enter',
      'Escape':     'Escape',
      'z':          'KeyZ',
      'x':          'KeyX',
      'Z':          'KeyZ',
      'X':          'KeyX',
    };
    document.dispatchEvent(new KeyboardEvent(type, {
      key,
      code:       codeMap[key] || `Key${key.toUpperCase()}`,
      bubbles:    true,
      cancelable: true,
    }));
  }

  /* ─── Export ─────────────────────────────────────── */

  return { init, destroy, isMobile };
})();

export default TouchControls;
