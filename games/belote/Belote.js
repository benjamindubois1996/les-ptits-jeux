import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import CardDeck     from '../../js/utils/CardDeck.js';

// ─── Valeurs Belote ──────────────────────────────────────────────────────────
// 32 cartes (7→As), joueur(0)+partenaire(2) vs IA1(1)+IA3(3)
// Équipes : {0,2} vs {1,3}

const RANKS32 = ['7','8','9','10','J','Q','K','A'];

function cardValue(rank, isAtout) {
  if (isAtout) {
    const v = { 'J':20,'9':14,'A':11,'10':10,'K':4,'Q':3,'8':0,'7':0 };
    return v[rank] ?? 0;
  }
  const v = { 'A':11,'10':10,'K':4,'Q':3,'J':2,'9':0,'8':0,'7':0 };
  return v[rank] ?? 0;
}

function rankStrength(rank, isAtout) {
  // Force pour comparaison dans un pli
  if (isAtout) {
    const s = { 'J':8,'9':7,'A':6,'10':5,'K':4,'Q':3,'8':2,'7':1 };
    return s[rank] ?? 0;
  }
  const s = { 'A':8,'10':7,'K':6,'Q':5,'J':4,'9':3,'8':2,'7':1 };
  return s[rank] ?? 0;
}

function teamOf(player) { return player % 2; } // 0 = {0,2}, 1 = {1,3}

// ─── IA ──────────────────────────────────────────────────────────────────────

function aiChooseCard(hand, trick, leadSuit, atout, playerPos, leadPlayer) {
  const isLeading = playerPos === leadPlayer;

  if (isLeading) {
    // Mener : jouer un atout si possible, sinon carte haute non-atout
    const atouts = hand.filter(c => c.suit === atout);
    if (atouts.length > 0) {
      return atouts.sort((a, b) => rankStrength(b.rank, true) - rankStrength(a.rank, true))[0];
    }
    return hand.sort((a, b) => rankStrength(b.rank, false) - rankStrength(a.rank, false))[0];
  }

  // Suivre la couleur menée
  const inLead = hand.filter(c => c.suit === leadSuit);
  if (inLead.length > 0) {
    // Tenter de prendre si ça vaut le coup
    const trickWinner = _trickWinner(trick, leadSuit, atout);
    const winnerTeam  = trickWinner !== null ? teamOf(trickWinner) : -1;
    const myTeam      = teamOf(playerPos);

    if (winnerTeam === myTeam) {
      // Partenaire gagne : jouer le plus bas
      return inLead.sort((a, b) => rankStrength(a.rank, a.suit === atout) - rankStrength(b.rank, b.suit === atout))[0];
    }
    // Essayer de surpasser
    const bestInTrick = _bestCardInTrick(trick, leadSuit, atout);
    const canWin = inLead.filter(c => rankStrength(c.rank, c.suit === atout) > rankStrength(bestInTrick.rank, bestInTrick.suit === atout));
    return canWin.length > 0
      ? canWin.sort((a, b) => rankStrength(a.rank, a.suit === atout) - rankStrength(b.rank, b.suit === atout))[0]
      : inLead.sort((a, b) => rankStrength(a.rank, a.suit === atout) - rankStrength(b.rank, b.suit === atout))[0];
  }

  // Pas la couleur menée : atout si adverse gagne
  const trickWinner = _trickWinner(trick, leadSuit, atout);
  if (trickWinner !== null && teamOf(trickWinner) !== teamOf(playerPos)) {
    const myAtouts = hand.filter(c => c.suit === atout);
    if (myAtouts.length > 0) {
      return myAtouts.sort((a, b) => rankStrength(a.rank, true) - rankStrength(b.rank, true))[0];
    }
  }

  // Défausser : carte la moins précieuse
  return hand.sort((a, b) => cardValue(a.rank, a.suit === atout) - cardValue(b.rank, b.suit === atout))[0];
}

function _trickWinner(trick, leadSuit, atout) {
  let winner = null, bestStr = -1;
  trick.forEach((card, pos) => {
    if (!card) return;
    const isAtout = card.suit === atout;
    if (card.suit !== leadSuit && !isAtout) return;
    const str = rankStrength(card.rank, isAtout);
    if (winner === null || (isAtout && trick[winner]?.suit !== atout) || str > bestStr) {
      // Atout > couleur menée
      if (!isAtout && trick[winner]?.suit === atout) return;
      winner = pos; bestStr = str;
    }
  });
  return winner;
}

