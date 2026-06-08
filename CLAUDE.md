# RetroVault — CLAUDE.md

Fichier de référence lu automatiquement à chaque session du projet.

## Nommage des sessions
Convention : `les ptits jeux - XX nom_du_jeu`
Exemple : `les ptits jeux - 01 snake`, `les ptits jeux - 02 tetris`

## Compteur de jeux
- 01 — Snake ✅ (fait)
- 02 — Tetris ✅ (fait)
- 03 — Minesweeper ✅ (fait)
- 04 — Wordle ✅ (fait)
- 05 — 2048 ✅ (fait)
- 06 — Simon Says ✅ (fait)
- 07 — Connect Four ✅ (fait)
- 08 — Space Invaders ✅ (fait)
- 09 — Breakout ✅ (fait)
- 10 — Blackjack ✅ (fait)
- 🔄 Refactoring v2 ✅ (fait) — BaseGame, GameLoop, Random, GridUtils
- 11 — Pong 🔄 (V1 en cours)
- 12 — Pac-Man
- 13 — Hangman
- 14 — Battleship
- 15 — Mastermind
- 16 — Flappy Bird
- 17 — Memory
- 18 — Sudoku
- 19 — Solitaire
- 20 — Platformer 2D
- 🔄 Après le jeu 20 : mise à jour globale v3

## Workflow Git
- `main` : prod, intouchable — jamais de commit direct
- `dev` : base de tout le travail
- Toute feature/fix part d'une branche créée depuis `dev`
- Convention de nommage des branches : `feat/nom-jeu` ou `fix/description`
- Fusion toujours vers `dev`, puis `dev` → `main` quand c'est prêt pour la prod

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
- **Une session par jeu ou modification majeure** : nommée selon la convention ci-dessus
- Les petites corrections peuvent être regroupées dans une même session/branche

## Workflow de développement d'un jeu

Chaque jeu suit ce cycle, sans exception :

### V1 basique — Livraison initiale (rôle de Claude)
- Créer les fichiers du jeu : `NomJeu.js`, `NomJeuRenderer.js`, `nomjeu.config.json`
- Ajouter l'entrée dans `config.json`
- Inclure un **sélecteur de mode** dans l'écran de démarrage, avec uniquement `BASIQUE` pour l'instant
- **Pas de preview, pas de vérification** — c'est Benjamin qui teste en local
- Aucun commit sans confirmation explicite

### Test (rôle de Benjamin)
- Benjamin lance l'app et joue
- Il remonte les bugs, ajustements, manques

### Corrections V1 (rôle de Claude)
- Corriger uniquement ce que Benjamin a signalé
- Ne pas anticiper des features non demandées

### Discussion V2+ (rôle commun)
- Après que la V1 est stable et commitée, discuter des améliorations (nouveaux modes, animations, effets, etc.)
- Les nouveaux modes apparaissent dans le sélecteur de mode déjà en place
- La V2 ne démarre que sur décision explicite de Benjamin

> Ce cycle s'applique à **tous les jeux** à partir du jeu 11.

## Règles importantes pour Claude

### Démarrage de session
- Ne PAS explorer ou relire tout le projet au démarrage
- Le `CLAUDE.md` et les fichiers mémoire contiennent tout le contexte nécessaire
- Ne lire un fichier spécifique que si la tâche en cours le nécessite explicitement

### Avant tout commit
- Ne JAMAIS lancer `git commit` sans confirmation explicite de Benjamin
- Toujours demander : "Tu as testé ? Je peux commiter ?"
- C'est Benjamin qui valide les tests, pas Claude

## Stack technique
- Vanilla HTML/CSS/JS — zéro dépendance
- Architecture modulaire (EventBus, Router, Services, UI)
- Config centralisée dans `config.json`

## Repo GitHub
https://github.com/benjamindubois1996/les-ptits-jeux
