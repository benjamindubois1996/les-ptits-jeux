/**
 * QRConnect — Signaling WebRTC par QR code (zéro serveur)
 *
 * Compression SDP : seuls les champs essentiels sont extraits
 * (ufrag, pwd, fingerprint, setup, candidats ICE).
 * Le JSON compact (~150-200 chars) donne un QR code lisible en 1 coup.
 *
 * Flux :
 *   1. Hôte   → createOffer()  → compact SDP → QR code → guest scanne
 *   2. Guest  → createAnswer() → compact SDP → QR code → hôte scanne
 *   → P2P DataChannel ouvert, aucun serveur impliqué
 */

import EventBus   from '../core/EventBus.js';
import WebRTCPeer from './WebRTCPeer.js';

const QR_API = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&color=00ffe1&bgcolor=0b1120&margin=8&data=';

let _peer      = null;
let _role      = null;       // 'host' | 'guest'
let _myNick    = 'Joueur';
let _hostNick  = null;
let _guestNick = null;

/* ── URL entrante ────────────────────────────────────────── */

function checkIncoming() {
  const qi = location.hash.indexOf('?');
  if (qi === -1) return null;
  const p   = new URLSearchParams(location.hash.slice(qi + 1));
  const sdp = p.get('sdp');
  if (!sdp) return null;
  history.replaceState(null, '', location.pathname + '#multi');
  return sdp;
}

function peekType(encoded) {
  try {
    const data = _dec(encoded);
    // Format compressé : { sdp: '{"t":0,...}', nick }
    if (typeof data.sdp === 'string' && data.sdp[0] === '{') {
      return JSON.parse(data.sdp).t === 0 ? 'offer' : 'answer';
    }
    // Ancien format : { type: 'offer'|'answer', sdp: RTCDesc, nick }
    if (data.type === 'offer' || data.type === 'answer') return data.type;
    if (data.sdp?.type) return data.sdp.type;
    return null;
  } catch { return null; }
}

function peekNick(encoded) {
  try { return _dec(encoded).nick || null; } catch { return null; }
}

/* ── Hôte : créer l'offre ────────────────────────────────── */

async function startAsHost(nickname) {
  _myNick = nickname || 'Joueur 1';
  _peer   = new WebRTCPeer();
  _role   = 'host';

  EventBus.emit('qr:status', 'generating');

  try {
    const desc    = await _peer.createOffer();
    const payload = _enc({ sdp: _sdpCompress(desc), nick: _myNick });
    const url     = _makeUrl(payload);

    EventBus.emit('qr:offer-ready', {
      qrSrc: QR_API + encodeURIComponent(url),
      url, payload,
    });
  } catch {
    EventBus.emit('qr:error', 'Impossible de créer la connexion WebRTC.');
  }
}

/* ── Guest : recevoir l'offre, créer la réponse ─────────── */

async function startAsGuest(encoded, nickname) {
  _myNick = nickname || 'Joueur 2';
  _peer   = new WebRTCPeer();
  _role   = 'guest';

  EventBus.emit('qr:status', 'answering');

  try {
    const data = _dec(encoded);
    _hostNick  = data.nick || 'Hôte';

    // Compat : nouveau format compressé OU ancien format RTCSessionDescription
    const sdpObj = (typeof data.sdp === 'string' && data.sdp[0] === '{')
      ? _sdpDecompress(data.sdp)
      : (data.sdp ?? data);  // ancien format : sdp = RTCDesc object ou l'objet lui-même

    const desc    = await _peer.createAnswer(sdpObj);
    const payload = _enc({ sdp: _sdpCompress(desc), nick: _myNick });
    const url     = _makeUrl(payload);

    EventBus.emit('qr:answer-ready', {
      qrSrc: QR_API + encodeURIComponent(url),
      url, payload,
      hostNick: _hostNick,
    });
  } catch (e) {
    EventBus.emit('qr:error', 'Impossible de répondre à la connexion WebRTC.');
    console.error('[QRConnect] startAsGuest error', e);
  }
}

/* ── Hôte : recevoir la réponse du guest ─────────────────── */

async function receiveAnswer(encoded) {
  if (_role !== 'host' || !_peer) return;

  try {
    const data = _dec(encoded);
    _guestNick  = data.nick || 'Joueur 2';

    const sdpObj = (typeof data.sdp === 'string' && data.sdp[0] === '{')
      ? _sdpDecompress(data.sdp)
      : (data.sdp ?? data);

    await _peer.receiveAnswer(sdpObj);
    EventBus.emit('qr:guest-nick', _guestNick);
  } catch (e) {
    EventBus.emit('qr:error', 'Réponse invalide ou expirée.');
    console.error('[QRConnect] receiveAnswer error', e);
  }
}

