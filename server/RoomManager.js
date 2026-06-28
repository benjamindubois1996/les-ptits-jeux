'use strict';

const ROOM_TTL_MS  = 30 * 60 * 1000; // 30 min
const MAX_PLAYERS  = 4;
// chars sans ambiguïté visuelle (pas 0/O, 1/I/L)
const CODE_CHARS   = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

class RoomManager {
  constructor() {
    this._rooms = new Map(); // code → room
    setInterval(() => this._cleanup(), 5 * 60 * 1000);
  }

  /* ── Créer ──────────────────────────────────────── */

  create(gameId, ws) {
    const code     = this._genCode();
    const playerId = 0;
    const room = {
      code, gameId,
      created:      Date.now(),
      lastActivity: Date.now(),
      players: new Map([[
        playerId,
        { ws, id: playerId, nickname: ws.nickname, ready: false, host: true }
      ]])
    };
    this._rooms.set(code, room);
    return { code, playerId };
  }

  /* ── Rejoindre ──────────────────────────────────── */

  join(code, ws) {
    const room = this._rooms.get(code);
    if (!room)                         return { ok: false, reason: 'room_not_found' };
    if (room.players.size >= MAX_PLAYERS) return { ok: false, reason: 'room_full' };

    const playerId = this._nextId(room);
    room.players.set(playerId, { ws, id: playerId, nickname: ws.nickname, ready: false, host: false });
    room.lastActivity = Date.now();
    return { ok: true, playerId, gameId: room.gameId };
  }

  /* ── Retirer ────────────────────────────────────── */

  removePlayer(code, playerId, callback) {
    const room = this._rooms.get(code);
    if (!room) return;

    room.players.delete(playerId);

    if (room.players.size === 0) {
      this._rooms.delete(code);
      callback([], null);
      return;
    }

    // Réassigner le host si nécessaire
    const hasHost = Array.from(room.players.values()).some(p => p.host);
    if (!hasHost) {
      room.players.values().next().value.host = true;
    }

    callback(this.getWs(code), room);
  }

  /* ── Prêt ───────────────────────────────────────── */

  setReady(code, playerId, ready) {
    const room = this._rooms.get(code);
    if (!room || !room.players.has(playerId)) return;
    room.players.get(playerId).ready = ready;
    room.lastActivity = Date.now();
  }

  /* ── Helpers ────────────────────────────────────── */

  isHost(code, playerId) {
    const room = this._rooms.get(code);
    return room?.players.get(playerId)?.host === true;
  }

  getPlayers(code) {
    const room = this._rooms.get(code);
    if (!room) return [];
    return Array.from(room.players.values()).map(({ id, nickname, ready, host }) => ({ id, nickname, ready, host }));
  }

  getWs(code) {
    const room = this._rooms.get(code);
    if (!room) return [];
    return Array.from(room.players.values()).map(p => p.ws);
  }

  getOtherWs(code, playerId) {
    const room = this._rooms.get(code);
    if (!room) return [];
    return Array.from(room.players.values()).filter(p => p.id !== playerId).map(p => p.ws);
  }

  getNickname(code, playerId) {
    return this._rooms.get(code)?.players.get(playerId)?.nickname ?? 'Joueur';
  }

  /* ── Interne ────────────────────────────────────── */

  _genCode() {
    let code;
    do {
      code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    } while (this._rooms.has(code));
    return code;
  }

  _nextId(room) {
    let id = 0;
    while (room.players.has(id)) id++;
    return id;
  }

  _cleanup() {
    const cutoff = Date.now() - ROOM_TTL_MS;
    for (const [code, room] of this._rooms) {
      if (room.lastActivity < cutoff) this._rooms.delete(code);
    }
  }
}

module.exports = { RoomManager };
