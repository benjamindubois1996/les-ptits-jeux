import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import CardDeck, { Card } from '../../js/utils/CardDeck.js';

// BASIQUE = 1 couleur (piques uniquement, cartes fictives mais avec rang correct)
// 4 couleurs = mode standard (V2+)

const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

function rankIdx(rank) { return RANKS.indexOf(rank); }

export default class SpiderSolitaire extends BaseGame {
  constructor(config) {
    super(config);
    this.state = null;
  }

  _gameId() { return 'spider-solitaire'; }

  async init() {
    this._setupEventBusBindings();
    this.state = this._buildFullState();
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  _buildFullState(mode = 'basique') {
    return {
      status:    'idle',
      mode,
      columns:   [],    // 10 colonnes, chacune un tableau de cartes
      stock:     [],    // cartes restantes (5 deals de 10)
      completed: 0,     // suites complètes retirées (max 8)
      moves:     0,
      selected:  null,  // { col, idx } carte sélectionnée
      stockDeals:5,     // deals disponibles
      score:     0,
    };
  }

  start(options = {}) {
    const mode = options.mode || 'basique';
    this.state = this._buildFullState(mode);
    this.state.status = 'playing';
    this._deal(mode);
    EventBus.emit('game:tick', { state: this.state, action: 'play' });
  }

  _deal(mode) {
    const s = this.state;
    // 2 jeux de 52 cartes = 104 cartes
    // En mode BASIQUE, toutes les cartes sont ♠ (simplifie les règles)
    let cards;
    if (mode === 'basique') {
      // 8 jeux de 13 rangs (pique uniquement) → 104 cartes
      cards = [];
      for (let i = 0; i < 8; i++) {
        RANKS.forEach(r => {
          const c = new Card('♠', r);
          cards.push(c);
        });
      }
    } else {
      cards = CardDeck.create(2);
    }
    CardDeck.shuffle(cards);

    // Distribuer dans 10 colonnes (6 premières = 6 cartes, 4 suivantes = 5 cartes)
    s.columns = [];
    let idx = 0;
    for (let col = 0; col < 10; col++) {
      const count = col < 4 ? 6 : 5;
      const col_cards = cards.slice(idx, idx + count);
      // Toutes face cachée sauf la dernière
      col_cards.forEach((c, i) => { c.faceUp = (i === col_cards.length - 1); });
      s.columns.push(col_cards);
      idx += count;
    }
    // Reste = stock (50 cartes → 5 deals de 10)
    s.stock = cards.slice(idx);
    s.stock.forEach(c => c.faceUp = false);
    s.stockDeals = 5;
  }

  select(col, cardIdx) {
    const s = this.state;
    if (s.status !== 'playing') return;
    const card = s.columns[col]?.[cardIdx];
    if (!card || !card.faceUp) return;

    // Vérifie si le groupe depuis cardIdx est une suite valide (descendante, même couleur en mode 4)
    if (!this._isMovableGroup(col, cardIdx)) return;

    if (s.selected && s.selected.col === col && s.selected.idx === cardIdx) {
      // Désélectionner
      s.selected = null;
    } else {
      s.selected = { col, idx: cardIdx };
    }
    EventBus.emit('game:tick', { state: s });
  }

  moveTo(destCol) {
    const s = this.state;
    if (!s.selected || s.status !== 'playing') return;
    const { col: srcCol, idx: srcIdx } = s.selected;

    const srcGroup = s.columns[srcCol].slice(srcIdx);
    const dest     = s.columns[destCol];
    const destTop  = dest[dest.length - 1];

    // Règle de pose : colonne vide OU carte du dessus de rang +1 (peu importe la couleur en basique)
    const canPlace = !destTop || (rankIdx(destTop.rank) === rankIdx(srcGroup[0].rank) + 1);
    if (!canPlace || srcCol === destCol) {
      s.selected = null;
      EventBus.emit('game:tick', { state: s });
      return;
    }

    // Déplacer
    const moving = s.columns[srcCol].splice(srcIdx);
    s.columns[destCol].push(...moving);
    s.moves++;
    s.score = Math.max(0, s.score - 1);

    // Révéler la carte précédente
    const src = s.columns[srcCol];
    if (src.length > 0) src[src.length - 1].faceUp = true;

    s.selected = null;
    this._checkComplete(destCol);
    EventBus.emit('game:tick', { state: s });
  }

  dealStock() {
    const s = this.state;
    if (s.status !== 'playing') return;
    // Au moins 1 carte dans chaque colonne requis pour deal (règle standard)
    if (s.stockDeals <= 0 || s.stock.length < 10) return;

    const ten = s.stock.splice(s.stock.length - 10, 10);
    ten.forEach((c, i) => {
      c.faceUp = true;
      s.columns[i].push(c);
    });
    s.stockDeals--;
    s.selected = null;

    // Vérifier complétions après deal
    for (let col = 0; col < 10; col++) this._checkComplete(col);
    EventBus.emit('game:tick', { state: s });
  }

  _isMovableGroup(col, fromIdx) {
    const group = this.state.columns[col].slice(fromIdx);
    if (group.length === 0 || !group[0].faceUp) return false;
    for (let i = 1; i < group.length; i++) {
      const prev = group[i - 1], cur = group[i];
      if (!cur.faceUp) return false;
      if (rankIdx(cur.rank) !== rankIdx(prev.rank) - 1) return false;
      if (this.state.mode !== 'basique' && cur.suit !== prev.suit) return false;
    }
    return true;
  }

  _checkComplete(col) {
    const s = this.state;
    const col_cards = s.columns[col];
    if (col_cards.length < 13) return;

    // Cherche une suite complète K→A en bas de la colonne, même couleur
    const tail = col_cards.slice(-13);
    let valid = tail.every(c => c.faceUp);
    if (!valid) return;

    for (let i = 0; i < 13; i++) {
      if (tail[i].rank !== RANKS[12 - i]) { valid = false; break; }
      if (s.mode !== 'basique' && tail[i].suit !== tail[0].suit) { valid = false; break; }
    }
    if (!valid) return;

    // Retirer les 13 cartes
    s.columns[col].splice(-13);
    s.completed++;
    s.score += 100;
    ScoreService.update(s.score);

    // Révéler si nécessaire
    const rem = s.columns[col];
    if (rem.length > 0) rem[rem.length - 1].faceUp = true;

    if (s.completed === 8) {
      s.status = 'won';
      EventBus.emit('game:won', { score: s.score });
    }
  }

  restart() {
    this.state = this._buildFullState();
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  destroy() { super.destroy(); }
}
