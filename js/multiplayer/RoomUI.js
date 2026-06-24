/**
 * RoomUI — Interface multijoueur RetroVault
 *
 * Deux modes :
 *   ⚡ DIRECT  — QR code, zéro serveur, P2P pur (QRConnect.js)
 *   🌐 SERVEUR — WebSocket relay via Railway (MultiplayerClient.js)
 *
 * Flux DIRECT :
 *   Hôte   → [CRÉER] → QR offre affiché → guest scanne → QR réponse → hôte scanne → P2P
 *   Guest  → URL scannée → QR réponse affiché → hôte scanne → P2P
 */

import EventBus          from '../core/EventBus.js';
import MultiplayerClient from './MultiplayerClient.js';
import QRConnect         from './QRConnect.js';

const GAME_LIST = [
  { id: 'tron',           label: '🏍  Tron',          available: true  },
  { id: 'pong',           label: '🏓  Pong',           available: true  },
  { id: 'tetris',         label: '🟦  Tetris Duel',    available: false },
  { id: 'space-invaders', label: '👾  Space Invaders', available: false },
];

/* ── État ─────────────────────────────────────────────────── */

let _app        = null;
let _mode       = 'qr';   // 'qr' | 'relay'
let _lobby      = { code: null, gameId: null, players: [] };
let _readyState = false;
let _handlers   = [];
let _hashBound  = false;

/* ── Montage ──────────────────────────────────────────────── */

function mount(app) {
  _app = app;
  _injectStyles();
  _bindMP();

  // Détecter ?join=CODE dans le hash → auto-rejoindre une relay room
  const joinCode = _getHashParam('join');
  if (joinCode) {
    _mode = 'relay';
    history.replaceState(null, '', location.pathname + '#multi');
    _showAutoJoining(joinCode.toUpperCase());
    MultiplayerClient.connect();
    _autoJoinOnConnect(joinCode.toUpperCase());
    return;
  }

  // Détecter ?sdp= → QR P2P (offre ou réponse)
  const incoming = QRConnect.checkIncoming();
  if (incoming && QRConnect.peekType(incoming) === 'offer') {
    _mode = 'qr';
    _showGuestWaiting(incoming);
    return;
  }
  if (incoming && QRConnect.peekType(incoming) === 'answer') {
    QRConnect.receiveAnswer(incoming);
    return;
  }

  if (_mode === 'relay') MultiplayerClient.connect();
  _showHub();
}

function _showAutoJoining(code) {
  _app.innerHTML = `
    <div class="mp-page" id="mp-page" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px">
      <div style="font-size:2rem;animation:mp-spin 1.2s linear infinite">🔄</div>
      <div style="font-size:.9rem;letter-spacing:.2em;color:#00ffe1">CONNEXION EN COURS…</div>
      <div style="font-size:.75rem;color:#7a9bbf">
        Rejoint la room <strong style="color:#fff;letter-spacing:.15em">${_esc(code)}</strong>
      </div>
    </div>
  `;
}

function _autoJoinOnConnect(code) {
  let done = false;
  const tryJoin = ({ status }) => {
    if (done || status !== 'connected') return;
    done = true;
    EventBus.off('mp:status', tryJoin);
    MultiplayerClient.joinRoom(code, localStorage.getItem('rv_mp_nick') || 'Joueur');
  };
  EventBus.on('mp:status', tryJoin);
  if (MultiplayerClient.status === 'connected') tryJoin({ status: 'connected' });
}

function _getHashParam(key) {
  const qi = location.hash.indexOf('?');
  if (qi === -1) return null;
  return new URLSearchParams(location.hash.slice(qi + 1)).get(key);
}

function unmount() {
  _handlers.forEach(({ event, fn }) => EventBus.off(event, fn));
  _handlers = [];
  if (_hashBound) { window.removeEventListener('hashchange', _onHashChange); _hashBound = false; }
  QRConnect.close();
}

/* ── EventBus ─────────────────────────────────────────────── */

function _on(event, fn) { EventBus.on(event, fn); _handlers.push({ event, fn }); }

function _bindMP() {
  // Relay mode (WS)
  _on('mp:status',        _onWSStatus);
  _on('mp:latency',       ({ latency }) => { const el = _q('#mp-status-txt'); if (el) el.textContent = `${latency}ms`; });
  _on('mp:retry',         ({ attempt }) => { const el = _q('#mp-status-txt'); if (el) el.textContent = `Reconnexion… (${attempt})`; });
  _on('mp:room-created',  ({ code, gameId, players }) => { _lobby = { code, gameId, players }; _showRelayLobby(); });
  _on('mp:room-joined',   ({ code, gameId, players }) => { _lobby = { code, gameId, players }; _showRelayLobby(); });
  _on('mp:error',         ({ reason }) => _toast({ room_not_found: 'Room introuvable.', room_full: 'Room pleine.' }[reason] || reason, 'error'));
  _on('mp:player-joined', ({ player }) => { if (!_lobby.players.find(p => p.id === player.id)) _lobby.players.push(player); _refreshPlayers(); _systemMsg(`${player.nickname} a rejoint.`); });
  _on('mp:player-left',   ({ playerId }) => { const p = _lobby.players.find(p => p.id === playerId); _lobby.players = _lobby.players.filter(p => p.id !== playerId); _refreshPlayers(); if (p) _systemMsg(`${p.nickname} a quitté.`); });
  _on('mp:player-ready',  ({ playerId, ready }) => { const p = _lobby.players.find(p => p.id === playerId); if (p) p.ready = ready; _refreshPlayers(); });
  _on('mp:host-changed',  ({ playerId }) => { _lobby.players.forEach(p => { p.host = p.id === playerId; }); _refreshPlayers(); });
  _on('mp:game-started',  _onGameStarted);
  // Chat — fonctionne pour relay ET QR (un seul listener)
  _on('mp:chat', ({ from, nickname, text }) => {
    const myId = _mode === 'qr'
      ? (QRConnect.getRole() === 'host' ? 0 : 1)
      : MultiplayerClient.playerId;
    _appendMsg(nickname, text, from === myId);
  });

  // QR / P2P mode
  _on('qr:status',        _onQRStatus);
  _on('qr:offer-ready',   _onOfferReady);
  _on('qr:answer-ready',  _onAnswerReady);
  _on('qr:guest-nick',    (nick) => _systemMsg(`${nick} a rejoint via QR !`));
  _on('qr:error',         (msg)  => _toast(msg, 'error'));
  _on('p2p:connected',    _onP2PConnected);
  _on('p2p:disconnected', () => _toast('Connexion P2P coupée.', 'error'));
}

