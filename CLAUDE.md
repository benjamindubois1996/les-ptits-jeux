# RetroVault — CLAUDE.md

Fichier de référence lu automatiquement à chaque session du projet.

## Nommage des sessions
Convention : `les ptits jeux - XX nom_du_jeu`
Exemple : `les ptits jeux - 01 snake`, `les ptits jeux - 15 mastermind`

## Compteur de jeux
- 01 — Snake ✅
- 02 — Tetris ✅
- 03 — Minesweeper ✅
- 04 — Wordle ✅
- 05 — 2048 ✅
- 06 — Simon Says ✅
- 07 — Connect Four ✅
- 08 — Space Invaders ✅
- 09 — Doodle Jump ✅ *(remplace Breakout — doublon avec Arkanoid 45)*
- 10 — Blackjack ✅
- 🔄 Refactoring v2 ✅ — BaseGame, GameLoop, Random, GridUtils
- 11 — Pong ✅
- 12 — Pac-Man ✅
- 13 — Hangman ✅
- 14 — Battleship ✅
- 15 — Mastermind ✅
- 16 — Flappy Bird ✅
- 17 — Memory ✅
- 18 — Sudoku ✅
- 19 — Solitaire ✅
- 20 — Platformer 2D ✅
- 🔄 Refactoring v3 ✅ — GameShell header unifié (score/chrono/vies), Timer.js + Lives.js partagés, GameOverlay.js extrait, rejouer direct, scroll fix, chrome DOM redondant supprimé (contrôles inline, HUD dupliqués), score/lives câblés vers header pour tous les jeux, chrono s'arrête sur game:over/won/win
- 21 — Bubble Shooter ✅
- 22 — Asteroids ✅
- 23 — Frogger ✅
- 24 — Dames (Checkers) ✅
- 25 — Yahtzee ✅
- 26 — Sokoban ✅
- 27 — Reversi (Othello) ✅ *(remplace Nonogram — trop obscur)*
- 28 — Mahjong Solitaire ✅
- 29 — Lunar Lander ✅
- 30 — Pinball ✅
- 31 — Whack-a-Mole ✅
- 32 — Taquin (15-puzzle) ✅
- 33 — Typing Rush ✅
- 34 — Tower Defense ✅
- 35 — Gem Crush (Match 3) ✅
- 36 — Plinko ✅ *(remplace Farkle — jeu de dés trop obscur)*
- 37 — Pipe Dream (tuyaux à relier) ✅
- 38 — Tron (moto-lumière) ✅
- 39 — Flood It (inondation de couleurs) ✅
- 40 — Mots Mêlés (word search) ✅
- 41 — Galaga ✅
- 42 — Missile Command ✅
- 43 — Centipede ✅
- 44 — Bomberman ✅
- 45 — Arkanoid ✅
- 46 — Dig Dug
- 47 — Q*bert
- 48 — Lemmings
- 49 — Dino Runner
- 50 — Defender
- 51 — Qix
- 52 — Lights Out
- 53 — Rush Hour
- 54 — Nonogram / Picross
- 55 — Nurikabe
- 56 — Nim
- 57 — Blokus
- 58 — Kakuro
- 59 — Hashi / Ponts
- 60 — Jeu de la Vie (Conway)
- 61 — Dr. Mario
- 62 — Puyo Puyo
- 63 — Columns
- 64 — Boggle
- 65 — Anagrammes
- 66 — Mini Mots Croisés
- 67 — Air Hockey
- 68 — Billard 8-ball
- 69 — Fléchettes (Darts 501)
- 70 — Mini Golf
- 71 — Poker Texas Hold'em
- 72 — Spider Solitaire
- 73 — Hearts / Coeurs
- 74 — Rummy
- 75 — Belote
- 76 — Cribbage
- 77 — Bowling
- 78 — Basketball
- 79 — Plinko
- 80 — Échecs
- 81 — Go (9×9)
- 82 — Mancala / Awalé
- 83 — Backgammon
- 84 — Stratego lite
- 85 — Hex
- 86 — Dobble lite
- 87 — Angry Birds lite
- 88 — Tank Battle
- 89 — Spacewar
- 90 — Ski Slalom
- 91 — Moto Trial
- 92 — Jigsaw Puzzle
- 93 — Panel de Pon
- 94 — Tamagotchi lite
- 95 — Idle Clicker
- 96 — Labyrinthe procédural
- 97 — Réaction (test de réflexes)
- 98 — Memory Music
- 99 — Chip's Challenge lite
- 100 — RetroVault Boss

