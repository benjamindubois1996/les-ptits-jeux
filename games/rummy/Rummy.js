import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import CardDeck     from '../../js/utils/CardDeck.js';

// ─── Gin Rummy ─────────────────────────────────────────────────────────────
// Règles : 10 cartes chacun, piocher/défausser, frapper quand deadwood ≤ 10
// Gin = deadwood 0 (bonus +25)

const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

function rankIdx(r) { return RANKS.indexOf(r); }
function cardPoints(card) {
  if (card.rank === 'A') return 1;
  if (['J','Q','K'].includes(card.rank)) return 10;
  return parseInt(card.rank, 10);
}

// Trouve tous les melds valides (sets et suites) dans une main
function findMelds(hand) {
  const melds = [];

  // Sets : même rang, 3 ou 4 cartes
  const byRank = {};
  hand.forEach(c => { (byRank[c.rank] = byRank[c.rank] || []).push(c); });
  Object.values(byRank).forEach(group => {
    if (group.length >= 3) melds.push([...group.slice(0, 3)]);
    if (group.length === 4) melds.push([...group]);
  });

  // Suites : même couleur, rangs consécutifs, min 3
  const bySuit = {};
  hand.forEach(c => { (bySuit[c.suit] = bySuit[c.suit] || []).push(c); });
  Object.values(bySuit).forEach(group => {
    group.sort((a, b) => rankIdx(a.rank) - rankIdx(b.rank));
    // Cherche toutes les sous-suites de 3+
    for (let i = 0; i < group.length - 2; i++) {
      let run = [group[i]];
      for (let j = i + 1; j < group.length; j++) {
        if (rankIdx(group[j].rank) === rankIdx(run[run.length - 1].rank) + 1) {
          run.push(group[j]);
          if (run.length >= 3) melds.push([...run]);
        } else {
          break;
        }
      }
    }
  });

  return melds;
}

// Calcule le deadwood optimal (cartes non dans les melds)
function calcDeadwood(hand) {
  // Essai simplifié : trouver les melds non-overlappants qui minimisent le deadwood
  const melds = findMelds(hand);

  let bestDeadwood = hand.reduce((s, c) => s + cardPoints(c), 0);
  let bestMeldSet  = [];

  function tryMelds(remaining, usedMelds, currentIdx) {
    const dw = remaining.reduce((s, c) => s + cardPoints(c), 0);
    if (dw < bestDeadwood) { bestDeadwood = dw; bestMeldSet = [...usedMelds]; }

    for (let i = currentIdx; i < melds.length; i++) {
      const meld = melds[i];
      if (meld.every(c => remaining.includes(c))) {
        const newRemaining = remaining.filter(c => !meld.includes(c));
        tryMelds(newRemaining, [...usedMelds, meld], i + 1);
      }
    }
  }

  tryMelds(hand, [], 0);
  return { deadwood: bestDeadwood, melds: bestMeldSet };
}

// ─── IA ──────────────────────────────────────────────────────────────────────

function aiDraw(hand, topDiscard) {
  if (!topDiscard) return 'stock';
  // Prendre la défausse si ça améliore la main
  const withDiscard = [...hand, topDiscard];
  const withoutDiscard = calcDeadwood(hand);
  const withDiscard_ = calcDeadwood(withDiscard);
  return withDiscard_.deadwood < withoutDiscard.deadwood ? 'discard' : 'stock';
}

function aiDiscard(hand) {
  // Défausser la carte qui maximise le meld potentiel (= retire celle avec le deadwood max)
  let worst = null, worstPts = -1;
  hand.forEach(card => {
    const newHand = hand.filter(c => c !== card);
    const { deadwood } = calcDeadwood(newHand);
    const pts = cardPoints(card);
    if (pts > worstPts) { worstPts = pts; worst = card; }
  });
  return worst || hand[0];
}

// ─── Rummy ───────────────────────────────────────────────────────────────────

export default class Rummy extends BaseGame {
  constructor(config) {
    super(config);
    this.state  = null;
    this._aiTid = null;
  }

  _gameId() { return 'rummy'; }