/* ════════════════════════════════════════════════════════════
   ÉCRAN 1 — HUB
════════════════════════════════════════════════════════════ */

function _showHub() {
  _lobby      = { code: null, gameId: null, players: [] };
  _readyState = false;
  const savedNick = localStorage.getItem('rv_mp_nick') || '';
  const gameOpts  = GAME_LIST.map(g =>
    `<option value="${g.id}" ${!g.available ? 'disabled' : ''}>${g.label}${!g.available ? ' (bientôt)' : ''}</option>`
  ).join('');

  _app.innerHTML = `
    <div class="mp-page" id="mp-page">
      <nav class="mp-nav">
        <button class="mp-nav-back" id="mp-back">← Accueil</button>
        <div class="mp-nav-title">MULTI<span>JOUEUR</span></div>
        ${_mode === 'qr'
          ? `<div class="mp-status-chip mp-serverless"><span>⚡</span><span>Sans serveur</span></div>`
          : `<div class="mp-status-chip" id="mp-ws-chip"><span class="mp-dot" id="mp-dot"></span><span id="mp-status-txt">…</span></div>`
        }
      </nav>

      <div class="mp-hub">
        <div class="mp-hub-hero">
          <div class="mp-hub-icon">🎮</div>
          <div class="mp-hub-tagline">Même WiFi, même écran, même score.</div>
        </div>

        <!-- Mode -->
        <div class="mp-block">
          <div class="mp-label">MODE DE CONNEXION</div>
          <div class="mp-modes" id="mp-modes">
            <button class="mp-mode ${_mode === 'qr' ? 'mp-mode--on' : ''}" data-m="qr">
              <span class="mp-mode-icon">⚡</span>
              <span class="mp-mode-name">DIRECT</span>
              <span class="mp-mode-desc">QR code · Sans serveur</span>
            </button>
            <button class="mp-mode ${_mode === 'relay' ? 'mp-mode--on' : ''}" data-m="relay">
              <span class="mp-mode-icon">🌐</span>
              <span class="mp-mode-name">SERVEUR</span>
              <span class="mp-mode-desc">Via relay · Partout</span>
            </button>
          </div>
          <div class="mp-mode-tip" id="mp-mode-tip">${_modeTip()}</div>
        </div>

        <!-- Pseudo -->
        <div class="mp-block">
          <label class="mp-label" for="mp-nick">TON PSEUDO</label>
          <input class="mp-input mp-input--nick" id="mp-nick" type="text"
                 maxlength="16" placeholder="Pseudo…" value="${_esc(savedNick)}"
                 autocomplete="off" spellcheck="false" />
        </div>

        <!-- Créer -->
        <div class="mp-card">
          <div class="mp-card-hd">🕹 CRÉER UNE PARTIE</div>
          <label class="mp-label" for="mp-sel">JEU</label>
          <select class="mp-input mp-select" id="mp-sel">${gameOpts}</select>
          <button class="mp-btn mp-btn--cyan" id="mp-create" ${_mode === 'relay' && MultiplayerClient.status !== 'connected' ? 'disabled' : ''}>
            CRÉER →
          </button>
        </div>

        <div class="mp-or">— ou —</div>

        <!-- Rejoindre -->
        <div class="mp-card" id="mp-join-card">
          ${_mode === 'qr'
            ? `<div class="mp-card-hd">📷 SCANNER LE QR DE L'HÔTE</div>
               <p class="mp-hint">L'hôte génère un QR code.<br>Scanne-le avec la caméra de ton téléphone.</p>
               <div class="mp-label" style="margin-top:8px">OU COLLER LE LIEN REÇU</div>
               <input class="mp-input" id="mp-paste-url" type="text" placeholder="Colle l'URL ici…" autocomplete="off" />
               <button class="mp-btn mp-btn--purple" id="mp-join-paste">REJOINDRE →</button>`
            : `<div class="mp-card-hd">🔗 REJOINDRE</div>
               <label class="mp-label">CODE DE LA ROOM</label>
               <div class="mp-otp">
                 ${[0,1,2,3].map(i => `<input class="mp-otp-c" id="mp-c${i}" type="text" maxlength="1" inputmode="text" autocapitalize="characters" autocomplete="off" />`).join('')}
               </div>
               <button class="mp-btn mp-btn--purple" id="mp-join" disabled>REJOINDRE →</button>`
          }
        </div>
      </div>
    </div>
  `;

  _updateWSChip();
  _bindHub();
}

function _modeTip() {
  return _mode === 'qr'
    ? 'Les deux téléphones échangent un QR code. Aucun serveur, fonctionne hors ligne.'
    : 'Toutes les données transitent par notre serveur Railway. Marche partout, nécessite un serveur déployé.';
}

function _bindHub() {
  _q('#mp-back')?.addEventListener('click', () => { location.hash = '#home'; });

  const nick = _q('#mp-nick');
  nick?.addEventListener('input', () => localStorage.setItem('rv_mp_nick', nick.value.trim()));

  // Sélecteur de mode
  _q('#mp-modes')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-m]');
    if (!btn) return;
    _mode = btn.dataset.m;
    if (_mode === 'relay') {
      MultiplayerClient.setMode('relay');
      MultiplayerClient.connect(); // connecter WS si pas encore fait
    } else {
      MultiplayerClient.disconnect(); // pas besoin du WS en mode QR
    }
    _showHub(); // re-render
  });

  // Créer
  _q('#mp-create')?.addEventListener('click', () => {
    const gameId = _q('#mp-sel')?.value;
    if (!gameId) return;
    if (_mode === 'qr') {
      _showQROffer(gameId);
    } else {
      MultiplayerClient.createRoom(gameId, _nick());
    }
  });

  if (_mode === 'qr') {
    // Rejoindre via paste URL
    _q('#mp-join-paste')?.addEventListener('click', () => {
      const raw = _q('#mp-paste-url')?.value.trim();
      if (!raw) return;
      const sdp = _extractSdpFromUrl(raw);
      if (sdp && QRConnect.peekType(sdp) === 'offer') {
        _showGuestWaiting(sdp);
      } else {
        _toast('URL invalide.', 'error');
      }
    });
  } else {
    // Rejoindre via code room (relay)
    for (let i = 0; i < 4; i++) {
      const inp = _q(`#mp-c${i}`);
      if (!inp) continue;
      inp.addEventListener('input', () => {
        const v = inp.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(-1);
        inp.value = v;
        if (v && i < 3) _q(`#mp-c${i+1}`)?.focus();
        _q('#mp-join').disabled = _getCode().length !== 4 || MultiplayerClient.status !== 'connected';
      });
      inp.addEventListener('keydown', e => {
        if (e.key === 'Backspace' && !inp.value && i > 0) _q(`#mp-c${i-1}`)?.focus();
        if (e.key === 'Enter') _joinRelay();
      });
      inp.addEventListener('paste', e => {
        e.preventDefault();
        const t = (e.clipboardData.getData('text') || '').replace(/[^A-Za-z0-9]/g,'').toUpperCase().slice(0,4);
        for (let j = 0; j < 4; j++) { const c = _q(`#mp-c${j}`); if (c) c.value = t[j]||''; }
        _q('#mp-join').disabled = _getCode().length !== 4 || MultiplayerClient.status !== 'connected';
      });
    }
    _q('#mp-join')?.addEventListener('click', _joinRelay);
  }
}

