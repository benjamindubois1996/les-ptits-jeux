import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

const MAP_W = 22, MAP_H = 16;

// Types de tuiles
const WALL = 0, FLOOR = 1, STAIRS = 2;

// Types d'ennemis
const ENEMY_TYPES = {
  goblin:   { name: 'Goblin',    char: 'g', hp: 8,  atk: 4,  def: 0, xp: 10, color: '#44cc44' },
  orc:      { name: 'Orc',       char: 'O', hp: 18, atk: 8,  def: 2, xp: 25, color: '#aa6600' },
  troll:    { name: 'Troll',     char: 'T', hp: 35, atk: 14, def: 5, xp: 50, color: '#555555' },
  skeleton: { name: 'Squelette', char: 'S', hp: 14, atk: 10, def: 1, xp: 30, color: '#eeeeaa' },
  dragon:   { name: '⭐ Dragon',  char: 'D', hp: 90, atk: 28, def: 10,xp:200, color: '#ff4400' },
};

const ITEM_TYPES = {
  potion:  { name: 'Potion',    char: '!', color: '#ff6688', effect: 'Restaure 20 HP' },
  elixir:  { name: 'Élixir',   char: '⊕', color: '#ff99ff', effect: 'Restaure 50 HP' },
  sword:   { name: 'Épée',     char: '/', color: '#aaccff', effect: '+3 ATK' },
  shield:  { name: 'Bouclier', char: ')', color: '#ffccaa', effect: '+2 DEF' },
  scroll:  { name: 'Parchemin',char: '?', color: '#ffee88', effect: 'Révèle la carte' },
};

const UPGRADE_POOL = [
  { type: 'hp',   label: '+15 HP max',        desc: 'Augmente votre vie maximale de 15' },
  { type: 'atk',  label: '+4 ATK',             desc: 'Augmente votre attaque de 4' },
  { type: 'def',  label: '+3 DEF',             desc: 'Augmente votre défense de 3' },
  { type: 'heal', label: 'Soin complet',       desc: 'Restaure tous vos points de vie' },
  { type: 'xpb',  label: 'XP × 1.5',          desc: 'Le prochain palier d\'XP est atteint plus vite' },
  { type: 'luck', label: 'Coup de chance',     desc: 'Vos dégâts minimum passent à 3' },
  { type: 'blade',label: 'Lame acérée +5 ATK', desc: 'Bonus d\'attaque massif' },
  { type: 'fort', label: 'Fortification +4 DEF', desc: 'Bonus de défense massif' },
];

let _eid = 0;

function mkPlayer() {
  return { x: 1, y: 1, hp: 30, maxHp: 30, atk: 6, def: 2, lvl: 1, xp: 0, xpNext: 20, luck: 0 };
}

function mkEnemy(type, x, y) {
  const t = ENEMY_TYPES[type];
  return { id: ++_eid, type, x, y, hp: t.hp, maxHp: t.hp, atk: t.atk, def: t.def, xp: t.xp, char: t.char, color: t.color };
}

function mkItem(type, x, y) {
  const t = ITEM_TYPES[type];
  return { id: ++_eid, type, x, y, char: t.char, color: t.color, name: t.name };
}

// Génération du donjon
function generateFloor(floorNum) {
  const map = Array.from({ length: MAP_H }, () => new Array(MAP_W).fill(WALL));
  const rooms = [];

  const NUM_ROOMS = 4 + Math.floor(Math.random() * 3);

  for (let i = 0; i < 60 && rooms.length < NUM_ROOMS; i++) {
    const rw = 4 + Math.floor(Math.random() * 5);
    const rh = 3 + Math.floor(Math.random() * 4);
    const rx = 1 + Math.floor(Math.random() * (MAP_W - rw - 2));
    const ry = 1 + Math.floor(Math.random() * (MAP_H - rh - 2));

    const overlap = rooms.some(r =>
      rx < r.x + r.w + 2 && rx + rw + 1 > r.x &&
      ry < r.y + r.h + 2 && ry + rh + 1 > r.y
    );
    if (!overlap) {
      rooms.push({ x: rx, y: ry, w: rw, h: rh });
      for (let y = ry; y < ry + rh; y++)
        for (let x = rx; x < rx + rw; x++)
          map[y][x] = FLOOR;
    }
  }

  // Corridors en L entre pièces consécutives
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1], b = rooms[i];
    const ax = Math.floor(a.x + a.w / 2), ay = Math.floor(a.y + a.h / 2);
    const bx = Math.floor(b.x + b.w / 2), by = Math.floor(b.y + b.h / 2);
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++)
      if (x >= 0 && x < MAP_W && ay >= 0 && ay < MAP_H) map[ay][x] = FLOOR;
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++)
      if (bx >= 0 && bx < MAP_W && y >= 0 && y < MAP_H) map[y][bx] = FLOOR;
  }

  // Escaliers dans la dernière pièce
  const lastRoom = rooms[rooms.length - 1] ?? { x: MAP_W - 3, y: MAP_H - 3, w: 2, h: 2 };
  const stairsX = Math.floor(lastRoom.x + lastRoom.w / 2);
  const stairsY = Math.floor(lastRoom.y + lastRoom.h / 2);
  if (floorNum < 5) map[stairsY][stairsX] = STAIRS;

  return { map, rooms, stairsX, stairsY };
}