## Workflow Git
- `main` : prod, intouchable — jamais de commit direct
- `dev` : base de tout le travail
- Toute feature/fix part d'une branche créée depuis `dev`
- Convention : `feat/nom-jeu` ou `fix/description`
- Fusion toujours vers `dev`, puis `dev` → `main` pour la prod

### Commandes début de session
```bash
git checkout dev
git checkout -b feat/nom-jeu
```

### Commandes fin de session
```bash
git checkout dev
git merge feat/nom-jeu
git push
```

## Organisation des sessions
- **Cette session (centrale/QG)** : réflexions, architecture, décisions de direction
- **Une session par jeu ou modification majeure** : nommée selon la convention
- Petites corrections → même session/branche

## Workflow de développement d'un jeu

Chaque jeu suit ce cycle, sans exception :

### V1 basique — Livraison initiale (rôle de Claude)
- Créer : `NomJeu.js`, `NomJeuRenderer.js`, `nomjeu.config.json`
- Ajouter l'entrée dans `config.json` (root)
- Inclure un **sélecteur de mode** dans l'écran de démarrage — BASIQUE uniquement pour l'instant
- **Pas de preview, pas de vérification** — c'est Benjamin qui teste en local
- Aucun commit sans confirmation explicite

### Test (rôle de Benjamin)
- Benjamin lance l'app et joue
- Il remonte les bugs, ajustements, manques

### Corrections V1 (rôle de Claude)
- Corriger uniquement ce que Benjamin a signalé
- Ne pas anticiper des features non demandées

### Discussion V2+ (rôle commun)
- Après que la V1 est stable et commitée, discuter des améliorations
- Les nouveaux modes s'ajoutent dans le sélecteur de mode existant
- La V2 ne démarre que sur décision explicite de Benjamin

> Ce cycle s'applique à **tous les jeux** à partir du jeu 11.

## Règles importantes pour Claude

### Démarrage de session
- Ne PAS explorer ou relire tout le projet au démarrage
- Le `CLAUDE.md` et les fichiers mémoire contiennent tout le contexte nécessaire
- Ne lire un fichier spécifique que si la tâche en cours le nécessite

### Avant tout commit
- Ne JAMAIS lancer `git commit` sans confirmation explicite de Benjamin
- Toujours demander : "Tu as testé ? Je peau commiter ?"
- C'est Benjamin qui valide les tests, pas Claude

## Stack technique
- Vanilla HTML/CSS/JS — zéro dépendance
- Architecture modulaire (EventBus, Router, Services, UI)
- Config centralisée dans `config.json` (root)

## Architecture d'un jeu — Pattern obligatoire

### Fichiers
```
games/nom-jeu/
  NomJeu.js           ← logique pure (état, règles, EventBus)
  NomJeuRenderer.js   ← rendu DOM + styles injectés + overlays
  nomjeu.config.json  ← config du jeu (gameplay, scoring, controls)
```

### NomJeu.js — structure type
```js
import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

export default class NomJeu extends BaseGame {
  constructor(config) { super(config); this.state = this._buildFullState(); }
  _gameId() { return 'nom-jeu'; }

  async init() {
    this._setupEventBusBindings(); // OBLIGATOIRE — pause/restart depuis BaseGame
    this._bindControls();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }
  destroy() { super.destroy(); this._unbindControls(); }
  restart()  { this.state = { ...this._buildFullState(), status: 'idle' }; EventBus.emit('game:tick', { state: this.state, action: 'restart' }); }
}
```

### NomJeuRenderer.js — structure type
```js
import EventBus from '../../js/core/EventBus.js';

export default class NomJeuRenderer {
  constructor(game, viewport, config) { ... }

  init()    { this._injectStyles(); this._buildLayout(); this._bindEvents(); }
  destroy() { this._unbindEvents(); this._wrapper?.remove(); document.getElementById('xx-styles')?.remove(); }
}
```

## ⚠️ Layout — Règles critiques

### Le viewport GameShell
```css
.game-shell__viewport {
  display: flex;
  align-items: center;    /* ← centre verticalement */
  justify-content: center;
  position: relative;
  overflow: hidden;
  min-height: 500px;
}
```

**Conséquence directe** : `height:100%` sur un enfant flex NE FONCTIONNE PAS ici.
`align-self:stretch` peut parfois ne pas suffire non plus.

