/**
 * MultiplayerClient — Orchestrateur multijoueur RetroVault
 *
 * Deux modes de connexion :
 *   'relay' — tout transite par le serveur WebSocket (Railway)
 *   'p2p'   — WebRTC DataChannel direct après signaling via WS
 *
 * Le WS reste actif dans les deux modes pour le chat et le signaling.
 * En mode P2P, les messages de jeu (game:*) passent par le DataChannel.
 *
 * Après déploiement Railway, mettre à jour WS_PROD_URL.
 */

import EventBus  from '../core/EventBus.js';
import WebRTCPeer from './WebRTCPeer.js';

// Sur GitHub Pages → Railway; sinon utilise le même hostname que la page
// → fonctionne en localhost ET sur réseau local (192.168.x.x)
const WS_URL = location.hostname === 'benjamindubois1996.github.io'
  ? 'wss://retrovault-multi.up.railway.app'
  : `ws://${location.hostname}:8080`;

/* ── État interne ──────────────────────────────────────────────────────── */

let _ws        = null;
let _status    = 'disconnected';
let _retryN    = 0;
let _retryTid  = null;
let _pingTid   = null;
let _lastPingTs = 0;

let _playerId = null;
let _roomCode = null;
let _latency  = 0;

let _mode     = 'p2p';    // 'relay' | 'p2p'
let _peer     = null;     // WebRTCPeer instance (mode p2p seulement)
let _p2pReady = false;    // DataChannel ouvert

/* ── Connexion WS ──────────────────────────────────────────────────────── */

function connect() {
  if (_ws && _ws.readyState <= WebSocket.OPEN) return;
  _setStatus('connecting');

  try { _ws = new WebSocket(WS_URL); }
  catch { _scheduleRetry(); return; }

  _ws.onopen = () => {
    _retryN = 0;
    _setStatus('connected');
    _startPing();
  };

  _ws.onclose = () => {
    _stopPing();
    _setStatus('disconnected');
    _scheduleRetry();
  };

  _ws.onerror = () => {};

  _ws.onmessage = ({ data }) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    _handleWS(msg);
  };
}

function disconnect() {
  clearTimeout(_retryTid);
  _stopPing();
  _peer?.close();
  _peer     = null;
  _p2pReady = false;
  if (_ws) { _ws.onclose = null; _ws.close(); _ws = null; }
  _setStatus('disconnected');
  _playerId = null;
  _roomCode = null;
}

/* ── API publique ──────────────────────────────────────────────────────── */

function setMode(m) {
  _mode = m === 'relay' ? 'relay' : 'p2p';
}

function createRoom(gameId, nickname) {
  _send({ type: 'room:create', gameId, nickname, connMode: _mode });
}

function joinRoom(code, nickname) {
  _send({ type: 'room:join', code: code.toUpperCase(), nickname, connMode: _mode });
}

function setReady(ready) {
  _send({ type: 'room:ready', ready });
}

function startGame() {
  _send({ type: 'room:start' });
}

// ── Messages de jeu — P2P si disponible, sinon relay WS ────────────────

function sendInput(payload) {
  _sendGame({ type: 'game:input', payload });
}

function sendState(payload) {
  _sendGame({ type: 'game:state', payload });
}

function sendEvent(payload) {
  _sendGame({ type: 'game:event', payload });
}

function sendChat(text) {
  // Chat toujours via WS (même en P2P)
  _send({ type: 'chat:msg', text });
}

/* ── Signaling WebRTC ──────────────────────────────────────────────────── */

async function _startP2PAsHost() {
  if (_mode !== 'p2p') return;
  _peer     = new WebRTCPeer();
  _p2pReady = false;

  EventBus.emit('p2p:signaling');

  try {
    const offer = await _peer.createOffer();
    _send({ type: 'signal:offer', offer });
  } catch (e) {
    console.warn('[P2P] createOffer failed, falling back to relay', e);
    _peer = null;
    EventBus.emit('p2p:fallback');
  }
}

async function _handleSignalOffer(msg) {
  if (_mode !== 'p2p') return;
  _peer     = new WebRTCPeer();
  _p2pReady = false;

  EventBus.emit('p2p:signaling');

  try {
    const answer = await _peer.createAnswer(msg.offer);
    _send({ type: 'signal:answer', answer });
  } catch (e) {
    console.warn('[P2P] createAnswer failed, falling back to relay', e);
    _peer = null;
    EventBus.emit('p2p:fallback');
  }
}