function _joinRelay() {
  const code = _getCode();
  if (code.length !== 4) return;
  MultiplayerClient.joinRoom(code, _nick());
}

/* ════════════════════════════════════════════════════════════
   ÉCRAN QR — HÔTE AFFICHE SON OFFRE
════════════════════════════════════════════════════════════ */

function _showQROffer(gameId) {
  _lobby = { ..._lobby, gameId }; // mémoriser pour le lancement
  _app.innerHTML = `
    <div class="mp-page" id="mp-page">
      <nav class="mp-nav">
        <button class="mp-nav-back" id="mp-back">← Annuler</button>
        <div class="mp-nav-title">⚡ DIRECT</div>
      </nav>
      <div class="mp-qr-screen">
        <div class="mp-qr-step">ÉTAPE 1 / 2</div>
        <div class="mp-qr-title">Montre ce QR à l'autre joueur</div>
        <div class="mp-qr-box" id="mp-qr-box">
          <div class="mp-qr-loading">Génération…</div>
        </div>
        <div class="mp-qr-sub" id="mp-qr-sub">Calcul de la connexion en cours…</div>
        <div class="mp-qr-actions" id="mp-qr-actions" style="display:none">
          <button class="mp-btn mp-btn--share" id="mp-share">📤 Partager le lien</button>
          <button class="mp-btn mp-btn--copy"  id="mp-copy-url">📋 Copier le lien</button>
        </div>
        <div class="mp-qr-divider">— puis —</div>
        <div class="mp-qr-title" style="font-size:.75rem">Scanne le QR réponse du joueur 2</div>
        <div class="mp-qr-scan-hint">
          Ou colle son lien ici :
          <div class="mp-scan-row">
            <input class="mp-input mp-input--sm" id="mp-answer-url" type="text"
                   placeholder="URL de réponse…" autocomplete="off" />
            <button class="mp-btn mp-btn--sm mp-btn--cyan" id="mp-submit-answer">OK</button>
          </div>
        </div>
        <div class="mp-qr-waiting" id="mp-qr-waiting" style="display:none">
          <span class="mp-spinner">⟳</span> Connexion P2P en cours…
        </div>
      </div>
    </div>
  `;

  _q('#mp-back')?.addEventListener('click', () => { QRConnect.close(); _showHub(); });
  _q('#mp-submit-answer')?.addEventListener('click', _submitAnswer);
  _q('#mp-answer-url')?.addEventListener('keydown', e => { if (e.key === 'Enter') _submitAnswer(); });

  // Écouter hashchange : si l'hôte tape le lien réponse dans l'URL du navigateur
  if (!_hashBound) {
    window.addEventListener('hashchange', _onHashChange);
    _hashBound = true;
  }

  QRConnect.startAsHost(_nick());
  _onQRStatus('generating');
}

function _submitAnswer() {
  const raw = _q('#mp-answer-url')?.value.trim();
  if (!raw) return;
  const sdp = raw.startsWith('http') ? _extractSdpFromUrl(raw) : raw;
  if (sdp && QRConnect.peekType(sdp) === 'answer') {
    QRConnect.receiveAnswer(sdp);
    const el = _q('#mp-qr-waiting');
    if (el) el.style.display = 'flex';
  } else {
    _toast('URL de réponse invalide.', 'error');
  }
}

/* ════════════════════════════════════════════════════════════
   ÉCRAN QR — GUEST : saisie pseudo, puis affichage réponse
════════════════════════════════════════════════════════════ */

function _showGuestWaiting(offerEncoded) {
  // Lire le pseudo de l'hôte depuis le payload pour l'afficher
  const hostNickPeek = QRConnect.peekNick(offerEncoded) || 'l\'hôte';
  const savedNick    = localStorage.getItem('rv_mp_nick') || '';

  _app.innerHTML = `
    <div class="mp-page" id="mp-page">
      <nav class="mp-nav">
        <button class="mp-nav-back" id="mp-back">← Annuler</button>
        <div class="mp-nav-title">⚡ DIRECT</div>
      </nav>
      <div class="mp-qr-screen">
        <div class="mp-qr-step">ÉTAPE 2 / 2</div>
        <div class="mp-qr-title">Rejoindre la partie de ${_esc(hostNickPeek)}</div>
        <div class="mp-qr-box" id="mp-qr-box">
          <div class="mp-qr-loading mp-qr-loading--idle">📱</div>
        </div>
        <div class="mp-qr-sub">Entre ton pseudo pour générer ta réponse.</div>
        <label class="mp-label" for="mp-guest-nick">TON PSEUDO</label>
        <input class="mp-input mp-input--nick" id="mp-guest-nick" type="text"
               maxlength="16" placeholder="Pseudo…" value="${_esc(savedNick)}"
               autocomplete="off" spellcheck="false" />
        <button class="mp-btn mp-btn--purple" id="mp-guest-go">GÉNÉRER MA RÉPONSE →</button>
        <div class="mp-qr-actions" id="mp-qr-actions" style="display:none">
          <button class="mp-btn mp-btn--share" id="mp-share">📤 Partager le lien</button>
          <button class="mp-btn mp-btn--copy"  id="mp-copy-url">📋 Copier le lien</button>
        </div>
        <div class="mp-qr-waiting" id="mp-qr-waiting" style="display:none">
          <span class="mp-spinner">⟳</span> En attente que l'hôte scanne…
        </div>
      </div>
    </div>
  `;

  _q('#mp-back')?.addEventListener('click', () => { QRConnect.close(); _showHub(); });

  const doJoin = () => {
    const inp  = _q('#mp-guest-nick');
    const nick = inp?.value.trim() || 'Joueur 2';
    localStorage.setItem('rv_mp_nick', nick);
    inp?.setAttribute('disabled', '');
    _q('#mp-guest-go')?.setAttribute('disabled', '');

    // Remplacer l'emoji par l'animation de chargement
    const box = _q('#mp-qr-box');
    if (box) box.innerHTML = '<div class="mp-qr-loading">Connexion en cours…</div>';

    QRConnect.startAsGuest(offerEncoded, nick);
  };

  _q('#mp-guest-go')?.addEventListener('click', doJoin);
  _q('#mp-guest-nick')?.addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });
}

