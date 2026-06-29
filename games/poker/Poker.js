import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import CardDeck     from '../../js/utils/CardDeck.js';

// ─── Évaluation de main ───────────────────────────────────────────────────────

const HAND_NAMES = [
  'Carte haute','Paire','Double paire','Brelan','Suite',
  'Couleur','Full','Carré','Quinte flush','Quinte flush royale',
];

function cardVal(rank) {
  return CardDeck.RANK_VALUES[rank];
}

function evaluate5(cards) {
  const vals = cards.map(c => cardVal(c.rank)).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = new Set(suits).size === 1;

  // A-2-3-4-5 straight (wheel)
  const isWheel = vals[0] === 14 && vals[1] === 5 && vals[2] === 4 && vals[3] === 3 && vals[4] === 2;
  const isStraight = (new Set(vals).size === 5 && vals[0] - vals[4] === 4) || isWheel;
  const straightHigh = isWheel ? 5 : vals[0];

  const cnt = {};
  vals.forEach(v => { cnt[v] = (cnt[v] || 0) + 1; });
  const groups = Object.entries(cnt)
    .sort(([va, ca], [vb, cb]) => cb - ca || vb - va)
    .map(([v, c]) => ({ v: +v, c }));

  const tie = isWheel ? [5, 4, 3, 2, 1] : vals;

  if (isFlush && isStraight) {
    const rank = vals[0] === 14 && vals[1] === 13 ? 9 : 8;
    return { rank, name: HAND_NAMES[rank], tiebreak: [straightHigh] };
  }
  if (groups[0].c === 4) return { rank:7, name:HAND_NAMES[7], tiebreak:[groups[0].v, groups[1].v] };
  if (groups[0].c === 3 && groups[1].c === 2) return { rank:6, name:HAND_NAMES[6], tiebreak:[groups[0].v, groups[1].v] };
  if (isFlush)    return { rank:5, name:HAND_NAMES[5], tiebreak: tie };
  if (isStraight) return { rank:4, name:HAND_NAMES[4], tiebreak:[straightHigh] };
  if (groups[0].c === 3) return { rank:3, name:HAND_NAMES[3], tiebreak:[groups[0].v, groups[1].v, groups[2].v] };
  if (groups[0].c === 2 && groups[1].c === 2) return { rank:2, name:HAND_NAMES[2], tiebreak:[groups[0].v, groups[1].v, groups[2].v] };
  if (groups[0].c === 2) return { rank:1, name:HAND_NAMES[1], tiebreak:[groups[0].v, groups[1].v, groups[2].v, groups[3].v] };
  return { rank:0, name:HAND_NAMES[0], tiebreak: tie };
}

function bestHand(hole, community) {
  const all = [...hole, ...community];
  if (all.length <= 5) return evaluate5(all.slice(0, 5));
  let best = null;
  const drop = all.length - 5; // 1 (turn: 6 cartes) ou 2 (river/showdown: 7)
  if (drop === 1) {
    for (let i = 0; i < all.length; i++) {
      const five = all.filter((_, k) => k !== i);
      const h = evaluate5(five);
      if (!best || cmpH(h, best) > 0) best = h;
    }
  } else {
    for (let i = 0; i < all.length - 1; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const five = all.filter((_, k) => k !== i && k !== j);
        const h = evaluate5(five);
        if (!best || cmpH(h, best) > 0) best = h;
      }
    }
  }
  return best;
}

function cmpH(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.min(a.tiebreak.length, b.tiebreak.length); i++) {
    if (a.tiebreak[i] !== b.tiebreak[i]) return a.tiebreak[i] - b.tiebreak[i];
  }
  return 0;
}

// ─── Force main IA ────────────────────────────────────────────────────────────

function preflopStr(hole) {
  const [a, b] = hole.map(c => cardVal(c.rank)).sort((x, y) => y - x);
  const s = hole[0].suit === hole[1].suit;
  if (a === 14 && b === 14) return 9;
  if (a === 13 && b === 13) return 8;
  if (a === 12 && b === 12) return 7;
  if (a === 14 && b === 13) return 7;
  if (a === 11 && b === 11) return 7;
  if (a === 10 && b === 10) return 6;
  if (a === 14 && b >= 10) return s ? 6 : 5;
  if (a === b) return 4;
  if (Math.abs(a - b) <= 2 && a >= 9) return s ? 5 : 3;
  return s ? 3 : 2;
}

// ─── Poker ────────────────────────────────────────────────────────────────────

export default class Poker extends BaseGame {
  constructor(config) {
    super(config);
    this.state = null;
    this._aiTimer = null;
  }

  _gameId() { return 'poker'; }