// Ennemis selon le niveau
function spawnEnemies(floorNum, rooms) {
  const enemies = [];
  const pools = [
    ['goblin'],
    ['goblin', 'goblin', 'orc'],
    ['orc', 'orc', 'skeleton'],
    ['orc', 'troll', 'skeleton'],
    ['dragon'],
  ];
  const pool = pools[Math.min(floorNum - 1, pools.length - 1)];

  // Pas d'ennemis dans la pièce 0 (spawn du joueur)
  for (let ri = 1; ri < rooms.length; ri++) {
    const room = rooms[ri];
    const count = floorNum === 5 ? 1 : (1 + Math.floor(Math.random() * 2));
    for (let j = 0; j < count; j++) {
      const type = pool[Math.floor(Math.random() * pool.length)];
      const ex = room.x + 1 + Math.floor(Math.random() * (room.w - 2));
      const ey = room.y + 1 + Math.floor(Math.random() * (room.h - 2));
      enemies.push(mkEnemy(type, ex, ey));
    }
  }
  return enemies;
}

// Items aléatoires sur le sol
function spawnItems(floorNum, rooms, map) {
  const items = [];
  const itemCount = 1 + Math.floor(Math.random() * 2);
  const floors = [];
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++)
      if (map[y][x] === FLOOR) floors.push({ x, y });

  const types = ['potion', 'sword', 'shield', 'scroll', 'elixir'];
  for (let i = 0; i < itemCount; i++) {
    if (floors.length === 0) break;
    const idx = Math.floor(Math.random() * floors.length);
    const { x, y } = floors.splice(idx, 1)[0];
    const type = types[Math.floor(Math.random() * types.length)];
    items.push(mkItem(type, x, y));
  }
  return items;
}

function rollDamage(atk, def, luck = 0) {
  return Math.max(1, atk - def + Math.floor(Math.random() * 3) + luck);
}

