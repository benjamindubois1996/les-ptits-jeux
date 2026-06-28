/**
 * WebRTCPeer — Connexion P2P via WebRTC natif (zéro dépendance)
 *
 * Utilise RTCPeerConnection + RTCDataChannel, APIs natives du navigateur.
 * Stratégie "ICE complet avant envoi" : le SDP envoyé contient déjà tous
 * les candidats → signaling en 2 messages seulement (offer + answer).
 *
 * Deux rôles :
 *   Host  → createOffer()  → reçoit answer via receiveAnswer()
 *   Guest → createAnswer() → renvoie le résultat au host
 */

import EventBus from '../core/EventBus.js';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

// UDP-like : pas de retransmission, ordre non garanti
// → latence minimale pour les inputs de jeu
const CHANNEL_CFG = { ordered: false, maxRetransmits: 0 };

// Timeout ICE : sur WiFi local < 500ms, sur internet < 2s
const ICE_TIMEOUT_MS = 4000;

export default class WebRTCPeer {
  constructor() {
    this._pc        = null;
    this._channel   = null;
    this._state     = 'idle'; // idle | signaling | connected | closed
    this._emitted   = false;  // garde : p2p:connected émis une seule fois
  }

  /* ── Host : créer l'offre ──────────────────────────────── */

  async createOffer() {
    this._build();
    this._channel = this._pc.createDataChannel('rv-game', CHANNEL_CFG);
    this._hookChannel();

    const offer = await this._pc.createOffer();
    await this._pc.setLocalDescription(offer);
    await this._waitIce();

    this._state = 'signaling';
    return this._pc.localDescription;
  }

  /* ── Guest : répondre à l'offre ───────────────────────── */

  async createAnswer(offerSdp) {
    this._build();

    this._pc.ondatachannel = (e) => {
      this._channel = e.channel;
      this._hookChannel();
    };

    await this._pc.setRemoteDescription(new RTCSessionDescription(offerSdp));
    const answer = await this._pc.createAnswer();
    await this._pc.setLocalDescription(answer);
    await this._waitIce();

    this._state = 'signaling';
    return this._pc.localDescription;
  }

  /* ── Host : recevoir la réponse du guest ───────────────── */

  async receiveAnswer(answerSdp) {
    await this._pc.setRemoteDescription(new RTCSessionDescription(answerSdp));
  }

  /* ── Envoi de données (DataChannel) ────────────────────── */

  send(data) {
    if (this._channel?.readyState === 'open') {
      this._channel.send(JSON.stringify(data));
      return true;
    }
    return false;
  }

  /* ── Fermeture ─────────────────────────────────────────── */

  close() {
    try { this._channel?.close(); } catch {}
    try { this._pc?.close();      } catch {}
    this._channel = null;
    this._pc      = null;
    this._state   = 'closed';
  }

  /* ── Getters ───────────────────────────────────────────── */

  get state()       { return this._state; }
  get isConnected() { return this._state === 'connected'; }

  /* ── Privé ─────────────────────────────────────────────── */

  _build() {
    this._pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    this._pc.onconnectionstatechange = () => {
      const s = this._pc?.connectionState;
      if (s === 'connected') this._emitConnected();
      if (s === 'disconnected' || s === 'failed' || s === 'closed') {
        this._state = 'closed';
        EventBus.emit('p2p:disconnected');
      }
    };
  }

  _emitConnected() {
    if (this._emitted) return;
    this._emitted = true;
    this._state   = 'connected';
    EventBus.emit('p2p:connected');
  }

  _hookChannel() {
    this._channel.onopen = () => this._emitConnected();

    this._channel.onclose = () => {
      if (this._state !== 'closed') {
        this._state = 'closed';
        EventBus.emit('p2p:disconnected');
      }
    };

    this._channel.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      // Injecter dans le même bus qu'un message serveur
      if (msg?.type) EventBus.emit(`mp:${msg.type}`, msg);
    };
  }

  _waitIce() {
    return new Promise(resolve => {
      if (this._pc.iceGatheringState === 'complete') { resolve(); return; }
      const done = () => {
        if (this._pc?.iceGatheringState === 'complete') {
          this._pc.removeEventListener('icegatheringstatechange', done);
          resolve();
        }
      };
      this._pc.addEventListener('icegatheringstatechange', done);
      setTimeout(resolve, ICE_TIMEOUT_MS); // sécurité
    });
  }
}