/* ════════════════════════════════════════════════════════════
   ÉCRAN P2P CONNECTÉ (QR mode)
════════════════════════════════════════════════════════════ */

function _showQRLobby() {
  const isHost    = QRConnect.getRole() === 'host';
  const myNick    = QRConnect.getMyNick();
  const otherNick = isHost ? QRConnect.getGuestNick() : QRConnect.getHostNick();
  const p1Nick    = isHost ? myNick : otherNick;
  const p2Nick    = isHost ? otherNick : myNick;

  _app.innerHTML = `
    <div class="mp-page" id="mp-page">
      <nav class="mp-nav">
        <button class="mp-nav-back" id="mp-back">← Quitter</button>
        <div class="mp-nav-title">⚡ P2P CONNECTÉ</div>
        <div class="mp-p2p-ok">✅</div>
      </nav>

      <div class="mp-lobby">
        <div class="mp-lobby-left">

          <div class="mp-connected-badge">⚡ Connexion directe — aucun serveur</div>

          <div class="mp-players">
            <div class="mp-player mp-player--ready">
              <span>👑</span>
              <span class="mp-player-name">${_esc(p1Nick)} <em class="mp-you">${isHost ? '(vous)' : ''}</em></span>
              <span class="mp-host-tag">HOST</span>
            </div>
            <div class="mp-player mp-player--ready">
              <span>🎮</span>
              <span class="mp-player-name">${_esc(p2Nick || '?')} <em class="mp-you">${!isHost ? '(vous)' : ''}</em></span>
            </div>
          </div>

          ${isHost
            ? `<button class="mp-btn mp-btn--cyan" id="mp-start-qr">▶ LANCER LA PARTIE</button>`
            : `<div class="mp-hint" style="text-align:center">En attente que l'hôte lance…</div>`
          }

        </div>

        <div class="mp-chat">
          <div class="mp-chat-label">CHAT</div>
          <div class="mp-chat-msgs" id="mp-chat-msgs">
            <div class="mp-chat-system">⚡ Connexion P2P directe établie !</div>
          </div>
          <div class="mp-chat-bar">
            <input class="mp-chat-inp" id="mp-chat-inp" type="text"
                   maxlength="200" placeholder="Message…" autocomplete="off" />
            <button class="mp-btn mp-btn--chat" id="mp-chat-send">▶</button>
          </div>
        </div>
      </div>
    </div>
  `;

  _q('#mp-back')?.addEventListener('click', () => { QRConnect.close(); if (_hashBound) { window.removeEventListener('hashchange', _onHashChange); _hashBound = false; } _showHub(); });

  if (isHost) {
    _q('#mp-start-qr')?.addEventListener('click', () => {
      QRConnect.send('game-started', { gameId: _lobby.gameId });
      _onGameStarted({ gameId: _lobby.gameId });
    });
  }

  const inp    = _q('#mp-chat-inp');
  const doSend = () => {
    const text = inp?.value.trim();
    if (!text) return;
    const nick = QRConnect.getMyNick();
    _appendMsg(nick, text, true);
    QRConnect.send('chat', { nickname: nick, text });
    inp.value = '';
  };
  _q('#mp-chat-send')?.addEventListener('click', doSend);
  inp?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSend(); } });

  // mp:chat géré par _bindMP() — pas de listener supplémentaire ici
  _on('mp:game-started', () => _showStartedOverlay());
}

/* ════════════════════════════════════════════════════════════
   ÉCRAN RELAY — LOBBY
════════════════════════════════════════════════════════════ */

function _showRelayLobby() {
  const isHost    = _lobby.players.find(p => p.id === MultiplayerClient.playerId)?.host;
  const gameLabel = GAME_LIST.find(g => g.id === _lobby.gameId)?.label ?? _lobby.gameId;

  _app.innerHTML = `
    <div class="mp-page" id="mp-page">
      <nav class="mp-nav">
        <button class="mp-nav-back" id="mp-back">← Quitter</button>
        <div class="mp-nav-title">${gameLabel}</div>
        <div class="mp-status-chip" id="mp-ws-chip">
          <span class="mp-dot mp-dot--connected" id="mp-dot"></span>
          <span id="mp-status-txt">${MultiplayerClient.latency || '…'}ms</span>
        </div>
      </nav>

      <div class="mp-lobby">
        <div class="mp-lobby-left">

          ${isHost ? `
          <div class="mp-join-qr-block">
            <div class="mp-join-qr-label">INVITE DES JOUEURS — SCANNE CE QR</div>
            <img class="mp-join-qr-img" id="mp-join-qr"
                 src="${_joinQrUrl(_lobby.code)}" alt="QR rejoindre" width="140" height="140" />
            <div class="mp-join-qr-sub">
              Code : <strong>${_lobby.code}</strong>
              <button class="mp-copy-btn" id="mp-copy">📋 Copier le lien</button>
            </div>
          </div>` : ''}

          <div class="mp-players" id="mp-players">${_renderPlayers()}</div>
          ${isHost
            ? `<button class="mp-btn mp-btn--yellow" id="mp-start" disabled>⏳ En attente des joueurs…</button>`
            : `<button class="mp-btn mp-btn--green"  id="mp-ready">✓ PRÊT</button>`
          }
          <div class="mp-legend"><span>✅ Prêt</span><span>⭕ En attente</span></div>
        </div>

        <div class="mp-chat">
          <div class="mp-chat-label">CHAT</div>
          <div class="mp-chat-msgs" id="mp-chat-msgs">
            <div class="mp-chat-system">Room ${_lobby.code} — ${isHost ? 'Partage le QR pour inviter.' : 'Tu as rejoint la room.'}</div>
          </div>
          <div class="mp-chat-bar">
            <input class="mp-chat-inp" id="mp-chat-inp" type="text" maxlength="200" placeholder="Message…" autocomplete="off" />
            <button class="mp-btn mp-btn--chat" id="mp-chat-send">▶</button>
          </div>
        </div>
      </div>
    </div>
  `;

  _updateWSChip();
  _bindRelayLobby(isHost);
  _refreshStart();
}

function _joinQrUrl(code) {
  const joinUrl = `${location.origin}${location.pathname}#multi?join=${code}`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=140x140&color=00ffe1&bgcolor=0b1120&margin=4&data=${encodeURIComponent(joinUrl)}`;
}

