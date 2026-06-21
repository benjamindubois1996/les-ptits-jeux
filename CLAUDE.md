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
- 09 — Breakout ✅
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
- 21 à 25 — à définir (session batch unique)
- 26 à 30 — à définir (session batch unique)

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

## Repo GitHub
https://github.com/benjamindubois1996/les-ptits-jeux