export default class RoguelikeDungeon extends BaseGame {
  constructor(config) {
    super(config);
    this.state = null;
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  _gameId() { return 'roguelike-dungeon'; }

  _buildFullState(existingPlayer) {
    const floor = existingPlayer ? (this._currentFloor ?? 1) : 1;
    const { map, rooms, stairsX, stairsY } = generateFloor(floor);
    const player = existingPlayer ?? mkPlayer();
    // Placer le joueur dans la première pièce
    const r0 = rooms[0] ?? { x: 1, y: 1, w: 3, h: 3 };
    player.x = Math.floor(r0.x + r0.w / 2);
    player.y = Math.floor(r0.y + r0.h / 2);

    return {
      status:  'idle',
      phase:   'exploring',
      floor,
      map,
      player,
      enemies: spawnEnemies(floor, rooms),
      items:   spawnItems(floor, rooms, map),
      stairsX, stairsY,
      log:     [`Étage ${floor} — Bonne chance !`],
      upgradeOptions: null,
      score: existingPlayer ? (this.state?.score ?? 0) : 0,
    };
  }

  async init() {
    this._currentFloor = 1;
    this._setupEventBusBindings();
    this._bindControls();
    this.state = this._buildFullState(null);
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  _bindControls() {
    document.addEventListener('keydown', this._onKeyDown);
  }

  _unbindControls() {
    document.removeEventListener('keydown', this._onKeyDown);
  }

  _onKeyDown(e) {
    const s = this.state;
    if (s?.status !== 'playing') return;

    if (e.key === 'p' || e.key === 'P') { EventBus.emit('game:pause-toggle'); return; }
    if (e.key === 'r' || e.key === 'R') { EventBus.emit('game:restart'); return; }

    if (s.phase === 'upgrade') return; // géré par le renderer via applyUpgrade()

    const moves = {
      'ArrowUp': { dx: 0, dy: -1 }, 'w': { dx: 0, dy: -1 }, 'W': { dx: 0, dy: -1 },
      'ArrowDown':  { dx: 0, dy: 1 }, 's': { dx: 0, dy: 1 }, 'S': { dx: 0, dy: 1 },
      'ArrowLeft':  { dx: -1, dy: 0 }, 'a': { dx: -1, dy: 0 }, 'A': { dx: -1, dy: 0 },
      'ArrowRight': { dx: 1, dy: 0 }, 'd': { dx: 1, dy: 0 }, 'D': { dx: 1, dy: 0 },
    };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      this._playerTurn(s, move.dx, move.dy);
    }

    // Attendre
    if (e.key === '.') this._enemyTurn(s);
  }

  _playerTurn(s, dx, dy) {
    const { player } = s;
    const nx = player.x + dx, ny = player.y + dy;

    // Mur
    if (s.map[ny]?.[nx] === WALL || ny < 0 || ny >= MAP_H || nx < 0 || nx >= MAP_W) return;

    // Ennemi
    const enemy = s.enemies.find(e => e.x === nx && e.y === ny);
    if (enemy) {
      const dmg = rollDamage(player.atk, enemy.def, player.luck);
      enemy.hp -= dmg;
      const msg = [`Tu attaques ${enemy.type} (-${dmg} HP)`];
      if (enemy.hp <= 0) {
        player.xp += enemy.xp;
        s.score  += enemy.xp * 10;
        msg.push(`${enemy.type} vaincu ! +${enemy.xp} XP`);
        s.enemies = s.enemies.filter(e => e.id !== enemy.id);
        this._checkLevelUp(s, player);
        ScoreService.update(this._gameId(), s.score);
      } else {
        const cdmg = rollDamage(enemy.atk, player.def);
        player.hp -= cdmg;
        msg.push(`${enemy.type} riposte (-${cdmg} HP)`);
        if (player.hp <= 0) { this._playerDead(s); this._addLog(s, msg); return; }
      }
      this._addLog(s, msg);
      this._enemyTurn(s);
      this._checkFloorClear(s);
      EventBus.emit('game:tick', { state: s, action: 'tick' });
      return;
    }

    // Item
    const item = s.items.find(i => i.x === nx && i.y === ny);
    if (item) {
      this._pickItem(s, player, item);
      s.items = s.items.filter(i => i.id !== item.id);
    }

    // Escalier
    if (s.map[ny][nx] === STAIRS) {
      this._nextFloor(s);
      return;
    }

    // Mouvement normal
    player.x = nx;
    player.y = ny;
    this._enemyTurn(s);
    EventBus.emit('game:tick', { state: s, action: 'tick' });
  }

  _enemyTurn(s) {
    for (const enemy of s.enemies) {
      const { player } = s;
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;

      // Adjacent → attaque
      if (Math.abs(dx) + Math.abs(dy) === 1) {
        const dmg = rollDamage(enemy.atk, player.def);
        player.hp -= dmg;
        this._addLog(s, [`${enemy.type} t'attaque (-${dmg} HP)`]);
        if (player.hp <= 0) { this._playerDead(s); return; }
        continue;
      }

      // Déplacement vers joueur
      let mx = 0, my = 0;
      if (Math.abs(dx) >= Math.abs(dy)) {
        mx = Math.sign(dx);
      } else {
        my = Math.sign(dy);
      }

      const nx2 = enemy.x + mx, ny2 = enemy.y + my;
      if (s.map[ny2]?.[nx2] === FLOOR && !s.enemies.some(e => e.id !== enemy.id && e.x === nx2 && e.y === ny2)) {
        if (nx2 !== player.x || ny2 !== player.y) {
          enemy.x = nx2;
          enemy.y = ny2;
        }
      }
    }
  }

  _pickItem(s, player, item) {
    const msgs = [];
    switch (item.type) {
      case 'potion':  player.hp = Math.min(player.maxHp, player.hp + 20); msgs.push('Potion : +20 HP'); break;
      case 'elixir':  player.hp = Math.min(player.maxHp, player.hp + 50); msgs.push('Élixir : +50 HP'); break;
      case 'sword':   player.atk += 3; msgs.push('Épée équipée : +3 ATK'); break;
      case 'shield':  player.def += 2; msgs.push('Bouclier équipé : +2 DEF'); break;
      case 'scroll':  msgs.push('Parchemin lu — carte révélée'); break;
    }
    s.score += 50;
    ScoreService.update(this._gameId(), s.score);
    this._addLog(s, msgs);
  }

  _checkLevelUp(s, player) {
    while (player.xp >= player.xpNext) {
      player.xp -= player.xpNext;
      player.lvl++;
      player.xpNext = Math.floor(player.xpNext * 1.6);
      player.maxHp += 8;
      player.hp = player.maxHp;
      player.atk += 1;
      player.def += 1;
      this._addLog(s, [`★ Niveau ${player.lvl} ! +8 HP, +1 ATK, +1 DEF`]);
    }
  }

  _checkFloorClear(s) {
    if (s.enemies.length === 0 && s.floor === 5) {
      // Boss mort → victoire
      s.score += 5000;
      ScoreService.update(this._gameId(), s.score);
      s.status = 'won';
      const best = ScoreService.update(this._gameId(), s.score);
      EventBus.emit('game:won', { score: s.score, best });
    }
  }

  _nextFloor(s) {
    if (this._currentFloor >= 5) {
      // Victoire
      s.score += 5000;
      s.status = 'won';
      ScoreService.update(this._gameId(), s.score);
      const best = ScoreService.update(this._gameId(), s.score);
      EventBus.emit('game:won', { score: s.score, best });
      return;
    }

    // Proposer un upgrade tous les 2 étages
    if (this._currentFloor % 2 === 0 || this._currentFloor === 1) {
      s.upgradeOptions = this._pickUpgrades();
      s.phase = 'upgrade';
      EventBus.emit('game:tick', { state: s, action: 'upgrade' });
    } else {
      this._goNextFloor(s);
    }
  }

  _pickUpgrades() {
    const pool = [...UPGRADE_POOL].sort(() => Math.random() - 0.5);
    return pool.slice(0, 3);
  }

  applyUpgrade(type) {
    const s = this.state;
    if (s.phase !== 'upgrade') return;
    const { player } = s;

    switch (type) {
      case 'hp':    player.maxHp += 15; player.hp = Math.min(player.hp + 15, player.maxHp); break;
      case 'atk':   player.atk += 4; break;
      case 'def':   player.def += 3; break;
      case 'heal':  player.hp = player.maxHp; break;
      case 'xpb':   player.xpNext = Math.max(5, Math.floor(player.xpNext * 0.65)); break;
      case 'luck':  player.luck = Math.max(player.luck, 3); break;
      case 'blade': player.atk += 5; break;
      case 'fort':  player.def += 4; break;
    }

    s.upgradeOptions = null;
    s.phase = 'exploring';
    this._goNextFloor(s);
  }

  _goNextFloor(s) {
    this._currentFloor++;
    const saved = { ...s.player };
    const savedScore = s.score;
    const next = this._buildFullState(saved);
    next.status = 'playing';
    next.score  = savedScore;
    next.log    = [`Étage ${this._currentFloor} — Les ennemis sont plus forts...`];
    this.state  = next;
    EventBus.emit('game:tick', { state: this.state, action: 'next-floor' });
  }

  _playerDead(s) {
    s.player.hp = 0;
    s.status    = 'over';
    const best  = ScoreService.update(this._gameId(), s.score);
    EventBus.emit('game:over', { score: s.score, best });
  }

  _addLog(s, msgs) {
    s.log.push(...msgs);
    if (s.log.length > 6) s.log = s.log.slice(-6);
  }

  start() {
    const s = this.state;
    s.status = 'playing';
    this._addLog(s, ['Utilisez WASD ou les flèches pour vous déplacer.', 'Marchez sur les ennemis pour attaquer.']);
    EventBus.emit('game:tick', { state: s, action: 'play' });
  }

  restart() {
    this._currentFloor = 1;
    this.state = this._buildFullState(null);
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  destroy() {
    this._unbindControls();
    super.destroy();
  }
}