### ✅ Pattern qui marche — wrapper absolu
```css
.xx-wrapper {
  position: absolute; /* ← remplir le cadre de façon fiable */
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px;
  box-sizing: border-box;
  gap: 6px;
  font-family: Orbitron, monospace;
  overflow: hidden;
}
```

### ✅ Pattern overlay (écrans démarrage / victoire / défaite)
```css
.xx-overlay {
  position: absolute;
  inset: 0;
  background: rgba(5,8,15,0.94);
  backdrop-filter: blur(5px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center; /* ← centrer le contenu */
  gap: 10px;
  z-index: 20;
}
.xx-overlay.xx-overlay--hidden { display: none; }
```

### ✅ Board scrollable quand contenu variable
```css
.xx-board {
  flex: 1;           /* ← prend l'espace restant */
  overflow-y: auto;  /* ← scroll si contenu dépasse */
  width: 100%;
}
```

### ⚠️ Écran de démarrage — hauteur
Si l'overlay contient plus de 3 groupes d'options + titre + bouton, ça risque de dépasser.
Solutions :
- Réduire `gap` de l'overlay (8px suffit)
- Compresser les groupes (label + chips plus petits)
- Mettre 2 groupes côte à côte si besoin

## Standards v3 — Homogénéité (obligatoire pour tous les jeux, existants et futurs)

Décidé le 2026-06-16. S'applique rétroactivement aux jeux 1-20 et à tous les jeux suivants.

### 1. Numérotation et ordre
- `title` dans `config.json` commence toujours par le numéro : `"01 — Snake"`, `"15 — Mastermind"`
- Le tableau `games` de `config.json` est trié dans l'ordre des numéros (pas l'ordre de création)
- `id` technique (slug) ne change jamais — seul `title` porte le numéro