function _bindRelayLobby(isHost) {
  _q('#mp-back')?.addEventListener('click', () => { MultiplayerClient.disconnect(); MultiplayerClient.connect(); _showHub(); });
  _q('#mp-copy')?.addEventListener('click', () => {
    const joinUrl = `${location.origin}${location.pathname}#multi?join=${_lobby.code}`;
    navigator.clipboard?.writeText(joinUrl).catch(() => {});
    const b = _q('#mp-copy'); if (b) { b.textContent='✅ Copié !'; setTimeout(()=>{ b.textContent='📋 Copier le lien'; }, 1600); }
  });

  if (isHost) {
    _q('#mp-start')?.addEventListener('click', () => MultiplayerClient.startGame());
  } else {
    _q('#mp-ready')?.addEventListener('click', () => {
      _readyState = !_readyState;
      MultiplayerClient.setReady(_readyState);
      const b = _q('#mp-ready');
      if (b) { b.textContent = _readyState ? '✗ PAS PRÊT' : '✓ PRÊT'; b.classList.toggle('mp-btn--ready-on', _readyState); }
    });
  }

  const inp = _q('#mp-chat-inp');
  const doSend = () => { const t = inp?.value.trim(); if (!t) return; MultiplayerClient.sendChat(t); inp.value = ''; };
  _q('#mp-chat-send')?.addEventListener('click', doSend);
  inp?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSend(); } });
}

function _renderPlayers() {
  const myId = MultiplayerClient.playerId;
  return _lobby.players.map(p => `
    <div class="mp-player ${p.ready || p.host ? 'mp-player--ready' : ''}" id="mp-p${p.id}">
      <span>${p.ready || p.host ? '✅' : '⭕'}</span>
      <span class="mp-player-name">${_esc(p.nickname)}${p.id === myId ? ' <em class="mp-you">(vous)</em>' : ''}</span>
      ${p.host ? '<span class="mp-host-tag">HOST</span>' : ''}
    </div>
  `).join('') + (_lobby.players.length < 2 ? '<div class="mp-player mp-player--waiting">⏳ En attente…</div>' : '');
}

function _refreshPlayers() {
  const el = _q('#mp-players');
  if (el) el.innerHTML = _renderPlayers();
  _refreshStart();
}

function _refreshStart() {
  const btn = _q('#mp-start');
  if (!btn) return;
  const guests   = _lobby.players.filter(p => !p.host);
  const allReady = _lobby.players.length >= 2 && guests.every(p => p.ready);
  btn.disabled    = !allReady;
  btn.textContent = allReady ? '▶ LANCER LA PARTIE' : `⏳ ${guests.filter(p=>p.ready).length}/${guests.length} prêts…`;
}

/* ════════════════════════════════════════════════════════════
   HANDLERS EVENTS
════════════════════════════════════════════════════════════ */

function _onWSStatus({ status }) {
  _updateWSChip();
  const b = _q('#mp-create');
  if (b && _mode === 'relay') b.disabled = status !== 'connected';
}

function _onQRStatus(step) {
  const sub = _q('#mp-qr-sub');
  const map = {
    generating: 'Génération de la connexion WebRTC…',
    answering:  'Calcul de la réponse…',
    connecting: 'Connexion P2P en cours…',
  };
  if (sub) sub.textContent = map[step] || step;
}

function _onOfferReady({ qrSrc, url }) {
  const box = _q('#mp-qr-box');
  if (box) box.innerHTML = `<img class="mp-qr-img" src="${_esc(qrSrc)}" alt="QR code" width="220" height="220" />`;
  const sub = _q('#mp-qr-sub');
  if (sub) sub.textContent = 'L\'autre joueur scanne ce QR ou ouvre le lien.';
  const acts = _q('#mp-qr-actions');
  if (acts) acts.style.display = 'flex';
  _q('#mp-qr-waiting').style.display = 'flex';

  _q('#mp-share')?.addEventListener('click', () => _share('Rejoins ma partie RetroVault !', url));
  _q('#mp-copy-url')?.addEventListener('click', () => { navigator.clipboard?.writeText(url); _toast('Lien copié !'); });
}

function _onAnswerReady({ qrSrc, url, hostNick }) {
  const box = _q('#mp-qr-box');
  if (box) box.innerHTML = `<img class="mp-qr-img" src="${_esc(qrSrc)}" alt="QR code" width="220" height="220" />`;
  const sub = _q('#mp-qr-sub');
  if (sub) sub.textContent = `L'hôte ${_esc(hostNick || 'Hôte')} doit scanner ce QR ou ouvrir le lien.`;
  const acts = _q('#mp-qr-actions');
  if (acts) acts.style.display = 'flex';
  const wait = _q('#mp-qr-waiting');
  if (wait) { wait.textContent = '⟳ En attente que l\'hôte scanne…'; wait.style.display = 'flex'; }

  _q('#mp-share')?.addEventListener('click', () => _share('Ma réponse RetroVault', url));
  _q('#mp-copy-url')?.addEventListener('click', () => { navigator.clipboard?.writeText(url); _toast('Lien copié !'); });
}

function _onP2PConnected() {
  if (_hashBound) { window.removeEventListener('hashchange', _onHashChange); _hashBound = false; }
  _showQRLobby();
}

function _onGameStarted(payload = {}) {
  // Émettre un événement global que les jeux peuvent écouter
  EventBus.emit('mp:game-launch', {
    gameId:   _lobby.gameId ?? payload.gameId,
    playerId: _mode === 'qr'
      ? (QRConnect.getRole() === 'host' ? 0 : 1)
      : MultiplayerClient.playerId,
    roomCode: _lobby.code ?? payload.roomCode,
    mode:     _mode,
    p2pReady: QRConnect.isConnected(),
  });
  _showStartedOverlay();
}

/* ── Overlay lancé ────────────────────────────────────────── */

