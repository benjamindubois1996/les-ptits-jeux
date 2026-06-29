import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import CardDeck, { Card } from '../../js/utils/CardDeck.js';

// Card value for cribbage (J/Q/K = 10, A = 1)
function cVal(rank) {
  if (['J','Q','K'].includes(rank)) return 10;
  if (rank === 'A') return 1;
  return parseInt(rank, 10);
}

// Rank order for run detection (A=1)
const RUN_ORDER = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
function runRank(rank) { return RUN_ORDER.indexOf(rank); }

// Score a cribbage hand (4 cards + starter)
function scoreHand(hand, starter, isCrib) {
  const all5 = [...hand, starter];
  let pts = 0;

  // 15s
  for (let mask = 1; mask < (1 << 5); mask++) {
    const cards = all5.filter((_, i) => mask & (1 << i));
    if (cards.reduce((s, c) => s + cVal(c.rank), 0) === 15) pts += 2;
  }

  // Pairs (any 2-card subset same rank)
  for (let i = 0; i < 5; i++) {
    for (let j = i + 1; j < 5; j++) {
      if (all5[i].rank === all5[j].rank) pts += 2;
    }
  }

  // Runs — use separate counter so 15s/pairs don't interfere with the break
  let runPts = 0;
  for (let len = 5; len >= 3; len--) {
    for (let mask = 1; mask < (1 << 5); mask++) {
      const bits = mask.toString(2).split('').filter(b => b === '1').length;
      if (bits !== len) continue;
      const sel   = all5.filter((_, i) => mask & (1 << i));
      const ranks = sel.map(c => runRank(c.rank)).sort((a, b) => a - b);
      const isRun = new Set(ranks).size === len && ranks.every((r, i) => i === 0 || r === ranks[i - 1] + 1);
      if (isRun) runPts += len;
    }
    if (runPts > 0) break; // only count longest-length runs
  }
  pts += runPts;

  // Flush: all 4 hand cards same suit (not counting starter for basic flush)
  if (hand.length >= 4) {
    const suits = hand.map(c => c.suit);
    if (suits.every(s => s === suits[0])) {
      if (!isCrib) {
        pts += starter.suit === suits[0] ? 5 : 4;
      } else if (starter.suit === suits[0]) {
        pts += 5; // crib: must be all 5
      }
    }
  }

  // Nobs: J in hand matching starter suit
  if (hand.some(c => c.rank === 'J' && c.suit === starter.suit)) pts += 1;

  return pts;
}

// AI: pick 2 cards to discard to crib, keeping best hand
function aiDiscard(hand, isOwnCrib) {
  let best = -Infinity;
  let keep = [0, 1, 2, 3];

  const indices = [0,1,2,3,4,5];
  // Try all C(6,2) = 15 combinations of 2 to discard
  for (let i = 0; i < 6; i++) {
    for (let j = i + 1; j < 6; j++) {
      const keepIdx = indices.filter(k => k !== i && k !== j);
      const keepCards = keepIdx.map(k => hand[k]);
      // Estimate hand value (no starter — use average)
      const avgStarter = new Card('♠', '7'); // rough placeholder
      let val = scoreHand(keepCards, avgStarter, false);
      if (isOwnCrib) val += 2; // crib is bonus if own
      if (val > best) { best = val; keep = keepIdx; }
    }
  }

  const discardIdx = indices.filter(k => !keep.includes(k));
  return discardIdx;
}

// Pegging AI: play a card that scores points; otherwise play lowest safe card
function aiPegCard(hand, pile, count) {
  const legal = hand.filter(c => cVal(c.rank) + count <= 31);
  if (legal.length === 0) return null; // Go

  let best = null, bestPts = -1;
  for (const c of legal) {
    let pts = 0;
    const newCount = count + cVal(c.rank);
    if (newCount === 15 || newCount === 31) pts += 2;
    // Pair check
    if (pile.length > 0 && pile[pile.length - 1].rank === c.rank) pts += 2;
    if (pts > bestPts) { bestPts = pts; best = c; }
  }
  return best;
}