function _bestCardInTrick(trick, leadSuit, atout) {
  const winner = _trickWinner(trick, leadSuit, atout);
  return winner !== null ? trick[winner] : null;
}

// ─── Belote ──────────────────────────────────────────────────────────────────

export default class Belote extends BaseGame {
  constructor(config) {
    super(config);
    this.state  = null;
    this._aiTid = null;
  }

  _gameId() { return 'belote'; }

  async init() {
    this._setupEventBusBindings();
    this.state = this._buildFullState();
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  _buildFullState() {
    return {
      status:       'idle',
      hands:        [[], [], [], []],  // [joueur, IA-Est, partenaire-IA, IA-Ouest]
      trick:        [null, null, null, null],
      trickCount:   0,
      leadPlayer:   0,
      currentPlayer:0,
      atout:        null,        // '♠'|'♥'|'♦'|'♣'
      atoutLabel:   '',
      scores:       [0, 0],      // [équipe0 (joueur+part), équipe1 (IA×2)]
      roundScores:  [0, 0],      // points ce round
      round:        1,
      maxRounds:    4,
      lastTrick:    null,
      message:      '',
      names:        ['Vous', 'Est', 'Nord (part.)', 'Ouest'],
      trickResults: [],
    };
  }

  start() {
    this.state.status = 'playing';
    this._dealRound();
    EventBus.emit('game:tick', { state: this.state, action: 'play' });
    if (this.state.currentPlayer !== 0) this._scheduleAI(700);
  }

  _dealRound() {
    const s = this.state;
    const deck = CardDeck.shuffle(CardDeck.create32());
    s.hands = [[], [], [], []];
    deck.forEach((c, i) => {
      c.faceUp = i % 4 === 0; // seulement main du joueur visible au départ
      s.hands[i % 4].push(c);
    });
    s.hands[0].forEach(c => c.faceUp = true);

    // Atout aléatoire
    const suits = ['♠', '♥', '♦', '♣'];
    const suitNames = { '♠':'Pique','♥':'Cœur','♦':'Carreau','♣':'Trèfle' };
    s.atout      = suits[Math.floor(Math.random() * 4)];
    s.atoutLabel = suitNames[s.atout];

    s.trick       = [null, null, null, null];
    s.trickCount  = 0;
    s.roundScores = [0, 0];
    s.leadPlayer  = 0;
    s.currentPlayer = 0;
    s.trickResults = [];
    s.lastTrick   = null;
    s.message = `Round ${s.round} — Atout : ${s.atout} (${s.atoutLabel}) · À vous de jouer !`;
  }

  playCard(cardIdx) {
    const s = this.state;
    if (s.status !== 'playing' || s.currentPlayer !== 0) return;
    const card = s.hands[0][cardIdx];
    if (!card || !this._isLegal(0, card)) return;
    this._doPlay(0, card, cardIdx);
  }

  _isLegal(player, card) {
    const s = this.state;
    const hand = s.hands[player];
    const leadSuit = s.trick[s.leadPlayer]?.suit;

    if (player === s.leadPlayer) return true; // meneur peut jouer n'importe quoi

    if (!leadSuit) return true;

    // Doit suivre la couleur
    if (card.suit !== leadSuit && card.suit !== s.atout) {
      // Vérifier qu'on n'a pas la couleur
      if (hand.some(c => c.suit === leadSuit)) return false;
      // Vérifier qu'on n'a pas d'atout (obligatoire de couper)
      if (hand.some(c => c.suit === s.atout)) return false;
    }
    if (card.suit !== leadSuit && hand.some(c => c.suit === leadSuit)) return false;

    // Montée obligatoire en atout
    if (card.suit === s.atout && leadSuit !== s.atout) {
      // Vérification simplifiée : on peut toujours couper
    }
    return true;
  }

  _doPlay(player, card, cardIdx) {
    const s = this.state;
    card.faceUp = true;
    s.trick[player] = card;
    s.hands[player].splice(cardIdx, 1);

    const nextPlayer = (player + 1) % 4;
    if (s.trick.every(c => c !== null)) {
      this._resolveTrick();
    } else {
      s.currentPlayer = nextPlayer;
      s.message = `${s.names[nextPlayer]} joue...`;
      EventBus.emit('game:tick', { state: s });
      if (nextPlayer !== 0) this._scheduleAI(600);
    }
  }

  _resolveTrick() {
    const s = this.state;
    const leadSuit = s.trick[s.leadPlayer].suit;

    // Trouver le gagnant
    const winner = _trickWinner(s.trick, leadSuit, s.atout);
    const w = winner ?? s.leadPlayer;

    // Points du pli
    const pts = s.trick.reduce((sum, c) => sum + cardValue(c.rank, c.suit === s.atout), 0);
    const team = teamOf(w);
    s.roundScores[team] += pts;
    s.trickResults.push({ winner: w, pts, cards: [...s.trick] });

    s.trickCount++;
    const prevTrick = [...s.trick];
    s.lastTrick = { cards: prevTrick, winner: w };
    s.trick = [null, null, null, null];
    s.message = `${s.names[w]} remporte le pli (${pts} pts)`;

    EventBus.emit('game:tick', { state: s });

    if (s.trickCount === 8) {
      // Bonus dernier pli : 10 pts à l'équipe gagnante
      s.roundScores[team] += 10;
      setTimeout(() => this._endRound(), 1200);
    } else {
      s.leadPlayer = w;
      s.currentPlayer = w;
      setTimeout(() => {
        EventBus.emit('game:tick', { state: s });
        if (w !== 0) this._scheduleAI(700);
      }, 1200);
    }
  }

  _endRound() {
    const s = this.state;

    // L'équipe avec le contrat (>= 82 pts) gagne le round → +1 point de match
    // Sinon l'adversaire marque 162
    const totalPts = s.roundScores[0] + s.roundScores[1]; // devrait être 162
    if (s.roundScores[0] >= 82) {
      s.scores[0] += s.roundScores[0];
    } else {
      // Capot inversé : adversaire prend tout
      s.scores[1] += 162;
    }
    // (On cumule les points bruts, celui avec le plus à la fin gagne)

    ScoreService.update(s.scores[0]);
    s.message = `Round terminé — Éq.Vous: ${s.roundScores[0]} · Éq.IA: ${s.roundScores[1]}`;
    EventBus.emit('game:tick', { state: s });

    if (s.round >= s.maxRounds) {
      setTimeout(() => {
        s.status = s.scores[0] > s.scores[1] ? 'won' : 'over';
        EventBus.emit('game:tick', { state: s });
        if (s.status === 'won') EventBus.emit('game:won', { score: s.scores[0] });
        else                    EventBus.emit('game:over', { score: s.scores[0] });
      }, 2000);
      return;
    }

    s.round++;
    setTimeout(() => {
      if (s.status === 'playing') {
        this._dealRound();
        EventBus.emit('game:tick', { state: s });
        if (s.currentPlayer !== 0) this._scheduleAI(700);
      }
    }, 2500);
  }

  _scheduleAI(ms) {
    if (this._aiTid) clearTimeout(this._aiTid);
    this._aiTid = setTimeout(() => {
      this._aiTid = null;
      if (this.state?.status === 'playing' && this.state.currentPlayer !== 0) this._aiPlay();
    }, ms);
  }

  _aiPlay() {
    const s = this.state;
    const p = s.currentPlayer;
    if (p === 0 || s.hands[p].length === 0) return;

    s.hands[p].forEach(c => c.faceUp = true);
    const leadSuit = s.trick[s.leadPlayer]?.suit;
    const card = aiChooseCard(s.hands[p], s.trick, leadSuit, s.atout, p, s.leadPlayer);
    const idx = s.hands[p].indexOf(card);
    if (idx === -1) return;
    this._doPlay(p, card, idx);
  }

  restart() {
    if (this._aiTid) { clearTimeout(this._aiTid); this._aiTid = null; }
    this.state = this._buildFullState();
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  destroy() {
    if (this._aiTid) { clearTimeout(this._aiTid); this._aiTid = null; }
    super.destroy();
  }
}