function _showStartedOverlay() {
  // Éviter d'ajouter l'overlay 2x
  if (_q('.mp-started-overlay')) return;
  const page = _q('#mp-page') ?? document.body;
  const gameLabel = GAME_LIST.find(g => g.id === _lobby.gameId)?.label ?? 'La partie';
  const channel   = _mode === 'qr' ? '⚡ P2P direct' : '🌐 Serveur relay';
  const ov = document.createElement('div');
  ov.className = 'mp-started-overlay';
  ov.innerHTML = `
    <div class="mp-started-box">
      <div style="font-size:2.8rem">🚀</div>
      <div class="mp-started-title">C'EST PARTI !</div>
      <div style="font-size:.78rem;color:#00ffe1;letter-spacing:.1em">${_esc(gameLabel)}</div>
      <div style="font-size:.68rem;color:#7a9bbf">${channel}</div>
      <button class="mp-btn mp-btn--cyan" onclick="this.closest('.mp-started-overlay').remove()">FERMER</button>
    </div>
  `;
  page.appendChild(ov);
}

/* ── hashchange — hôte reçoit réponse via URL ─────────────── */

function _onHashChange() {
  const incoming = QRConnect.checkIncoming();
  if (!incoming) return;
  const type = QRConnect.peekType(incoming);
  if (type === 'answer' && QRConnect.getRole() === 'host') {
    QRConnect.receiveAnswer(incoming);
    const el = _q('#mp-qr-waiting');
    if (el) { el.innerHTML = '⟳ Connexion P2P en cours…'; el.style.display = 'flex'; }
  }
}

/* ── Chat helpers ─────────────────────────────────────────── */

function _appendMsg(nickname, text, isMe) {
  const el = _q('#mp-chat-msgs');
  if (!el) return;
  const d = document.createElement('div');
  d.className = `mp-chat-msg${isMe ? ' mp-chat-msg--me' : ''}`;
  d.innerHTML = `<span class="mp-chat-nick">${_esc(nickname)}</span><span class="mp-chat-text">${_esc(text)}</span>`;
  el.appendChild(d);
  el.scrollTop = el.scrollHeight;
}

function _systemMsg(text) {
  const el = _q('#mp-chat-msgs');
  if (!el) return;
  const d = document.createElement('div');
  d.className = 'mp-chat-system';
  d.textContent = text;
  el.appendChild(d);
  el.scrollTop = el.scrollHeight;
}

/* ── Chips ────────────────────────────────────────────────── */

function _updateWSChip() {
  const dot = _q('#mp-dot');
  const txt = _q('#mp-status-txt');
  const s   = MultiplayerClient.status;
  if (dot) dot.className = `mp-dot mp-dot--${s}`;
  if (txt && s !== 'connected') txt.textContent = s === 'connecting' ? 'Connexion…' : 'Déconnecté';
}

/* ── Toast ────────────────────────────────────────────────── */

function _toast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `mp-toast mp-toast--${type}`;
  t.textContent = msg;
  (_q('#mp-page') ?? document.body).appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

/* ── Web Share API ────────────────────────────────────────── */

function _share(title, url) {
  if (navigator.share) {
    navigator.share({ title, text: title, url }).catch(() => {});
  } else {
    navigator.clipboard?.writeText(url);
    _toast('Lien copié dans le presse-papier !');
  }
}

/* ── Utilitaires ──────────────────────────────────────────── */