async function _handleSignalAnswer(msg) {
  if (!_peer) return;
  try {
    await _peer.receiveAnswer(msg.answer);
  } catch (e) {
    console.warn('[P2P] receiveAnswer failed', e);
  }
}

/* ── Handlers messages serveur ─────────────────────────────────────────── */

function _handleWS(msg) {
  switch (msg.type) {

    case 'pong':
      _latency = Date.now() - (msg.ts ?? _lastPingTs);
      EventBus.emit('mp:latency', { latency: _latency });
      break;

    case 'room:created':
      _playerId = msg.playerId;
      _roomCode = msg.code;
      EventBus.emit('mp:room-created', msg);
      break;

    case 'room:joined':
      _playerId = msg.playerId;
      _roomCode = msg.code;
      EventBus.emit('mp:room-joined', msg);
      break;

    case 'room:error':
      EventBus.emit('mp:error', msg);
      break;

    case 'room:player-joined':
      // Host initie le WebRTC dès qu'un guest arrive (si mode P2P)
      if (_playerId === 0) _startP2PAsHost();
      EventBus.emit('mp:player-joined', msg);
      break;

    case 'room:player-left':
      if (_peer) { _peer.close(); _peer = null; _p2pReady = false; EventBus.emit('p2p:disconnected'); }
      EventBus.emit('mp:player-left', msg);
      break;

    case 'room:player-ready':
      EventBus.emit('mp:player-ready', msg);
      break;

    case 'room:host-changed':
      EventBus.emit('mp:host-changed', msg);
      break;

    case 'room:started':
      EventBus.emit('mp:game-started', { roomCode: _roomCode, playerId: _playerId, mode: _mode, p2pReady: _p2pReady });
      break;

    // Signaling P2P
    case 'signal:offer':
      _handleSignalOffer(msg);
      break;

    case 'signal:answer':
      _handleSignalAnswer(msg);
      break;

    // Game relay (mode relay ou P2P avant connexion)
    case 'game:input':
    case 'game:state':
    case 'game:event':
      EventBus.emit(`mp:${msg.type.slice(5)}`, msg);
      break;

    case 'chat:msg':
      EventBus.emit('mp:chat', msg);
      break;
  }
}

/* ── Utilitaires ───────────────────────────────────────────────────────── */

function _sendGame(data) {
  // P2P connecté → DataChannel ; sinon WS relay
  if (_mode === 'p2p' && _peer?.isConnected) {
    _peer.send({ ...data, from: _playerId });
  } else {
    _send(data);
  }
}

function _send(data) {
  if (_ws?.readyState === WebSocket.OPEN) _ws.send(JSON.stringify(data));
}

function _setStatus(s) {
  _status = s;
  EventBus.emit('mp:status', { status: s });
}

function _startPing() {
  _pingTid = setInterval(() => {
    _lastPingTs = Date.now();
    _send({ type: 'ping', ts: _lastPingTs });
  }, 5000);
}

function _stopPing() {
  clearInterval(_pingTid);
  _pingTid = null;
}

function _scheduleRetry() {
  if (_retryN >= 8) return;
  const delay = Math.min(1000 * Math.pow(2, _retryN), 30_000);
  _retryN++;
  _retryTid = setTimeout(connect, delay);
  EventBus.emit('mp:retry', { attempt: _retryN, delay });
}

// Réagir aux événements P2P
EventBus.on('p2p:connected',    () => { _p2pReady = true;  EventBus.emit('mp:p2p-status', { ready: true  }); });
EventBus.on('p2p:disconnected', () => { _p2pReady = false; EventBus.emit('mp:p2p-status', { ready: false }); });

/* ── Export ────────────────────────────────────────────────────────────── */

const MultiplayerClient = {
  connect, disconnect, setMode,
  createRoom, joinRoom, setReady, startGame,
  sendInput, sendState, sendEvent, sendChat,
  get status()   { return _status; },
  get playerId() { return _playerId; },
  get roomCode() { return _roomCode; },
  get latency()  { return _latency; },
  get mode()     { return _mode; },
  get p2pReady() { return _p2pReady; },
};

export default MultiplayerClient;