/* ── DataChannel ─────────────────────────────────────────── */

function send(type, data = {}) {
  return _peer?.send({ type, ...data, from: _role === 'host' ? 0 : 1 }) ?? false;
}

/* ── Getters ─────────────────────────────────────────────── */

const getRole      = () => _role;
const getMyNick    = () => _myNick;
const getHostNick  = () => _hostNick;
const getGuestNick = () => _guestNick;
const isConnected  = () => _peer?.isConnected ?? false;

/* ── Fermeture ───────────────────────────────────────────── */

function close() {
  _peer?.close();
  _peer = _role = _hostNick = _guestNick = null;
}

/* ── SDP Compression ─────────────────────────────────────── */
/*
 * On extrait uniquement les champs nécessaires au handshake :
 *   u = ice-ufrag, p = ice-pwd, f = fingerprint (hex sans ":"),
 *   s = setup (0=actpass,1=active,2=passive), c = candidats ICE
 * Résultat : ~150-200 chars JSON → QR code de densité faible.
 */

function _sdpCompress(sdpObj) {
  const lines = sdpObj.sdp.split(/\r?\n/);
  const find  = prefix => { const l = lines.find(l => l.startsWith(prefix)); return l ? l.slice(prefix.length).trim() : ''; };

  const ufrag = find('a=ice-ufrag:');
  const pwd   = find('a=ice-pwd:');
  const fp    = find('a=fingerprint:sha-256 ').replace(/:/g, '');
  const setup = find('a=setup:');

  const cands = lines
    .filter(l => l.startsWith('a=candidate:'))
    .map(l => {
      const m = l.match(/a=candidate:\S+ 1 (?:UDP|udp) \d+ (\S+) (\d+) typ (\w+)(?:.*?raddr (\S+) rport (\d+))?/i);
      if (!m) return null;
      const [, ip, port, typ, raddr, rport] = m;
      const c = { i: ip, p: +port, t: typ === 'host' ? 0 : 1 };
      if (raddr) { c.ri = raddr; c.rp = +rport; }
      return c;
    })
    .filter(Boolean);

  return JSON.stringify({
    t: sdpObj.type === 'offer' ? 0 : 1,
    u: ufrag,
    p: pwd,
    f: fp,
    s: ({ actpass: 0, active: 1, passive: 2 }[setup] ?? 0),
    c: cands,
  });
}

function _sdpDecompress(compact) {
  const d     = JSON.parse(compact);
  const type  = d.t === 0 ? 'offer' : 'answer';
  const setup = ['actpass', 'active', 'passive'][d.s] ?? 'actpass';
  const fp    = (d.f.match(/.{2}/g) ?? [d.f]).join(':');

  const candLines = (d.c ?? []).map(c => {
    const typ  = c.t === 0 ? 'host' : 'srflx';
    const prio = c.t === 0 ? 2122260223 : 1686052607;
    let line = `a=candidate:0 1 udp ${prio} ${c.i} ${c.p} typ ${typ} generation 0`;
    if (c.t === 1 && c.ri) line += ` raddr ${c.ri} rport ${c.rp ?? 0}`;
    return line;
  }).join('\r\n');

  const sdp = [
    'v=0',
    'o=- 5498186952990133409 2 IN IP4 127.0.0.1',
    's=-',
    't=0 0',
    'a=group:BUNDLE 0',
    'a=extmap-allow-mixed',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    'c=IN IP4 0.0.0.0',
    `a=ice-ufrag:${d.u}`,
    `a=ice-pwd:${d.p}`,
    'a=ice-options:trickle',
    `a=fingerprint:sha-256 ${fp}`,
    `a=setup:${setup}`,
    'a=mid:0',
    'a=sctp-port:5000',
    'a=max-message-size:262144',
    candLines,
    'a=end-of-candidates',
    '',
  ].join('\r\n');

  return { type, sdp };
}

/* ── Helpers ─────────────────────────────────────────────── */

function _makeUrl(payload) {
  return `${location.origin}${location.pathname}#multi?sdp=${payload}`;
}

function _enc(obj) {
  return btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function _dec(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad  = b64.length % 4;
  return JSON.parse(atob(pad ? b64 + '='.repeat(4 - pad) : b64));
}

/* ── Export ──────────────────────────────────────────────── */

export default {
  checkIncoming, peekType, peekNick,
  startAsHost, startAsGuest, receiveAnswer,
  send, close,
  getRole, getMyNick, getHostNick, getGuestNick, isConnected,
};