  async init() {
    this._setupEventBusBindings();
    this.state = this._buildFullState();
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  _buildFullState() {
    return {
      status:      'idle',
      playerHand:  [],
      aiHand:      [],
      stock:       [],
      discard:     [],      // défausse, visible
      turn:        'player', // 'player' | 'ai'
      phase:       'draw',   // 'draw' | 'discard' | 'knock'
      drawnCard:   null,     // carte piochée ce tour
      scores:      { player: 0, ai: 0 },
      round:       1,
      maxRounds:   5,
      selected:    null,     // index carte sélectionnée
      knockData:   null,     // { knocker, playerDW, aiDW, bonus }
      message:     '',
      melds:       { player: [], ai: [] }, // melds trouvés
    };
  }

  start() {
    this.state.status = 'playing';
    this._dealRound();
    EventBus.emit('game:tick', { state: this.state, action: 'play' });
  }

  _dealRound() {
    const s = this.state;
    const deck = CardDeck.shuffle(CardDeck.create());

    // 10 cartes chacun
    s.playerHand = [];
    s.aiHand     = [];
    for (let i = 0; i < 10; i++) {
      const pc = deck.pop(); pc.faceUp = true;  s.playerHand.push(pc);
      const ac = deck.pop(); ac.faceUp = false; s.aiHand.push(ac);
    }
    s.stock   = deck;
    const first = s.stock.pop(); first.faceUp = true;
    s.discard = [first];
    s.turn    = 'player';
    s.phase   = 'draw';
    s.drawnCard = null;
    s.selected  = null;
    s.knockData = null;
    s.melds     = { player: [], ai: [] };
    s.message   = `Round ${s.round} — Piochez dans le stock ou prenez la défausse`;
    this._updateMelds();
  }

  _updateMelds() {
    const s = this.state;
    const pr = calcDeadwood(s.playerHand);
    const ar = calcDeadwood(s.aiHand);
    s.melds.player = pr.melds;
    s.melds.ai     = ar.melds;
  }

  // Joueur pioche
  drawStock() {
    const s = this.state;
    if (s.status !== 'playing' || s.turn !== 'player' || s.phase !== 'draw') return;
    if (s.stock.length === 0) { this._reshuffleFromDiscard(); }
    if (s.stock.length === 0) return;
    const card = s.stock.pop(); card.faceUp = true;
    s.playerHand.push(card);
    s.drawnCard = card;
    s.phase   = 'discard';
    s.message = 'Vous avez pioché — choisissez une carte à défausser';
    this._updateMelds();
    EventBus.emit('game:tick', { state: s });
  }

  drawDiscard() {
    const s = this.state;
    if (s.status !== 'playing' || s.turn !== 'player' || s.phase !== 'draw') return;
    if (s.discard.length === 0) return;
    const card = s.discard.pop();
    s.playerHand.push(card);
    s.drawnCard = card;
    s.phase   = 'discard';
    s.message = `Vous prenez ${card.rank}${card.suit} — choisissez une carte à défausser`;
    this._updateMelds();
    EventBus.emit('game:tick', { state: s });
  }

  selectCard(idx) {
    const s = this.state;
    if (s.status !== 'playing' || s.turn !== 'player' || s.phase !== 'discard') return;
    s.selected = (s.selected === idx) ? null : idx;
    EventBus.emit('game:tick', { state: s });
  }

  discardCard() {
    const s = this.state;
    if (s.status !== 'playing' || s.turn !== 'player' || s.phase !== 'discard') return;
    if (s.selected === null) return;

    const card = s.playerHand.splice(s.selected, 1)[0];
    card.faceUp = true;
    s.discard.push(card);
    s.drawnCard = null;
    s.selected  = null;

    const { deadwood } = calcDeadwood(s.playerHand);

    if (deadwood === 0) {
      // Gin !
      this._knock('player', true);
      return;
    }

    s.phase = 'draw';
    s.turn  = 'ai';
    s.message = "L'IA joue...";
    this._updateMelds();
    EventBus.emit('game:tick', { state: s });
    this._scheduleAI(900);
  }

  knock() {
    const s = this.state;
    if (s.status !== 'playing' || s.turn !== 'player' || s.phase !== 'discard') return;
    const { deadwood } = calcDeadwood(s.playerHand);
    if (deadwood > 10) {
      s.message = `Deadwood trop élevé (${deadwood}) — il faut ≤ 10 pour frapper`;
      EventBus.emit('game:tick', { state: s });
      return;
    }
    this._knock('player', deadwood === 0);
  }

  _knock(knocker, isGin) {
    const s = this.state;
    s.aiHand.forEach(c => c.faceUp = true);
    const { deadwood: pdw } = calcDeadwood(s.playerHand);
    const { deadwood: adw } = calcDeadwood(s.aiHand);

    let playerScore = 0, aiScore = 0;
    const bonus = isGin ? 25 : 0;

    if (knocker === 'player') {
      if (pdw < adw) {
        playerScore = adw - pdw + bonus;
      } else if (adw <= pdw && !isGin) {
        // Undercut ! IA gagne
        aiScore = pdw - adw + 10;
      } else {
        playerScore = bonus;
      }
    } else {
      if (adw < pdw) {
        aiScore = pdw - adw + bonus;
      } else if (pdw <= adw && !isGin) {
        playerScore = adw - pdw + 10;
      } else {
        aiScore = bonus;
      }
    }

    s.scores.player += playerScore;
    s.scores.ai     += aiScore;
    s.knockData = {
      knocker, isGin, playerDW: pdw, aiDW: adw,
      playerScore, aiScore,
      desc: isGin ? `GIN par ${knocker === 'player' ? 'Vous' : "l'IA"} !`
        : `${knocker === 'player' ? 'Vous' : "L'IA"} frappez (DW: ${pdw} vs ${adw})`,
    };
    s.phase = 'knock';
    s.turn  = null;
    s.message = s.knockData.desc;
    ScoreService.update(s.scores.player);
    this._updateMelds();
    EventBus.emit('game:tick', { state: s });

    if (s.round >= s.maxRounds) {
      setTimeout(() => {
        s.status = s.scores.player > s.scores.ai ? 'won' : 'over';
        if (s.status === 'won') EventBus.emit('game:won', { score: s.scores.player });
        else                    EventBus.emit('game:over', { score: s.scores.player });
        EventBus.emit('game:tick', { state: s });
      }, 2500);
    } else {
      s.round++;
      setTimeout(() => {
        if (s.status === 'playing') {
          this._dealRound();
          EventBus.emit('game:tick', { state: s });
        }
      }, 2500);
    }
  }

  _scheduleAI(ms) {
    if (this._aiTid) clearTimeout(this._aiTid);
    this._aiTid = setTimeout(() => {
      this._aiTid = null;
      if (this.state?.status === 'playing' && this.state.turn === 'ai') this._aiAct();
    }, ms);
  }

  _aiAct() {
    const s = this.state;
    if (s.phase === 'draw') {
      const top = s.discard[s.discard.length - 1];
      const src = aiDraw(s.aiHand, top);
      if (src === 'discard' && top) {
        s.discard.pop();
        s.aiHand.push(top);
      } else {
        if (s.stock.length === 0) this._reshuffleFromDiscard();
        if (s.stock.length === 0) return;
        const c = s.stock.pop(); c.faceUp = false;
        s.aiHand.push(c);
      }
      s.phase = 'discard';
      this._scheduleAI(600);
    } else if (s.phase === 'discard') {
      const toDiscard = aiDiscard(s.aiHand);
      const idx = s.aiHand.indexOf(toDiscard);
      if (idx !== -1) {
        s.aiHand.splice(idx, 1);
        toDiscard.faceUp = true;
        s.discard.push(toDiscard);
      }

      const { deadwood } = calcDeadwood(s.aiHand);
      if (deadwood === 0) { this._knock('ai', true); return; }
      if (deadwood <= 10 && Math.random() < 0.4) { this._knock('ai', false); return; }

      s.phase   = 'draw';
      s.turn    = 'player';
      s.message = 'À votre tour — piochez ou prenez la défausse';
      this._updateMelds();
      EventBus.emit('game:tick', { state: s });
    }
  }

  _reshuffleFromDiscard() {
    const s = this.state;
    if (s.discard.length <= 1) return;
    const top = s.discard.pop();
    s.stock = CardDeck.shuffle(s.discard);
    s.stock.forEach(c => c.faceUp = false);
    s.discard = [top];
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