### 2. Menus homogènes
- Écran de démarrage : sélecteur **MODE** toujours en premier, **BASIQUE** sélectionné par défaut
- Même style visuel de paramétrage (chips + labels) pour tous les jeux
- Même écran de game over : icône, titre, score final, record éventuel, bouton rejouer
- **Contrôles minimum obligatoires : P = pause, R = restart** — à vérifier/ajouter sur tout nouveau jeu et corrigé rétroactivement si manquant (ex: Hangman et Battleship ne l'avaient pas → corrigés)
- **Exception** : si le jeu utilise les lettres A-Z comme input (Wordle, Hangman), **ne pas binder P/R au clavier** — ça casserait la frappe des lettres P et R. Dans ce cas, la pause reste accessible uniquement via le bouton ⏸ du GameShell (le restart via R reste possible hors phase de jeu actif, ex: écran gameover)
- Tout jeu doit émettre `game:paused` / `game:resumed` et son renderer doit les écouter pour afficher un écran pause cohérent
- **Écran de pause** : doit aussi passer par un module partagé (même règle que démarrage/game over, voir point 5) — pas encore fait, à inclure dans le refactor v3 en cours

### 3. Icône "prochaines améliorations"
- Champ `roadmap: []` dans `config.json` par jeu — liste d'idées d'amélioration non encore codées
- Géré une seule fois dans le composant partagé `js/ui/GameShell.js` : si `meta.roadmap.length`, un bouton 💡 apparaît dans les contrôles du jeu et ouvre un panneau listant les idées
- Pour un nouveau jeu sans roadmap définie : en proposer 2-3 lors de la livraison V1

### 4. Versioning
- `config.json` racine (`platform.version`) suit le nombre de jeux total — `1.0.0` réservé aux 100 jeux
- Chaque jeu a son propre champ `version` dans `config.json`, indépendant de la plateforme — démarre à `1.0.0` dès qu'il est fonctionnel/stable

### 5. Refactor modulaire
- Dès qu'un bout de code (overlay, board, chips, game over) est utilisé par 2 jeux ou plus → l'extraire dans un module partagé (`js/components/`, `js/ui/`, `js/utils/`)
- Ne pas dupliquer un pattern déjà standardisé (ex: BaseGame, GameLoop, Random, GridUtils du refactoring v2)
- Le composant `GameShell.js` reste le point d'entrée DOM commun à tous les jeux (header, score, pause/restart, roadmap)

## Sélecteur de mode — Convention

Chaque jeu a un sélecteur MODE dans l'écran de démarrage.
- **BASIQUE** : règles standards, sans complexité ajoutée
  - Pas de doublons dans les codes/solutions (Mastermind, etc.)
  - Règles les plus simples du jeu
- Les autres modes (EXPERT, INFINI, etc.) s'ajoutent en V2+

Dans le renderer, `_sel.mode` est toujours une string (`'basique'`, etc.).
Dans la logique, le mode pilote les règles : `const allowX = mode !== 'basique'`.

## Modules partagés prévus — jeux 26-30

**Règle** : un module = tout ce qui est réutilisable, logique OU graphique/rendu.
Changer un module à un endroit = changement répercuté partout.

### `js/core/Grid.js` *(à créer avant Sokoban)*
Grille 2D générique, logique pure, sans rendu.
```js
export default class Grid {
  constructor(rows, cols, fillValue = null)
  get(r, c)
  set(r, c, value)
  fill(value)
  clone()                        // copie profonde indépendante
  forEach(fn)                    // fn(value, r, c)
  find(fn)                       // premier { r, c, value } qui matche
  findAll(fn)                    // tous les { r, c, value } qui matchent
  inBounds(r, c)
  neighbors(r, c, diagonal = false)  // cellules adjacentes valides
  get rows / get cols
}
```
Utilisé par : **Sokoban** (plateau murs/cases/caisses/cibles), **Nonogram** (états des cellules : vide/rempli/croix), **Mahjong** (position des tuiles par couche).
Peut remplacer `GridUtils` existant à terme.

### `js/ui/CanvasGrid.js` *(à créer avant Sokoban)*
Renderer canvas générique pour une `Grid`. Configurable par cellule.
```js
export default class CanvasGrid {
  constructor({ cellSize, gap = 0, padding = 0 })

  // Dessine toutes les cellules — cellRenderer(ctx, x, y, size, value, r, c)
  draw(ctx, grid, cellRenderer)

  // Convertit une position canvas → { r, c } (utile pour les clics)
  cellAt(canvasX, canvasY)

  // Dimensions totales du canvas nécessaire pour cette grille
  canvasSize(grid)   // → { width, height }
}
```
Utilisé par : **Sokoban** (rendu du plateau), **Nonogram** (rendu de la grille de jeu).
Mahjong a un rendu de tuiles 3D empilées trop spécifique → renderer propre.

### `js/core/Vector2.js` *(à créer avant Lunar Lander)*
Math 2D pure, sans dépendance.
```js
export default class Vector2 {
  constructor(x = 0, y = 0)
  add(v)        // retourne un nouveau Vector2
  sub(v)
  scale(n)
  magnitude()
  normalize()
  dot(v)
  rotate(rad)   // rotation autour de l'origine
  clone()
  static fromAngle(rad, length = 1)
}
```
Utilisé par : **Lunar Lander** (vecteur poussée/vitesse), **Pinball** (vitesse balle, normales de collision), **Asteroids** si refactor.

### `js/core/Physics2D.js` *(à créer avant Lunar Lander)*
Intègre vitesse + gravité sur un corps ponctuel. Dépend de `Vector2`.
```js
export default class Physics2D {
  constructor({ gravity = 0, drag = 0 })
  // gravity : accélération en px/s² vers le bas (positif = vers le bas)
  // drag    : coefficient de freinage aérien (0 = aucun, 1 = arrêt immédiat)

  reset(x, y)             // position + vitesse à zéro
  applyForce(vx, vy)      // ajoute une impulsion (ex: poussée réacteur)
  update(dt)              // intègre position selon vitesse + gravité + drag
  get x / get y           // position courante
  get vx / get vy         // vitesse courante
}
```
Utilisé par : **Lunar Lander** (corps du vaisseau), **Pinball** (balle).

### `js/core/Particles.js` *(à créer avant Lunar Lander)*
Système de particules léger, rendu canvas uniquement. Dépend de `Vector2`.
```js
export default class Particles {
  emit(x, y, { count, angle, spread, speed, color, life, size })
  // angle  : direction centrale en radians
  // spread : dispersion angulaire (ex: Math.PI/4)
  // life   : durée de vie en ms

  update(dt)
  draw(ctx)
  clear()
}
```
Utilisé par : **Lunar Lander** (panache du réacteur, explosion crash), **Pinball** (étincelles sur bumpers et flippers).

---

> Ces 3 modules sont suffisants pour couvrir toute la physique des jeux 26-30.
> Si d'autres patterns se répètent entre Sokoban/Nonogram/Mahjong, les extraire en fin de session.

## Repo GitHub
https://github.com/benjamindubois1996/les-ptits-jeux
