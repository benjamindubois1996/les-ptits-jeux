'use strict';

/**
 * RetroVault — Serveur WebSocket Multijoueur
 *
 * Déploiement Railway :
 *   1. Créer un service Railway depuis ce dépôt GitHub
 *   2. Root Directory → "server"
 *   3. Start Command → "node index.js"
 *   4. Copier l'URL Railway (ex: retrovault-multi.up.railway.app)
 *   5. Mettre à jour WS_URL dans js/multiplayer/MultiplayerClient.js
 */

const WebSocket    = require('ws');
const { RoomManager } = require('./RoomManager');
const { RateLimiter } = require('./RateLimiter');

const PORT = process.env.PORT || 8080;

// Origins explicitement autorisées
const ALLOWED = new Set([
  'https://benjamindubois1996.github.io',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

// Autorise aussi les IPs réseau local (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
function isLocalNetwork(origin) {
  if (!origin) return true; // connexion directe sans origin = local
  try {
    const ip = new URL(origin).hostname;
    return /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
  } catch { return false; }
}

const wss     = new WebSocket.Server({ port: PORT, clientTracking: true });
const rooms   = new RoomManager();
const limiter = new RateLimiter(60, 1000); // 60 msg/s max

/* ── Connexion ─────────────────────────────────────────── */

wss.on('connection', (ws, req) => {
  const origin = req.headers.origin;

  if (origin && !ALLOWED.has(origin) && !isLocalNetwork(origin)) {
    ws.close(1008, 'Origin non autorisée');
    return;
  }

  ws.isAlive  = true;
  ws.nickname = 'Joueur';
  ws.playerId = null;
  ws.roomCode = null;

  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    if (raw.length > 4096) return; // message trop grand
    if (!limiter.allow(ws)) { ws.close(1008, 'Rate limit'); return; }

    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg.type !== 'string') return;

    handle(ws, msg);
  });

  ws.on('close', () => {
    limiter.remove(ws);
    if (!ws.roomCode) return;

    const code = ws.roomCode;
    const pid  = ws.playerId;

    rooms.removePlayer(code, pid, (others, room) => {
      if (others.length > 0) {
        broadcast(others, { type: 'room:player-left', playerId: pid });
        // Informer du nouveau host si changé
        if (room) {
          const newHost = rooms.getPlayers(code).find(p => p.host);
          if (newHost) broadcast(others, { type: 'room:host-changed', playerId: newHost.id });
        }
      }
    });
  });

  ws.on('error', () => {});
});

/* ── Heartbeat (détecte les connexions mortes) ─────────── */

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 25_000);

wss.on('close', () => clearInterval(heartbeat));

/* ── Routage des messages ──────────────────────────────── */

function handle(ws, msg) {
  switch (msg.type) {

    case 'room:create': {
      const gameId   = sanitize(msg.gameId, 32);
      const nickname = sanitize(msg.nickname, 24) || 'Joueur';
      if (!gameId) return;

      ws.nickname = nickname;
      const { code, playerId } = rooms.create(gameId, ws);
      ws.playerId = playerId;
      ws.roomCode = code;

      send(ws, { type: 'room:created', code, playerId, gameId, players: rooms.getPlayers(code) });
      break;
    }

    case 'room:join': {
      const code     = sanitize(msg.code, 4)?.toUpperCase();
      const nickname = sanitize(msg.nickname, 24) || 'Joueur';
      if (!code || code.length !== 4) return;

      ws.nickname = nickname;
      const result = rooms.join(code, ws);

      if (!result.ok) {
        send(ws, { type: 'room:error', reason: result.reason });
        return;
      }

      ws.playerId = result.playerId;
      ws.roomCode = code;

      send(ws, { type: 'room:joined', code, playerId: result.playerId, gameId: result.gameId, players: rooms.getPlayers(code) });
      broadcast(rooms.getOtherWs(code, result.playerId), {
        type: 'room:player-joined',
        player: { id: result.playerId, nickname, ready: false, host: false }
      });
      break;
    }

    case 'room:ready': {
      if (!ws.roomCode) return;
      const ready = !!msg.ready;
      rooms.setReady(ws.roomCode, ws.playerId, ready);
      broadcast(rooms.getWs(ws.roomCode), { type: 'room:player-ready', playerId: ws.playerId, ready });
      break;
    }

    case 'room:start': {
      if (!ws.roomCode) return;
      if (!rooms.isHost(ws.roomCode, ws.playerId)) return;
      broadcast(rooms.getWs(ws.roomCode), { type: 'room:started', roomCode: ws.roomCode });
      break;
    }

    // Relay transparent : game:input, game:state, game:event
    case 'game:input':
    case 'game:state':
    case 'game:event': {
      if (!ws.roomCode) return;
      broadcast(rooms.getOtherWs(ws.roomCode, ws.playerId), { ...msg, from: ws.playerId });
      break;
    }

    // Signaling WebRTC P2P — relay vers les autres membres de la room
    // (offer = SDP complet avec ICE embarqués → 2 messages suffisent)
    case 'signal:offer':
    case 'signal:answer': {
      if (!ws.roomCode) return;
      broadcast(rooms.getOtherWs(ws.roomCode, ws.playerId), { ...msg, from: ws.playerId });
      break;
    }

    case 'chat:msg': {
      if (!ws.roomCode) return;
      const text = sanitize(msg.text, 200);
      if (!text) return;
      broadcast(rooms.getWs(ws.roomCode), {
        type: 'chat:msg',
        from:     ws.playerId,
        nickname: ws.nickname,
        text,
        ts:       Date.now()
      });
      break;
    }

    case 'ping':
      send(ws, { type: 'pong', ts: msg.ts });
      break;
  }
}

/* ── Utilitaires ───────────────────────────────────────── */

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

function broadcast(clients, data) {
  const str = JSON.stringify(data);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(str);
  }
}

function sanitize(val, maxLen = 64) {
  if (!val || typeof val !== 'string') return '';
  return val.replace(/[<>&"'`]/g, '').trim().slice(0, maxLen);
}

console.log(`[RetroVault Multi] 🚀 Serveur WS démarré — port ${PORT}`);
