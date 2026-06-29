/**
 * CardDeck — Jeu de cartes générique partagé
 * Utilisé par Poker (71), Spider Solitaire (72), Hearts (73), Rummy (74), Belote (75)
 */

export class Card {
  constructor(suit, rank) {
    this.suit   = suit;   // '♠' | '♥' | '♦' | '♣'
    this.rank   = rank;   // '2'…'10','J','Q','K','A'  (ou '7' pour Belote)
    this.id     = `${rank}${suit}`;
    this.faceUp = false;
  }

  get value()  { return CardDeck.RANK_VALUES[this.rank] ?? 0; }
  get isRed()  { return this.suit === '♥' || this.suit === '♦'; }
  get color()  { return this.isRed ? 'red' : 'black'; }
  get label()  { return `${this.rank}${this.suit}`; }

  clone() {
    const c = new Card(this.suit, this.rank);
    c.faceUp = this.faceUp;
    return c;
  }
}

export default class CardDeck {
  static SUITS    = ['♠', '♥', '♦', '♣'];
  static RANKS52  = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  static RANKS32  = ['7','8','9','10','J','Q','K','A'];
  static RANK_VALUES = {
    '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,
    'J':11,'Q':12,'K':13,'A':14,
  };

  /** Jeu standard 52 cartes (copies = 2 pour Spider Solitaire) */
  static create(copies = 1) {
    const cards = [];
    for (let c = 0; c < copies; c++) {
      for (const suit of CardDeck.SUITS) {
        for (const rank of CardDeck.RANKS52) {
          cards.push(new Card(suit, rank));
        }
      }
    }
    return cards;
  }

  /** Jeu 32 cartes 7→As (Belote) */
  static create32() {
    const cards = [];
    for (const suit of CardDeck.SUITS) {
      for (const rank of CardDeck.RANKS32) {
        cards.push(new Card(suit, rank));
      }
    }
    return cards;
  }

  /** Fisher-Yates en place */
  static shuffle(cards) {
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  }

  /** Valeur numérique 2–14 */
  static rankValue(rank) { return CardDeck.RANK_VALUES[rank] ?? 0; }

  /** Rang suivant (ex: '5' → '6', 'K' → 'A') */
  static nextRank(rank, ranks = CardDeck.RANKS52) {
    const i = ranks.indexOf(rank);
    return i < ranks.length - 1 ? ranks[i + 1] : null;
  }

  /** Rang précédent (ex: '6' → '5') */
  static prevRank(rank, ranks = CardDeck.RANKS52) {
    const i = ranks.indexOf(rank);
    return i > 0 ? ranks[i - 1] : null;
  }
}
