import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

export default class Solitaire extends BaseGame {

  constructor(config) {
    super(config);
    this.state = this._buildFullState();
    this._history = [];
  }

  _gameId() { return 'solitaire'; }

  /* ============================================================
     CYCLE DE VIE
     ============================================================ */

  async init() {
    this._setupEventBusBindings();
    this._bindControls();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() { super.destroy(); this._unbindControls(); }

  restart() {
    this.state = { ...this._buildFullState(), status: 'idle' };
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  /* ============================================================
     ÉTAT
     ============================================================ */

  _buildFullState() {
    return {
      status:         'idle',  // idle | playing | won | gameover
      mode:           'basique',
      score:          0,
      scoreDelta:     0,       // dernier changement de score (pour animation)
      moves:          0,
      elapsedSeconds: 0,
      stock:          [],
      waste:          [],
      foundations:    [[], [], [], []],
      tableau:        [[], [], [], [], [], [], []],
      selected:       null,
    };
  }

  /* ============================================================
     DÉMARRAGE
     ============================================================ */

  start(options = {}) {
    const mode = options.mode ?? 'basique';
    let tableau, stock;
    let attempts = 0;

    do {
      const deck = this._createDeck();
      this._shuffle(deck);
      ({ tableau, stock } = this._deal(deck));
      attempts++;
    } while (!this._hasInitialMoves(tableau, stock) && attempts < 80);

    this.state = {
      ...this._buildFullState(),
      status: 'playing',
      mode,
      stock,
      tableau,
    };
    this._history = [];

    EventBus.emit('game:tick', { state: this.state, action: 'new-game' });
  }

  /* ============================================================
     DRAG AND DROP
     ============================================================ */

  // Appelé au pointerdown sur une carte
  startDrag(source, pileIndex, cardIndex) {
    const { state } = this;
    if (state.status !== 'playing') return false;
    this._trySelect(source, pileIndex, cardIndex);
    return !!state.selected;
  }

  // Appelé au pointerup sur une cible valide
  endDrag(targetSource, targetPileIndex) {
    const { state } = this;
    if (!state.selected) return false;
    let moved = false;
    if (targetSource === 'foundation') moved = this._execMoveToFoundation(targetPileIndex);
    else if (targetSource === 'tableau') moved = this._execMoveToTableau(targetPileIndex);
    if (!moved) {
      this._clearSelection();
      EventBus.emit('game:tick', { state, action: 'cancel' });
    }
    return moved;
  }

  // Appelé si le drop n'a atterri nulle part de valide
  cancelDrag() {
    this._clearSelection();
    EventBus.emit('game:tick', { state: this.state, action: 'cancel' });
  }

  // Clic simple : sélection ou déplacement
  handleCardClick(source, pileIndex, cardIndex) {
    const { state } = this;
    if (state.status !== 'playing') return;
    const sel = state.selected;

    if (!sel) {
      this._trySelect(source, pileIndex, cardIndex);
      EventBus.emit('game:tick', { state, action: 'select' });
      return;
    }

    // Même carte → déselectionner
    if (sel.source === source && sel.pileIndex === pileIndex &&
        (source !== 'tableau' || sel.cardIndex === cardIndex)) {
      this._clearSelection();
      EventBus.emit('game:tick', { state, action: 'cancel' });
      return;
    }

    // Essayer de déplacer
    let moved = false;
    if (source === 'foundation') {
      moved = this._execMoveToFoundation(pileIndex);
    } else if (source === 'tableau') {
      const target = state.tableau[pileIndex][cardIndex];
      if (target && !target.faceUp) return;
      moved = this._execMoveToTableau(pileIndex);
    }
    if (!moved) this._trySelect(source, pileIndex, cardIndex);
  }

  // Clic sur colonne/fondation vide avec une sélection active
  clickPile(source, pileIndex) {
    const { state } = this;
    if (state.status !== 'playing' || !state.selected) return;
    if (source === 'tableau')    this._execMoveToTableau(pileIndex);
    else if (source === 'foundation') this._execMoveToFoundation(pileIndex);
  }

  /* ============================================================
     ACTIONS PUBLIQUES
     ============================================================ */

  clickStock() {
    const { state } = this;
    if (state.status !== 'playing') return;
    this._clearSelection();

    if (state.stock.length > 0) {
      this._pushHistory();
      const card = state.stock.pop();
      card.faceUp = true;
      state.waste.push(card);
    } else if (state.waste.length > 0) {
      this._pushHistory();
      state.stock = [...state.waste].reverse().map(c => ({ ...c, faceUp: false }));
      state.waste = [];
    } else {
      return;
    }

    state.moves++;
    EventBus.emit('game:tick', { state, action: 'stock' });
    this._checkDeadlock();
  }

  // Double-clic : envoyer la carte sur la fondation appropriée
  autoMoveToFoundation(source, pileIndex, cardIndex) {
    const { state } = this;
    if (state.status !== 'playing') return;

    let card;
    if (source === 'waste') {
      if (!state.waste.length) return;
      card = state.waste[state.waste.length - 1];
      cardIndex = state.waste.length - 1;
    } else if (source === 'tableau') {
      const pile = state.tableau[pileIndex];
      if (!pile[cardIndex]?.faceUp || cardIndex !== pile.length - 1) return;
      card = pile[cardIndex];
    } else {
      return;
    }

    const suitIdx = this.config.gameplay.suits.indexOf(card.suit);
    if (!this._canPlaceOnFoundation(card, state.foundations[suitIdx])) return;

    state.selected = { source, pileIndex, cardIndex, cards: [card] };
    this._execMoveToFoundation(suitIdx);
  }

  /* ============================================================
     LOGIQUE INTERNE — SÉLECTION / DÉPLACEMENT
     ============================================================ */

  _trySelect(source, pileIndex, cardIndex) {
    const { state } = this;

    if (source === 'waste') {
      if (!state.waste.length) { this._clearSelection(); return; }
      const ci = state.waste.length - 1;
      state.selected = { source: 'waste', pileIndex: 0, cardIndex: ci, cards: [state.waste[ci]] };

    } else if (source === 'tableau') {
      const pile = state.tableau[pileIndex];
      if (!pile[cardIndex]?.faceUp) { this._clearSelection(); return; }
      state.selected = { source: 'tableau', pileIndex, cardIndex, cards: pile.slice(cardIndex) };

    } else if (source === 'foundation') {
      const pile = state.foundations[pileIndex];
      if (!pile.length) { this._clearSelection(); return; }
      const ci = pile.length - 1;
      state.selected = { source: 'foundation', pileIndex, cardIndex: ci, cards: [pile[ci]] };
    }
  }

  _execMoveToTableau(targetPileIndex) {
    const { state } = this;
    const sel = state.selected;
    if (!sel) return false;

    const targetPile = state.tableau[targetPileIndex];
    if (!this._canPlaceOnTableau(sel.cards[0], targetPile)) return false;

    this._pushHistory();
    this._removeFromSource(sel);
    sel.cards.forEach(c => targetPile.push(c));

    const delta = sel.source === 'waste' ? this.config.scoring.wasteToTableau : 0;
    state.score += delta;
    state.scoreDelta = delta;
    state.moves++;
    this._clearSelection();
    EventBus.emit('game:tick', { state, action: 'move' });
    this._checkWin();
    if (state.status === 'playing') this._checkDeadlock();
    return true;
  }

  _execMoveToFoundation(targetPileIndex) {
    const { state } = this;
    const sel = state.selected;
    if (!sel || sel.cards.length !== 1) return false;

    const foundPile = state.foundations[targetPileIndex];
    if (!this._canPlaceOnFoundation(sel.cards[0], foundPile)) return false;

    const wasFoundation = sel.source === 'foundation';
    this._pushHistory();
    this._removeFromSource(sel);
    foundPile.push(sel.cards[0]);

    const delta = wasFoundation ? 0 : this.config.scoring.tableauToFoundation;
    state.score += delta;
    state.scoreDelta = delta;
    state.moves++;
    this._clearSelection();
    EventBus.emit('game:tick', { state, action: 'move' });
    this._checkWin();
    if (state.status === 'playing') this._checkDeadlock();
    return true;
  }

  _removeFromSource(sel) {
    const { state } = this;

    if (sel.source === 'waste') {
      state.waste.pop();

    } else if (sel.source === 'tableau') {
      const srcPile = state.tableau[sel.pileIndex];
      srcPile.splice(sel.cardIndex);
      if (srcPile.length > 0 && !srcPile[srcPile.length - 1].faceUp) {
        srcPile[srcPile.length - 1].faceUp = true;
        const flip = this.config.scoring.flipCard;
        state.score += flip;
        state.scoreDelta = flip;
      }

    } else if (sel.source === 'foundation') {
      state.foundations[sel.pileIndex].pop();
      const pen = this.config.scoring.foundationToTableau; // négatif
      state.score += pen;
      state.scoreDelta = pen;
    }
  }

  /* ============================================================
     RÈGLES
     ============================================================ */

  _canPlaceOnTableau(card, pile) {
    if (pile.length === 0) return card.value === 13;
    const top = pile[pile.length - 1];
    return this._isRed(card) !== this._isRed(top) && card.value === top.value - 1;
  }

  _canPlaceOnFoundation(card, pile) {
    if (pile.length === 0) return card.value === 1;
    const top = pile[pile.length - 1];
    return card.suit === top.suit && card.value === top.value + 1;
  }

  _isRed(card) {
    return this.config.gameplay.redSuits.includes(card.suit);
  }

  /* ============================================================
     FIN DE PARTIE
     ============================================================ */

  _checkWin() {
    if (!this.state.foundations.every(p => p.length === 13)) return;
    this.state.status = 'won';
    ScoreService.submit(this._gameId(), this.state.score, {
      moves:   this.state.moves,
      mode:    this.state.mode,
      seconds: this.state.elapsedSeconds,
    });
    EventBus.emit('game:tick', { state: this.state, action: 'win' });
  }

  _checkDeadlock() {
    if (this.state.status !== 'playing') return;
    if (this._hasAnyMove()) return;
    this.state.status = 'gameover';
    EventBus.emit('game:tick', { state: this.state, action: 'gameover' });
  }

  /* ============================================================
     VÉRIFICATION DES COUPS POSSIBLES
     ============================================================ */

  _hasAnyMove() {
    const { state } = this;

    // Peut encore piocher
    if (state.stock.length > 0 || state.waste.length > 0) return true;

    // Vérifier les déplacements depuis le tableau
    for (let i = 0; i < state.tableau.length; i++) {
      const pile = state.tableau[i];
      if (!pile.length) continue;

      const firstFaceUp = pile.findIndex(c => c.faceUp);
      if (firstFaceUp === -1) continue;

      for (let ci = firstFaceUp; ci < pile.length; ci++) {
        const card = pile[ci];

        // Vers fondation (seulement la carte du dessus)
        if (ci === pile.length - 1 &&
            state.foundations.some(f => this._canPlaceOnFoundation(card, f))) return true;

        // Vers une autre colonne
        for (let j = 0; j < state.tableau.length; j++) {
          if (i === j) continue;
          if (this._canPlaceOnTableau(card, state.tableau[j])) return true;
        }
      }
    }

    // Vérifier depuis les fondations
    for (let i = 0; i < state.foundations.length; i++) {
      const pile = state.foundations[i];
      if (!pile.length) continue;
      const top = pile[pile.length - 1];
      if (state.tableau.some(t => this._canPlaceOnTableau(top, t))) return true;
    }

    return false;
  }

  _hasInitialMoves(tableau, stock) {
    // Peut-on jouer un As ?
    const allCards = tableau.map(p => p[p.length - 1]).concat(stock.slice(-1));
    if (allCards.some(c => c?.faceUp && c.value === 1)) return true;
    if (stock.length > 0 && stock[stock.length - 1].value === 1) return true;

    // Y a-t-il au moins un déplacement possible dans le tableau ?
    for (let i = 0; i < tableau.length; i++) {
      const top = tableau[i][tableau[i].length - 1];
      if (!top?.faceUp) continue;
      for (let j = 0; j < tableau.length; j++) {
        if (i === j) continue;
        const tgt = tableau[j][tableau[j].length - 1];
        if (tableau[j].length === 0 && top.value === 13) return true;
        if (tgt?.faceUp && this._isRed(top) !== this._isRed(tgt) && top.value === tgt.value - 1) return true;
      }
    }

    // La première carte du talon est-elle jouable ?
    if (stock.length > 0) {
      const card = stock[stock.length - 1];
      if (tableau.some(pile => {
        const t = pile[pile.length - 1];
        if (!t?.faceUp) return false;
        return this._isRed(card) !== this._isRed(t) && card.value === t.value - 1;
      })) return true;
    }

    return false;
  }

  /* ============================================================
     UTILITAIRES
     ============================================================ */

  _createDeck() {
    const { suits } = this.config.gameplay;
    const deck = [];
    for (const suit of suits) {
      for (let v = 1; v <= 13; v++) deck.push({ suit, value: v, faceUp: false });
    }
    return deck;
  }

  _deal(deck) {
    const tableau = [[], [], [], [], [], [], []];
    let idx = 0;
    for (let col = 0; col < 7; col++) {
      for (let row = 0; row <= col; row++) {
        const card = { ...deck[idx++] };
        card.faceUp = (row === col);
        tableau[col].push(card);
      }
    }
    const stock = deck.slice(idx).map(c => ({ ...c, faceUp: false }));
    return { tableau, stock };
  }

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  _clearSelection() { this.state.selected = null; }

  /* ============================================================
     HISTORIQUE / UNDO
     ============================================================ */

  _pushHistory() {
    const { state } = this;
    this._history.push({
      score:       state.score,
      moves:       state.moves,
      stock:       JSON.parse(JSON.stringify(state.stock)),
      waste:       JSON.parse(JSON.stringify(state.waste)),
      foundations: JSON.parse(JSON.stringify(state.foundations)),
      tableau:     JSON.parse(JSON.stringify(state.tableau)),
    });
    if (this._history.length > 20) this._history.shift();
  }

  undo() {
    if (this.state.status !== 'playing' || !this._history.length) return;
    const snap = this._history.pop();
    Object.assign(this.state, snap, { selected: null, scoreDelta: 0 });
    EventBus.emit('game:tick', { state: this.state, action: 'undo' });
  }

  /* ============================================================
     CONTRÔLES
     ============================================================ */

  _bindControls() {
    this._onKey = (e) => {
      if (this.state.status === 'idle') return;
      const { keyboard } = this.config.controls;
      if (keyboard.pause.includes(e.code))   EventBus.emit('game:pause-toggle');
      if (keyboard.restart.includes(e.code)) EventBus.emit('game:restart');
      if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.undo(); }
    };
    window.addEventListener('keydown', this._onKey);
  }

  _unbindControls() {
    if (this._onKey) window.removeEventListener('keydown', this._onKey);
  }
}
