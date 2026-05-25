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
- 🔄 Après le jeu 10 : mise à jour globale / nouvelle feature impactant tous les jeux
- 🔄 Après le jeu 10 : mise à jour globale / nouvelle feature impactant tous les jeux

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