export default class Cribbage extends BaseGame {
  constructor(config) {
    super(config);
    this.state   = null;
    this._aiTid  = null;
  }

  _gameId() { return 'cribbage'; }

  _buildFullState() {
    return {
      status:      'idle',
      phase:       'deal', // deal | discard | cut | peg | count | roundEnd | over
      scores:      [0, 0],     // [player, ai]
      dealer:      0,           // 0=player, 1=ai
      hands:       [[], []],
      crib:        [],
      starter:     null,
      pegPile:     [],
      pegCount:    0,
      lastToPlay:  -1,
      goFlag:      [false, false], // who said Go
      selected:    [],            // player's selected card indices for discard
      currentPeg:  -1,            // whose turn to peg
      countDetails: null,
      message:     '',
    };
  }

  async init() {
    this._setupEventBusBindings();
    this.state = this._buildFullState();
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  start() {
    const s = this.state;
    s.status  = 'playing';
    this._deal();
    EventBus.emit('game:tick', { state: s, action: 'play' });
  }

  _deal() {
    const s = this.state;
    const deck = CardDeck.shuffle(CardDeck.create());
    s.hands    = [[], []];
    s.crib     = [];
    s.starter  = null;
    s.pegPile  = [];
    s.pegCount = 0;
    s.goFlag   = [false, false];
    s.selected = [];

    // Deal 6 cards each
    for (let i = 0; i < 6; i++) {
      const c0 = deck.pop(); c0.faceUp = true; s.hands[0].push(c0);
      const c1 = deck.pop(); c1.faceUp = true; s.hands[1].push(c1);
    }
    s._deck = deck;

    s.phase   = 'discard';
    s.message = 'Sélectionnez 2 cartes à défausser dans la crib';
    EventBus.emit('game:tick', { state: s });

    // AI discards immediately
    this._aiTid = setTimeout(() => {
      const discIdx = aiDiscard(s.hands[1], s.dealer === 1);
      discIdx.forEach(i => { s.crib.push(s.hands[1][i]); });
      s.hands[1] = s.hands[1].filter((_, i) => !discIdx.includes(i));
      s.message  = `L'IA a défaussé 2 cartes dans la crib`;
      EventBus.emit('game:tick', { state: s });
    }, 600);
  }

  toggleSelect(cardIdx) {
    const s = this.state;
    if (s.phase !== 'discard') return;
    const idx = s.selected.indexOf(cardIdx);
    if (idx === -1) {
      if (s.selected.length >= 2) return;
      s.selected.push(cardIdx);
    } else {
      s.selected.splice(idx, 1);
    }
    EventBus.emit('game:tick', { state: s });
  }

  confirmDiscard() {
    const s = this.state;
    if (s.phase !== 'discard' || s.selected.length !== 2) return;

    // Move selected to crib
    const sorted = [...s.selected].sort((a, b) => b - a);
    sorted.forEach(i => { s.crib.push(s.hands[0][i]); s.hands[0].splice(i, 1); });
    s.selected = [];

    s.phase   = 'cut';
    s.message = 'Coupe !';
    EventBus.emit('game:tick', { state: s });

    this._aiTid = setTimeout(() => {
      // Turn the starter
      const starter = s._deck.pop();
      starter.faceUp = true;
      s.starter  = starter;
      s.message  = `Starter : ${starter.rank}${starter.suit}`;

      // Nibs: J starter = 2pts for dealer
      if (starter.rank === 'J') {
        s.scores[s.dealer] += 2;
        s.message += ' — Nibs ! +2 pts pour le donneur';
      }

      // Save hands for counting phase (pegging consumes them)
      s._originalHands = [s.hands[0].map(c => c.clone()), s.hands[1].map(c => c.clone())];

      s.phase = 'peg';
      // Non-dealer pegs first
      s.currentPeg = s.dealer === 0 ? 1 : 0;
      s.lastToPlay  = -1;
      EventBus.emit('game:tick', { state: s });

      if (s.currentPeg === 1) this._scheduleAIPeg(800);
    }, 1000);
  }

  // Player plays a card during pegging
  pegPlay(cardIdx) {
    const s = this.state;
    if (s.phase !== 'peg' || s.currentPeg !== 0) return;
    const card = s.hands[0][cardIdx];
    if (!card) return;
    if (cVal(card.rank) + s.pegCount > 31) return;

    s.hands[0].splice(cardIdx, 1);
    this._doPeg(0, card);
  }

  pegGo() {
    const s = this.state;
    if (s.phase !== 'peg' || s.currentPeg !== 0) return;
    const canPlay = s.hands[0].some(c => cVal(c.rank) + s.pegCount <= 31);
    if (canPlay) return; // can't say Go if you can play
    this._doGo(0);
  }

  _doPeg(player, card) {
    const s = this.state;
    s.pegPile.push({ card, player });
    s.pegCount += cVal(card.rank);
    s.lastToPlay = player;
    s.goFlag[player] = false;

    // Score the peg
    let pts = 0;
    const pName = player === 0 ? 'Vous' : 'IA';
    const msgs  = [];

    if (s.pegCount === 15) { pts += 2; msgs.push('15 pour 2'); }
    if (s.pegCount === 31) { pts += 2; msgs.push('31 pour 2'); }

    // Pairs
    const pile = s.pegPile;
    const topRank = pile[pile.length - 1].card.rank;
    let pairLen = 0;
    for (let i = pile.length - 1; i >= 0 && pile[i].card.rank === topRank; i--) pairLen++;
    if (pairLen === 2) { pts += 2; msgs.push('paire'); }
    else if (pairLen === 3) { pts += 6; msgs.push('triple'); }
    else if (pairLen === 4) { pts += 12; msgs.push('quadruple'); }

    // Runs
    if (pile.length >= 3) {
      for (let len = Math.min(pile.length, 7); len >= 3; len--) {
        const seg = pile.slice(-len).map(p => runRank(p.card.rank)).sort((a, b) => a - b);
        const isRun = seg.every((r, i) => i === 0 || r === seg[i - 1] + 1);
        if (isRun && new Set(seg).size === len) { pts += len; msgs.push(`suite de ${len}`); break; }
      }
    }

    if (pts > 0) {
      s.scores[player] += pts;
      s.message = `${pName} : ${msgs.join(', ')} (+${pts} pts)`;
      if (this._checkWin(player)) return;
    } else {
      s.message = `${pName} joue ${card.rank}${card.suit} — total ${s.pegCount}`;
    }

    // Reset at 31
    if (s.pegCount === 31) {
      setTimeout(() => {
        s.pegCount  = 0;
        s.goFlag    = [false, false];
        s.lastToPlay = -1;
        s.currentPeg = s.dealer === 0 ? 1 : 0; // non-dealer starts new sub-round
        EventBus.emit('game:tick', { state: s });
        if (s.currentPeg === 1) this._scheduleAIPeg(800);
        else this._checkPegDone();
      }, 800);
      EventBus.emit('game:tick', { state: s });
      return;
    }

    // Switch turn or continue
    const next = 1 - player;
    s.currentPeg = next;
    EventBus.emit('game:tick', { state: s });

    if (next === 1) {
      this._scheduleAIPeg(700);
    } else {
      this._checkPegDone();
    }
  }

  _doGo(player) {
    const s  = this.state;
    s.goFlag[player] = true;
    const other = 1 - player;
    s.message = `${player === 0 ? 'Vous' : 'IA'} : Go !`;

    if (s.goFlag[other] || s.hands[other].every(c => cVal(c.rank) + s.pegCount > 31)) {
      // Both said Go or other can't play — last to play gets 1 pt
      if (s.lastToPlay !== -1) {
        s.scores[s.lastToPlay] += 1;
        s.message += ` +1 pt pour ${s.lastToPlay === 0 ? 'vous' : "l'IA"}`;
        if (this._checkWin(s.lastToPlay)) return;
      }
      // New sub-round
      s.pegCount  = 0;
      s.goFlag    = [false, false];
      s.lastToPlay = -1;
      s.currentPeg = s.dealer === 0 ? 1 : 0;
      EventBus.emit('game:tick', { state: s });
      if (s.currentPeg === 1) this._scheduleAIPeg(800);
      else this._checkPegDone();
    } else {
      s.currentPeg = other;
      EventBus.emit('game:tick', { state: s });
      if (other === 1) this._scheduleAIPeg(600);
    }
  }

  _scheduleAIPeg(ms) {
    if (this._aiTid) clearTimeout(this._aiTid);
    this._aiTid = setTimeout(() => {
      const s = this.state;
      if (s.phase !== 'peg' || s.currentPeg !== 1) return;
      const card = aiPegCard(s.hands[1], s.pegPile, s.pegCount);
      if (!card) { this._doGo(1); return; }
      const idx = s.hands[1].indexOf(card);
      s.hands[1].splice(idx, 1);
      this._doPeg(1, card);
    }, ms);
  }

  _checkPegDone() {
    const s = this.state;
    if (s.hands[0].length === 0 && s.hands[1].length === 0) {
      // Last card bonus
      if (s.lastToPlay !== -1 && s.pegCount !== 31) {
        s.scores[s.lastToPlay] += 1;
        if (this._checkWin(s.lastToPlay)) return;
      }
      this._aiTid = setTimeout(() => this._countHands(), 1000);
    }
  }

  _countHands() {
    const s = this.state;
    s.phase = 'count';

    // Rebuild hands from crib (they were consumed in pegging)
    // Re-deal for counting — retrieve from state._originalHands
    const hands = s._originalHands || [[], []];

    const nonDealer = s.dealer === 0 ? 1 : 0;
    const dealer    = s.dealer;

    const nonDealerPts = scoreHand(hands[nonDealer], s.starter, false);
    const dealerPts    = scoreHand(hands[dealer],    s.starter, false);
    const cribPts      = scoreHand(s.crib.slice(0, 4), s.starter, true);

    s.scores[nonDealer] += nonDealerPts;
    if (this._checkWin(nonDealer)) return;
    s.scores[dealer]    += dealerPts;
    if (this._checkWin(dealer)) return;
    s.scores[dealer]    += cribPts;

    s.countDetails = {
      nonDealer: { player: nonDealer, pts: nonDealerPts },
      dealer:    { player: dealer,    pts: dealerPts },
      crib:      { pts: cribPts },
    };
    s.message = `Décompte — Non-donneur: ${nonDealerPts}pts, Donneur: ${dealerPts}pts, Crib: ${cribPts}pts`;

    if (this._checkWin(dealer)) return;

    s.phase = 'roundEnd';
    EventBus.emit('game:tick', { state: s });

    this._aiTid = setTimeout(() => {
      s.dealer = 1 - s.dealer;
      this._deal();
    }, 3000);
  }

  _checkWin(player) {
    const s = this.state;
    if (s.scores[player] >= 121) {
      s.status  = player === 0 ? 'won' : 'over';
      s.phase   = 'over';
      s.message = player === 0 ? '🏆 Vous atteignez 121 — Victoire !' : "L'IA atteint 121 — Défaite.";
      const score = s.scores[0];
      ScoreService.submit(this._gameId(), score);
      EventBus.emit('game:tick', { state: s });
      EventBus.emit(player === 0 ? 'game:won' : 'game:over', { score });
      return true;
    }
    return false;
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