  async init() {
    this._setupEventBusBindings();
    this.state = this._buildFullState();
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  _buildFullState() {
    return {
      status:      'idle',
      chips:       { player: 1000, ai: 1000 },
      pot:         0,
      bet:         { player: 0, ai: 0 },
      blinds:      { small: 10, big: 20 },
      dealer:      0,          // 0 = player, 1 = ai
      phase:       null,       // 'preflop'|'flop'|'turn'|'river'|'showdown'
      deck:        [],
      playerHand:  [],
      aiHand:      [],
      community:   [],
      turn:        null,       // 'player' | 'ai' | null
      result:      null,       // { winner, playerHandName, aiHandName, desc }
      actions:     [],         // actions disponibles joueur
      message:     '',
      handsPlayed: 0,
      raiseSize:   0,          // montant suggéré pour raise
    };
  }

  start() {
    this.state.status = 'playing';
    this._dealHand();
    EventBus.emit('game:tick', { state: this.state, action: 'play' });
  }

  _dealHand() {
    const s = this.state;
    s.phase  = 'preflop';
    s.result = null;
    s.bet    = { player: 0, ai: 0 };
    s.pot    = 0;
    s.community = [];
    s.actions   = [];
    s.turn      = null;
    s.handsPlayed++;

    const deck = CardDeck.shuffle(CardDeck.create());
    s.playerHand = [deck.pop(), deck.pop()];
    s.aiHand     = [deck.pop(), deck.pop()];
    s.playerHand.forEach(c => c.faceUp = true);
    s.deck = deck;

    // Blinds : dealer = small blind, autre = big blind
    const [sbWho, bbWho] = s.dealer === 0 ? ['player','ai'] : ['ai','player'];
    const sb = Math.min(s.blinds.small, s.chips[sbWho]);
    const bb = Math.min(s.blinds.big,   s.chips[bbWho]);

    s.chips[sbWho] -= sb; s.bet[sbWho] = sb;
    s.chips[bbWho] -= bb; s.bet[bbWho] = bb;
    s.pot = sb + bb;
    s.raiseSize = s.blinds.big * 2;

    // Preflop : small blind parle en premier
    s.turn = sbWho;
    if (s.turn === 'player') {
      s.actions = this._calcActions();
      s.message = `Main ${s.handsPlayed} — Avant-flop (blindes ${sb}/${bb})`;
    } else {
      s.message = `Main ${s.handsPlayed} — L'IA réfléchit...`;
      this._scheduleAI(600);
    }
  }

  _calcActions() {
    const s = this.state;
    const myBet  = s.bet.player;
    const oppBet = s.bet.ai;
    const actions = ['fold'];
    if (myBet < oppBet) {
      actions.push('call');
      if (s.chips.player > oppBet - myBet) actions.push('raise');
    } else {
      actions.push('check');
      if (s.chips.player >= s.blinds.big) actions.push('raise');
    }
    return actions;
  }

  playerAction(action) {
    const s = this.state;
    if (s.status !== 'playing' || s.turn !== 'player') return;

    if (action === 'fold')  { this._endHand('ai',   'fold'); return; }
    if (action === 'check') { this._advancePhase();          return; }

    if (action === 'call') {
      const toCall = s.bet.ai - s.bet.player;
      const actual = Math.min(toCall, s.chips.player);
      s.chips.player -= actual;
      s.bet.player   += actual;
      s.pot          += actual;
      this._advancePhase();
      return;
    }

    if (action === 'raise') {
      const toCall  = Math.max(0, s.bet.ai - s.bet.player);
      const extra   = Math.min(s.raiseSize, s.chips.player - toCall);
      const total   = toCall + Math.max(extra, 1);
      const actual  = Math.min(total, s.chips.player);
      s.chips.player -= actual;
      s.bet.player   += actual;
      s.pot          += actual;
      s.turn    = 'ai';
      s.actions = [];
      s.message = `Vous relancez — l'IA réfléchit...`;
      EventBus.emit('game:tick', { state: s });
      this._scheduleAI(900);
    }
  }

  _scheduleAI(ms) {
    if (this._aiTimer) clearTimeout(this._aiTimer);
    this._aiTimer = setTimeout(() => {
      this._aiTimer = null;
      if (this.state?.status === 'playing') this._aiAct();
    }, ms);
  }

  _aiAct() {
    const s = this.state;
    if (s.status !== 'playing' || s.turn !== 'ai') return;

    const str = s.community.length === 0
      ? preflopStr(s.aiHand)
      : bestHand(s.aiHand, s.community).rank;

    const toCall = s.bet.player - s.bet.ai;

    // Fold si main trop faible face à une mise
    if (str <= 2 && toCall > 0) { this._endHand('player', 'fold'); return; }

    // Call
    if (toCall > 0) {
      const actual = Math.min(toCall, s.chips.ai);
      s.chips.ai -= actual;
      s.bet.ai   += actual;
      s.pot      += actual;
    }

    // Raise avec bonne main
    if (str >= 6 && toCall === 0 && s.chips.ai >= s.blinds.big && Math.random() < 0.6) {
      const extra = Math.min(s.raiseSize, s.chips.ai);
      s.chips.ai -= extra;
      s.bet.ai   += extra;
      s.pot      += extra;
    }

    this._advancePhase();
  }

  _advancePhase() {
    const s = this.state;
    s.bet = { player: 0, ai: 0 };
    s.actions = [];
    s.turn = null;

    if (s.phase === 'preflop') {
      s.phase = 'flop';
      const f = [s.deck.pop(), s.deck.pop(), s.deck.pop()];
      f.forEach(c => c.faceUp = true);
      s.community = f;
    } else if (s.phase === 'flop') {
      s.phase = 'turn';
      const c = s.deck.pop(); c.faceUp = true;
      s.community.push(c);
    } else if (s.phase === 'turn') {
      s.phase = 'river';
      const c = s.deck.pop(); c.faceUp = true;
      s.community.push(c);
    } else if (s.phase === 'river') {
      s.phase = 'showdown';
      this._showdown();
      return;
    }

    // Joueur parle en premier post-flop
    s.turn = 'player';
    s.actions = this._calcActions();
    const phaseFR = { flop:'Flop', turn:'Tournante', river:'Rivière' };
    s.message = `${phaseFR[s.phase] || s.phase} — À vous de jouer !`;
    EventBus.emit('game:tick', { state: s });
  }

  _showdown() {
    const s = this.state;
    s.aiHand.forEach(c => c.faceUp = true);

    const ph = bestHand(s.playerHand, s.community);
    const ah = bestHand(s.aiHand,     s.community);
    const cmp = cmpH(ph, ah);

    let winner, desc;
    if (cmp > 0) {
      winner = 'player';
      s.chips.player += s.pot;
      desc = `Vous gagnez avec ${ph.name} !`;
      ScoreService.update(s.chips.player);
    } else if (cmp < 0) {
      winner = 'ai';
      s.chips.ai += s.pot;
      desc = `L'IA gagne avec ${ah.name}.`;
    } else {
      winner = 'tie';
      const half = Math.floor(s.pot / 2);
      s.chips.player += half;
      s.chips.ai     += s.pot - half;
      desc = `Égalité — partage du pot.`;
    }

    s.result  = { winner, playerHandName: ph.name, aiHandName: ah.name, desc };
    s.turn    = null;
    s.actions = [];
    s.message = desc;
    s.pot     = 0;

    EventBus.emit('game:tick', { state: s });

    if (s.chips.player <= 0) {
      s.status = 'over';
      setTimeout(() => EventBus.emit('game:over', { score: 0 }), 1500);
    } else if (s.chips.ai <= 0) {
      s.status = 'won';
      setTimeout(() => EventBus.emit('game:won', { score: s.chips.player }), 1500);
    } else {
      s.dealer = 1 - s.dealer;
      setTimeout(() => {
        if (s.status === 'playing') {
          this._dealHand();
          EventBus.emit('game:tick', { state: s });
        }
      }, 3000);
    }
  }

  _endHand(winner, reason) {
    const s = this.state;
    s.bet = { player: 0, ai: 0 };
    if (winner === 'player') {
      s.chips.player += s.pot;
      s.message = `L'IA se couche ! Vous remportez ${s.pot} jetons.`;
      ScoreService.update(s.chips.player);
    } else {
      s.chips.ai += s.pot;
      s.message = `Vous vous couchez. L'IA remporte ${s.pot} jetons.`;
    }
    s.pot     = 0;
    s.result  = { winner, desc: s.message };
    s.actions = [];
    s.turn    = null;

    EventBus.emit('game:tick', { state: s });

    if (s.chips.player <= 0) {
      s.status = 'over';
      setTimeout(() => EventBus.emit('game:over', { score: 0 }), 1500);
    } else if (s.chips.ai <= 0) {
      s.status = 'won';
      setTimeout(() => EventBus.emit('game:won', { score: s.chips.player }), 1500);
    } else {
      s.dealer = 1 - s.dealer;
      setTimeout(() => {
        if (s.status === 'playing') {
          this._dealHand();
          EventBus.emit('game:tick', { state: s });
        }
      }, 2000);
    }
  }

  restart() {
    if (this._aiTimer) { clearTimeout(this._aiTimer); this._aiTimer = null; }
    this.state = this._buildFullState();
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  destroy() {
    if (this._aiTimer) { clearTimeout(this._aiTimer); this._aiTimer = null; }
    super.destroy();
  }
}