function _q(sel)  { return document.querySelector(sel); }
function _esc(s)  { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _nick()  { return _q('#mp-nick')?.value.trim() || localStorage.getItem('rv_mp_nick') || 'Joueur'; }
function _getCode() { return [0,1,2,3].map(i => _q(`#mp-c${i}`)?.value||'').join(''); }

function _extractSdpFromUrl(url) {
  try {
    const hash = new URL(url).hash;
    const qi   = hash.indexOf('?');
    if (qi === -1) return null;
    return new URLSearchParams(hash.slice(qi + 1)).get('sdp');
  } catch {
    return url; // peut-être directement le payload base64
  }
}

/* ════════════════════════════════════════════════════════════
   CSS
════════════════════════════════════════════════════════════ */

function _injectStyles() {
  if (document.getElementById('mp-styles')) return;
  const s = document.createElement('style');
  s.id = 'mp-styles';
  s.textContent = `
    .mp-page { min-height:100vh; display:flex; flex-direction:column; background:#05080f;
      font-family:'Orbitron',monospace; color:#e8f4f8; position:relative; overflow-x:hidden; }

    .mp-nav { display:flex; align-items:center; padding:0 16px; height:52px; gap:10px;
      border-bottom:1px solid #1a2d50; flex-shrink:0; }
    .mp-nav-back { background:none; border:none; color:#7a9bbf; font-family:'Orbitron',monospace;
      font-size:.7rem; cursor:pointer; padding:8px 10px; border-radius:6px;
      white-space:nowrap; transition:color .15s; }
    .mp-nav-back:hover { color:#00ffe1; }
    .mp-nav-title { flex:1; font-size:.82rem; font-weight:900; letter-spacing:.18em;
      color:#00ffe1; text-shadow:0 0 12px rgba(0,255,225,.4); text-align:center; }
    .mp-p2p-ok { font-size:1.1rem; }

    .mp-status-chip { display:flex; align-items:center; gap:5px;
      font-size:.62rem; letter-spacing:.06em; color:#7a9bbf; white-space:nowrap; }
    .mp-serverless  { color:rgba(0,255,225,.7); }
    .mp-dot { width:7px; height:7px; border-radius:50%; background:#3a5070; flex-shrink:0; }
    .mp-dot--connected  { background:#00ff88; box-shadow:0 0 5px #00ff88; }
    .mp-dot--connecting { background:#ffe600; box-shadow:0 0 5px #ffe600; animation:mp-blink .8s infinite; }
    .mp-dot--disconnected { background:#ff2d78; }
    @keyframes mp-blink { 0%,100%{opacity:1} 50%{opacity:.2} }

    /* Hub */
    .mp-hub { flex:1; display:flex; flex-direction:column; align-items:center; gap:16px;
      padding:20px 16px 40px; max-width:480px; width:100%; margin:0 auto; }
    .mp-hub-hero { text-align:center; }
    .mp-hub-icon { font-size:2.2rem; line-height:1; margin-bottom:5px; }
    .mp-hub-tagline { font-size:.7rem; color:#7a9bbf; letter-spacing:.08em; font-family:'Rajdhani',sans-serif; }
    .mp-block { width:100%; display:flex; flex-direction:column; gap:8px; }
    .mp-label { display:block; font-size:.6rem; letter-spacing:.14em; color:#7a9bbf;
      margin-bottom:4px; text-transform:uppercase; }

    /* Mode selector */
    .mp-modes { display:flex; gap:10px; }
    .mp-mode { flex:1; display:flex; flex-direction:column; align-items:center; gap:3px;
      padding:12px 8px; background:#0b1120; border:2px solid #1a2d50; border-radius:12px;
      cursor:pointer; transition:border-color .15s, background .15s; font-family:'Orbitron',monospace; }
    .mp-mode:hover    { border-color:#3a5070; }
    .mp-mode--on      { border-color:#00ffe1; background:rgba(0,255,225,.04); }
    .mp-mode-icon     { font-size:1.3rem; line-height:1; }
    .mp-mode-name     { font-size:.7rem; font-weight:900; letter-spacing:.12em; color:#e8f4f8; }
    .mp-mode-desc     { font-size:.58rem; color:#7a9bbf; font-family:'Rajdhani',sans-serif; }
    .mp-mode-tip      { font-size:.62rem; color:#3a5070; text-align:center; font-family:'Rajdhani',sans-serif; min-height:2.4em; }

    /* Inputs */
    .mp-input { width:100%; box-sizing:border-box; background:#0b1120; border:1px solid #1a2d50;
      border-radius:8px; color:#e8f4f8; font-family:'Orbitron',monospace; font-size:.85rem;
      padding:12px 14px; outline:none; transition:border-color .2s; }
    .mp-input:focus { border-color:#00ffe1; }
    .mp-input--nick  { font-size:1rem; text-align:center; letter-spacing:.1em; }
    .mp-input--sm    { flex:1; padding:10px 12px; font-size:.78rem; }
    .mp-select option:disabled { color:#3a5070; }

    /* Card */
    .mp-card { width:100%; background:rgba(0,255,225,.02); border:1px solid #1a2d50;
      border-radius:12px; padding:16px; display:flex; flex-direction:column; gap:10px; }
    .mp-card-hd { font-size:.78rem; letter-spacing:.12em; }

    /* OTP */
    .mp-otp { display:flex; gap:10px; justify-content:center; }
    .mp-otp-c { width:58px; height:68px; text-align:center; background:#0b1120;
      border:2px solid #1a2d50; border-radius:10px; color:#00ffe1;
      font-family:'Orbitron',monospace; font-size:1.8rem; font-weight:900; outline:none;
      transition:border-color .2s, box-shadow .2s; }
    .mp-otp-c:focus { border-color:#00ffe1; box-shadow:0 0 0 2px rgba(0,255,225,.2); }

    /* Buttons */
    .mp-btn { font-family:'Orbitron',monospace; font-size:.74rem; font-weight:900;
      letter-spacing:.14em; border-radius:8px; border:2px solid; cursor:pointer;
      padding:14px 20px; min-height:48px; text-align:center; transition:background .15s, box-shadow .15s; }
    .mp-btn:disabled { opacity:.35; cursor:not-allowed; }
    .mp-btn--cyan   { border-color:#00ffe1; color:#00ffe1; background:transparent; }
    .mp-btn--cyan:not(:disabled):hover { background:rgba(0,255,225,.1); box-shadow:0 0 14px rgba(0,255,225,.25); }
    .mp-btn--purple { border-color:#bf5fff; color:#bf5fff; background:transparent; }
    .mp-btn--purple:not(:disabled):hover { background:rgba(191,95,255,.1); }
    .mp-btn--green  { border-color:#00ff88; color:#00ff88; background:transparent; width:100%; }
    .mp-btn--ready-on { background:rgba(0,255,136,.08); border-color:#ff2d78; color:#ff2d78; }
    .mp-btn--yellow { border-color:#ffe600; color:#ffe600; background:transparent; width:100%; }
    .mp-btn--yellow:not(:disabled):hover { background:rgba(255,230,0,.08); }
    .mp-btn--share  { border-color:#00ffe1; color:#00ffe1; background:transparent; flex:1; }
    .mp-btn--copy   { border-color:#7a9bbf; color:#7a9bbf; background:transparent; flex:1; }
    .mp-btn--chat   { border-color:#00ffe1; color:#00ffe1; background:transparent; padding:0 16px; min-height:44px; flex-shrink:0; }
    .mp-btn--sm     { padding:10px 14px; min-height:40px; white-space:nowrap; }
    .mp-or { font-size:.62rem; color:#3a5070; letter-spacing:.1em; text-align:center; }
    .mp-hint { font-size:.72rem; color:#7a9bbf; font-family:'Rajdhani',sans-serif;
      line-height:1.6; letter-spacing:.04em; }

    /* QR screens */
    .mp-qr-screen { flex:1; display:flex; flex-direction:column; align-items:center;
      gap:16px; padding:24px 20px 40px; max-width:440px; width:100%; margin:0 auto; }
    .mp-qr-step  { font-size:.6rem; letter-spacing:.2em; color:#7a9bbf; }
    .mp-qr-title { font-size:.82rem; font-weight:700; letter-spacing:.1em; text-align:center;
      color:#e8f4f8; }
    .mp-qr-box   { width:236px; height:236px; display:flex; align-items:center; justify-content:center;
      background:#0b1120; border:1px solid #1a2d50; border-radius:14px; }
    .mp-qr-img   { border-radius:8px; display:block; }
    .mp-qr-loading { font-size:.7rem; color:#3a5070; letter-spacing:.1em; animation:mp-blink 1s infinite; }
    .mp-qr-loading--idle { font-size:2.5rem; animation:none; }
    .mp-qr-sub   { font-size:.7rem; color:#7a9bbf; letter-spacing:.06em; text-align:center;
      font-family:'Rajdhani',sans-serif; line-height:1.5; }
    .mp-qr-actions { display:none; flex-direction:row; gap:10px; width:100%; }
    .mp-qr-divider { font-size:.6rem; color:#3a5070; letter-spacing:.12em; }
    .mp-qr-scan-hint { width:100%; display:flex; flex-direction:column; gap:8px;
      font-size:.62rem; letter-spacing:.1em; color:#7a9bbf; }
    .mp-scan-row { display:flex; gap:8px; }
    .mp-qr-waiting { display:none; align-items:center; gap:8px; font-size:.7rem;
      color:#ffe600; letter-spacing:.08em; }
    .mp-spinner { display:inline-block; animation:mp-spin 1.2s linear infinite; }
    @keyframes mp-spin { to { transform:rotate(360deg); } }

    /* Lobby commun */
    .mp-lobby { flex:1; display:flex; flex-direction:column; min-height:0; }
    @media (min-width:640px) {
      .mp-lobby { flex-direction:row; }
      .mp-lobby-left { width:300px; flex-shrink:0; border-right:1px solid #1a2d50; }
    }
    .mp-lobby-left { display:flex; flex-direction:column; gap:14px; padding:18px 16px;
      border-bottom:1px solid #1a2d50; }
    @media (min-width:640px) { .mp-lobby-left { border-bottom:none; } }

    /* QR bloc dans lobby relay */
    .mp-join-qr-block { display:flex; flex-direction:column; align-items:center; gap:6px;
      padding:12px; background:rgba(0,255,225,.03); border:1px dashed rgba(0,255,225,.25);
      border-radius:10px; }
    .mp-join-qr-label { font-size:.58rem; letter-spacing:.12em; color:#7a9bbf; }
    .mp-join-qr-img   { border-radius:6px; display:block; }
    .mp-join-qr-sub   { font-size:.68rem; color:#7a9bbf; text-align:center;
      display:flex; flex-direction:column; align-items:center; gap:4px; }
    .mp-join-qr-sub strong { color:#00ffe1; letter-spacing:.2em; font-size:1rem; }

    @keyframes mp-spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
    .mp-connected-badge { font-size:.62rem; letter-spacing:.1em; color:#00ff88;
      border:1px solid rgba(0,255,136,.3); border-radius:20px; padding:6px 14px;
      text-align:center; }
    .mp-section-label { font-size:.62rem; letter-spacing:.14em; color:#7a9bbf;
      display:flex; align-items:center; gap:10px; }
    .mp-code-display { color:#00ffe1; font-size:1rem; letter-spacing:.2em;
      text-shadow:0 0 8px rgba(0,255,225,.5); }
    .mp-copy-btn { background:none; border:none; cursor:pointer; font-size:1rem;
      padding:4px 6px; border-radius:4px; transition:background .15s; }
    .mp-copy-btn:hover { background:rgba(255,255,255,.08); }

    .mp-players { display:flex; flex-direction:column; gap:8px; }
    .mp-player  { display:flex; align-items:center; gap:10px; padding:10px 14px;
      border-radius:8px; background:#0b1120; border:1px solid #1a2d50;
      font-size:.78rem; transition:border-color .2s; }
    .mp-player--ready   { border-color:rgba(0,255,136,.3); }
    .mp-player--waiting { color:#3a5070; border-style:dashed; }
    .mp-player-name { flex:1; }
    .mp-you     { font-style:italic; color:#7a9bbf; font-size:.68rem; }
    .mp-host-tag { font-size:.56rem; letter-spacing:.1em; color:#ffe600;
      border:1px solid rgba(255,230,0,.4); border-radius:4px; padding:2px 6px; }
    .mp-legend  { display:flex; gap:16px; font-size:.6rem; color:#3a5070; }

    /* Chat */
    .mp-chat { display:flex; flex-direction:column; min-height:200px; max-height:360px; }
    @media (min-width:640px) { .mp-chat { max-height:none; flex:1; } }
    .mp-chat-label { font-size:.6rem; letter-spacing:.14em; color:#7a9bbf;
      padding:12px 16px 6px; border-bottom:1px solid #1a2d50; flex-shrink:0; }
    .mp-chat-msgs { flex:1; overflow-y:auto; padding:12px 16px;
      display:flex; flex-direction:column; gap:8px; scroll-behavior:smooth; }
    .mp-chat-msgs::-webkit-scrollbar { width:4px; }
    .mp-chat-msgs::-webkit-scrollbar-thumb { background:#1a2d50; border-radius:2px; }
    .mp-chat-msg { display:flex; flex-direction:column; gap:2px; max-width:80%; }
    .mp-chat-msg--me { align-self:flex-end; text-align:right; }
    .mp-chat-nick { font-size:.56rem; color:#7a9bbf; letter-spacing:.06em; }
    .mp-chat-text { background:#0d1526; border:1px solid #1a2d50; border-radius:8px;
      padding:6px 10px; font-family:'Rajdhani',sans-serif; font-size:.9rem; color:#e8f4f8; }
    .mp-chat-msg--me .mp-chat-text { background:rgba(0,255,225,.05); border-color:rgba(0,255,225,.2); }
    .mp-chat-system { font-size:.62rem; color:#3a5070; text-align:center;
      letter-spacing:.05em; padding:2px 0; }
    .mp-chat-bar { display:flex; gap:8px; padding:10px 12px;
      border-top:1px solid #1a2d50; flex-shrink:0; }
    .mp-chat-inp { flex:1; background:#0b1120; border:1px solid #1a2d50; border-radius:8px;
      color:#e8f4f8; font-family:'Rajdhani',sans-serif; font-size:.95rem;
      padding:10px 12px; outline:none; transition:border-color .2s; }
    .mp-chat-inp:focus { border-color:#00ffe1; }

    /* Overlay lancé */
    .mp-started-overlay { position:absolute; inset:0; background:rgba(5,8,15,.92);
      backdrop-filter:blur(6px); display:flex; align-items:center;
      justify-content:center; z-index:50; }
    .mp-started-box { display:flex; flex-direction:column; align-items:center;
      gap:12px; text-align:center; padding:30px 24px; background:#0b1120;
      border:1px solid #00ffe1; border-radius:16px; max-width:300px;
      box-shadow:0 0 40px rgba(0,255,225,.15); }
    .mp-started-title { font-size:1.4rem; font-weight:900; letter-spacing:.2em;
      color:#00ffe1; text-shadow:0 0 12px rgba(0,255,225,.5); }

    /* Toast */
    .mp-toast { position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
      background:#0d1526; border-radius:8px; padding:12px 20px; font-size:.74rem;
      letter-spacing:.08em; z-index:100; animation:mp-fadein .2s ease;
      max-width:calc(100vw - 40px); text-align:center; white-space:nowrap; }
    .mp-toast--error { border:1px solid #ff2d78; color:#ff2d78; }
    .mp-toast--info  { border:1px solid #00ffe1; color:#00ffe1; }
    @keyframes mp-fadein { from { opacity:0; transform:translateX(-50%) translateY(8px); } }
  `;
  document.head.appendChild(s);
}

export default { mount, unmount };
