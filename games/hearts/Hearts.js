import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import CardDeck     from '../../js/utils/CardDeck.js';

// Positions: 0=Sud (joueur), 1=Est (IA), 2=Nord (IA), 3=Ouest (IA)

function cardPts(card) {
  if (card.suit === '♥') return 1;
  if (card.suit === '♠' && card.rank === 'Q') return 13;
  return 0;
}

function rankOrder(rank) {
  const o = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };
  return o[rank] ?? 0;
}

function aiChooseCard(hand, trick, leadSuit, heartsBroken, isLeading) {
  // Filtrer par couleur maîtresse si possible
  const inSuit = hand.filter(c => c.suit === leadSuit);

  if (isLeading) {
    // Ne pas mener cœurs sauf si brisés ou que cœurs
    const nonHeart = hand.filter(c => c.suit !== '♥' && !(c.suit === '♠' && c.rank === 'Q'));
    if (!heartsBroken && nonHeart.length > 0) {
      // Jouer la carte non-cœur la plus basse
      return nonHeart.sort((a, b) => rankOrder(a.rank) - rankOrder(b.rank))[0];
    }
    return hand.sort((a, b) => rankOrder(a.rank) - rankOrder(b.rank))[0];
  }

  const pool = inSuit.length > 0 ? inSuit : hand;

  // Cherche si quelqu'un va gagner le pli (carte la plus haute dans la couleur maîtresse)
  const trickInSuit = trick.filter(c => c && c.suit === leadSuit);
  const highInTrick = trickInSuit.length > 0
    ? Math.max(...trickInSuit.map(c => rankOrder(c.rank)))
    : 0;

  if (inSuit.length > 0) {
    // Suit : jouer plus haut que le maître seulement si pas de points dans le pli
    const trickPts = trick.reduce((s, c) => s + (c ? cardPts(c) : 0), 0);
    if (trickPts === 0) {
      // Pas de points — jouer la plus haute en dessous du maître ou la plus basse
      const lower = inSuit.filter(c => rankOrder(c.rank) < highInTrick);
      if (lower.length > 0) return lower.sort((a, b) => rankOrder(b.rank) - rankOrder(a.rank))[0];
      return inSuit.sort((a, b) => rankOrder(a.rank) - rankOrder(b.rank))[0];
    }
    // Il y a des points — jouer sous le maître ou le plus bas
    const lower = inSuit.filter(c => rankOrder(c.rank) < highInTrick);
    return lower.length > 0
      ? lower.sort((a, b) => rankOrder(b.rank) - rankOrder(a.rank))[0]
      : inSuit.sort((a, b) => rankOrder(a.rank) - rankOrder(b.rank))[0];
  }

  // Défausser : se débarrasser des cartes à points
  const queenSpade = pool.find(c => c.suit === '♠' && c.rank === 'Q');
  if (queenSpade) return queenSpade;
  const hearts = pool.filter(c => c.suit === '♥').sort((a, b) => rankOrder(b.rank) - rankOrder(a.rank));
  if (hearts.length > 0) return hearts[0];
  return pool.sort((a, b) => rankOrder(b.rank) - rankOrder(a.rank))[0];
}

export default class Hearts extends BaseGame {
  constructor(config) {
    super(config);
    this.state  = null;
    this._aiTid = null;
  }

  _gameId() { return 'hearts'; }

  async init() {
    this._setupEventBusBindings();
    this.state = this._buildFullState();
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  _buildFullState() {
    return {
      status:       'idle',
      hands:        [[], [], [], []],
      trick:        [null, null, null, null],
      trickCount:   0,
      leadPlayer:   0,
      currentPlayer:0,
      heartsBroken: false,
      scores:       [0, 0, 0, 0],     // scores cumulés
      roundScores:  [0, 0, 0, 0],     // points pris ce round
      round:        1,
      maxScore:     100,               // jeu se termine quand un joueur atteint 100
      lastTrickWinner: null,
      trickResults: [],                // historique des plis du round
      message:      '',
      phase:        'trick',           // 'trick' | 'roundEnd' | 'over'
      names:        ['Vous', 'Est', 'Nord', 'Ouest'],
    };
  }

  start() {
    this.state.status = 'playing';
    this._dealRound();
    EventBus.emit('game:tick', { state: this.state, action: 'play' });
    if (this.state.currentPlayer !== 0) this._scheduleAI(800);
  }

  _dealRound() {
    const s = this.state;
    const deck = CardDeck.shuffle(CardDeck.create());
    s.hands = [[], [], [], []];
    s.trick = [null, null, null, null];
    s.roundScores = [0, 0, 0, 0];
    s.heartsBroken = false;
    s.trickCount = 0;
    s.trickResults = [];
    s.lastTrickWinner = null;

    // 52 cartes / 4 joueurs = 13 chacun
    deck.forEach((c, i) => {
      c.faceUp = true;
      s.hands[i % 4].push(c);
    });

    // Trouver qui a le 2 de trèfle → il mène
    let leader = 0;
    for (let p = 0; p < 4; p++) {
      if (s.hands[p].some(c => c.suit === '♣' && c.rank === '2')) { leader = p; break; }
    }
    s.leadPlayer = leader;
    s.currentPlayer = leader;
    s.message = `Round ${s.round} — ${s.names[leader]} ouvre avec le 2♣`;
  }

  playCard(cardIdx) {
    const s = this.state;
    if (s.status !== 'playing' || s.currentPlayer !== 0 || s.phase !== 'trick') return;
    const card = s.hands[0][cardIdx];
    if (!card) return;

    // Valider légalité
    if (!this._isLegal(0, card)) return;

    this._doPlay(0, card, cardIdx);
  }

  _isLegal(player, card) {
    const s = this.state;
    const hand = s.hands[player];

    // Premier pli : le 2 de trèfle est obligatoire pour le meneur
    if (s.trickCount === 0 && player === s.leadPlayer) {
      return card.suit === '♣' && card.rank === '2';
    }

    // Si meneur : pas de cœur sauf si brisé ou que des cœurs
    if (player === s.leadPlayer) {
      if (card.suit === '♥' && !s.heartsBroken) {
        const hasNonHeart = hand.some(c => c.suit !== '♥');
        return !hasNonHeart;
      }
      return true;
    }

    // Suit : must follow suit if possible
    const leadSuit = s.trick.find(c => c !== null)?.suit;
    if (!leadSuit) return true;
    const inSuit = hand.filter(c => c.suit === leadSuit);
    if (inSuit.length > 0) return card.suit === leadSuit;

    // Premier pli : pas de cœur ni dame de pique si on a d'autres cartes
    if (s.trickCount === 0) {
      const hasOther = hand.some(c => c.suit !== '♥' && !(c.suit === '♠' && c.rank === 'Q'));
      if (hasOther) return card.suit !== '♥' && !(card.suit === '♠' && card.rank === 'Q');
    }
    return true;
  }

  _doPlay(player, card, cardIdx) {
    const s = this.state;
    s.trick[player] = card;
    s.hands[player].splice(cardIdx, 1);
    if (card.suit === '♥') s.heartsBroken = true;

    const nextPlayer = (player + 1) % 4;

    if (s.trick.every(c => c !== null)) {
      // Pli complet
      this._resolveTrick();
    } else {
      s.currentPlayer = nextPlayer;
      const leadSuit = s.trick[s.leadPlayer]?.suit || s.trick.find(c => c)?.suit;
      s.message = `${s.names[nextPlayer]} joue...`;
      EventBus.emit('game:tick', { state: s });
      if (nextPlayer !== 0) this._scheduleAI(700);
    }
  }

  _resolveTrick() {
    const s = this.state;
    const leadSuit = s.trick[s.leadPlayer].suit;

    // Gagnant = carte la plus haute dans la couleur menée
    let winner = s.leadPlayer;
    let highVal = rankOrder(s.trick[s.leadPlayer].rank);
    for (let p = 0; p < 4; p++) {
      if (s.trick[p].suit === leadSuit && rankOrder(s.trick[p].rank) > highVal) {
        winner = p; highVal = rankOrder(s.trick[p].rank);
      }
    }

    // Calculer points du pli
    const pts = s.trick.reduce((sum, c) => sum + cardPts(c), 0);
    s.roundScores[winner] += pts;
    s.trickResults.push({ winner, cards: [...s.trick], pts });

    s.lastTrickWinner = winner;
    s.trickCount++;
    s.message = `${s.names[winner]} remporte le pli (${pts} pts)`;

    const prevTrick = [...s.trick];
    s.trick = [null, null, null, null];

    EventBus.emit('game:tick', { state: s, lastTrick: prevTrick, trickWinner: winner });

    if (s.trickCount === 13) {
      // Fin du round
      setTimeout(() => this._endRound(), 1200);
    } else {
      s.leadPlayer = winner;
      s.currentPlayer = winner;
      setTimeout(() => {
        EventBus.emit('game:tick', { state: s });
        if (winner !== 0) this._scheduleAI(800);
      }, 1200);
    }
  }

  _endRound() {
    const s = this.state;

    // Shoot the moon : un joueur a tout (26 pts)
    const moonShooter = s.roundScores.findIndex(v => v === 26);
    if (moonShooter !== -1) {
      s.roundScores = s.roundScores.map((_, i) => i === moonShooter ? 0 : 26);
      s.message = `${s.names[moonShooter]} tire les marrons ! +26 pour les autres.`;
    }

    // Ajouter au score global
    s.roundScores.forEach((pts, i) => { s.scores[i] += pts; });

    // Vérifier fin de jeu
    const maxScore = Math.max(...s.scores);
    if (maxScore >= s.maxScore) {
      const minScore = Math.min(...s.scores);
      const winner = s.scores.indexOf(minScore);
      s.phase = 'over';
      s.status = winner === 0 ? 'won' : 'over';
      const score = s.maxScore - s.scores[0]; // score inversé pour le joueur
      ScoreService.update(Math.max(0, score));
      EventBus.emit('game:tick', { state: s });
      if (winner === 0) {
        EventBus.emit('game:won', { score: Math.max(0, score) });
      } else {
        EventBus.emit('game:over', { score: 0 });
      }
      return;
    }

    s.round++;
    s.phase = 'roundEnd';
    EventBus.emit('game:tick', { state: s });

    // Auto-dealer le round suivant après délai
    setTimeout(() => {
      if (s.status === 'playing') {
        s.phase = 'trick';
        this._dealRound();
        EventBus.emit('game:tick', { state: s });
        if (s.currentPlayer !== 0) this._scheduleAI(800);
      }
    }, 2500);
  }

  _scheduleAI(ms) {
    if (this._aiTid) clearTimeout(this._aiTid);
    this._aiTid = setTimeout(() => {
      this._aiTid = null;
      if (this.state?.status === 'playing' && this.state.currentPlayer !== 0) {
        this._aiPlay();
      }
    }, ms);
  }

  _aiPlay() {
    const s = this.state;
    const p = s.currentPlayer;
    if (p === 0 || s.hands[p].length === 0) return;

    const leadSuit = s.trick[s.leadPlayer]?.suit;
    const isLeading = p === s.leadPlayer;
    const card = aiChooseCard(s.hands[p], s.trick, leadSuit, s.heartsBroken, isLeading);
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
