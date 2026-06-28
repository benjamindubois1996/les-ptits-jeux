import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import GameLoop     from '../../js/core/GameLoop.js';

export const TILE = 20;
export const COLS = 32, ROWS = 15;
export const CW = COLS * TILE, CH = ROWS * TILE; // 640 x 300

// Tile IDs
const T = { AIR:0, SOLID:1, PLAT:2, SPIKE:3 };

function room(rows) {
  return rows.map(r => [...r].map(ch => ({ '#':T.SOLID,'=':T.PLAT,'S':T.SPIKE }[ch] ?? T.AIR)));
}

// ── 8 rooms — exits toujours sur 2 rangées (rows 12-13) pour que PH=24 passe ──
// Sorties droite/gauche : col 31 ou col 0 AIR sur rows 12-13
// Sortie haut : gap cols 14-15 sur row 0    Sortie bas : gap cols 14-15 sur row 14
const ROOM_DEFS = [
  // 0 — START  →  right:1
  {
    name: "Grotte d'entrée",
    tiles: room([
      '################################',
      '#                              #',
      '#   ====        ====           #',
      '#                              #',
      '#                 ====         #',
      '#   ====                       #',
      '#                   ====       #',
      '#       ====                   #',
      '#                              #',
      '#   ====            ====       #',
      '#                              #',
      '#                              #',
      '#                               ',
      '#                               ',
      '################################',
    ]),
    exits: { right: 1 },
    enemies: [
      { type:'walker', tx:10, ty:13 },
      { type:'walker', tx:22, ty:13 },
    ],
    pickups: [],
  },
  // 1 — Tunnels  left:0  right:2
  {
    name: 'Tunnels creusés',
    tiles: room([
      '################################',
      '#                              #',
      '#   ====            ====       #',
      '#                              #',
      '#        ====  ====            #',
      '#                              #',
      '#   ====                ====   #',
      '#                              #',
      '#        ====  ====            #',
      '#                              #',
      '#   ====            ====       #',
      '#                              #',
      '                                ',
      '                                ',
      '################################',
    ]),
    exits: { left:0, right:2 },
    enemies: [
      { type:'walker', tx:5,  ty:13 },
      { type:'flier',  tx:16, ty:4  },
      { type:'walker', tx:27, ty:13 },
    ],
    pickups: [],
  },
  // 2 — Double Saut  left:1  right:3  pickup: double-jump (row 3, col 14)
  {
    name: 'Chambre du Double Saut',
    tiles: room([
      '################################',
      '#                              #',
      '#   ====                       #',
      '#             P                #',
      '#   ====   ========    ====    #',
      '#                              #',
      '#              ====            #',
      '#                              #',
      '#   ====                ====   #',
      '#                              #',
      '#              ====            #',
      '#                              #',
      '                                ',
      '                                ',
      '################################',
    ]),
    exits: { left:1, right:3 },
    enemies: [
      { type:'walker', tx:5,  ty:13 },
      { type:'flier',  tx:20, ty:6  },
    ],
    pickups: [
      { type:'double-jump', tx:14, ty:3 },
    ],
  },
  // 3 — Puits montant  left:2  right:4  up:5 (nécessite double-jump)
  {
    name: 'Puits montant',
    tiles: room([
      '##############  ################',
      '#                              #',
      '#   ====                       #',
      '#                   ====       #',
      '#   ====                       #',
      '#                   ====       #',
      '#   ====                       #',
      '#                   ====       #',
      '#   ====                       #',
      '#                   ====       #',
      '#   ====                       #',
      '#                              #',
      '                                ',
      '                                ',
      '################################',
    ]),
    exits: { left:2, right:4, up:5 },
    enemies: [
      { type:'walker', tx:5,  ty:13 },
      { type:'flier',  tx:20, ty:3  },
      { type:'walker', tx:25, ty:13 },
    ],
    pickups: [],
  },
  // 4 — Couloir du Dash  left:3  right:6  pickup: dash (row 2, col 3)
  {
    name: 'Couloir du Dash',
    tiles: room([
      '################################',
      '#                              #',
      '#   P                          #',
      '#  ====                        #',
      '#                              #',
      '#         ====      ====       #',
      '#                              #',
      '#   ====      ====      ====   #',
      '#                              #',
      '#         ====      ====       #',
      '#                              #',
      '#                              #',
      '                                ',
      '                                ',
      '################################',
    ]),
    exits: { left:3, right:6 },
    enemies: [
      { type:'walker', tx:20, ty:13 },
      { type:'flier',  tx:16, ty:5  },
    ],
    pickups: [
      { type:'dash', tx:3, ty:2 },
    ],
  },
  // 5 — Sommet étoilé  down:3  right:7
  {
    name: 'Sommet étoilé',
    tiles: room([
      '################################',
      '#                              #',
      '#   ====         ====          #',
      '#                              #',
      '#        ====         ====     #',
      '#                              #',
      '#   ====         ====          #',
      '#                              #',
      '#        ====         ====     #',
      '#                              #',
      '#   ====         ====          #',
      '#                              #',
      '#                               ',
      '#                               ',
      '##############  ################',
    ]),
    exits: { down:3, right:7 },
    enemies: [
      { type:'flier',  tx:10, ty:3  },
      { type:'flier',  tx:22, ty:7  },
      { type:'walker', tx:16, ty:13 },
    ],
    pickups: [],
  },
  // 6 — Antichambre du boss  left:4  right:7
  {
    name: 'Antichambre du boss',
    tiles: room([
      '################################',
      '#                              #',
      '#  ====      ====      ====    #',
      '#                              #',
      '#                              #',
      '#  ====      ====      ====    #',
      '#                              #',
      '#                              #',
      '#  ====      ====      ====    #',
      '#                              #',
      '#                              #',
      '#                              #',
      '                                ',
      '                                ',
      '################################',
    ]),
    exits: { left:4, right:7 },
    enemies: [
      { type:'walker', tx:5,  ty:13 },
      { type:'walker', tx:16, ty:13 },
      { type:'walker', tx:27, ty:13 },
      { type:'flier',  tx:10, ty:4  },
    ],
    pickups: [],
  },
  // 7 — BOSS  left:6
  {
    name: 'Antre du Boss',
    tiles: room([
      '################################',
      '#                              #',
      '#                              #',
      '#  ====              ====      #',
      '#                              #',
      '#                              #',
      '#                              #',
      '#      ====      ====          #',
      '#                              #',
      '#                              #',
      '#                              #',
      '#  ====              ====      #',
      '                                ',
      '                                ',
      '################################',
    ]),
    exits: { left:6 },
    enemies: [],
    pickups: [],
    boss: true,
  },
];

const GRAVITY   = 0.55;
const JUMP_V    = -11.5;
const WALK_SPD  = 3.5;
const DASH_SPD  = 11;
const DASH_DUR  = 14; // frames
const INV_DUR   = 90; // frames invincibility after hit
export const PW = 16, PH = 24; // player dimensions

function mkPlayer() {
  return {
    x: TILE * 2, y: TILE * 12,
    vx: 0, vy: 0,
    onGround: false,
    facingRight: true,
    jumpCount: 0,
    hp: 3,
    maxHp: 3,
    invTimer: 0,
    dashTimer: 0,
    dashing: false,
    dashDir: 1,
    abilities: { doubleJump: false, dash: false },
    score: 0,
  };
}

function mkEnemies(spawns, roomId) {
  return spawns.map((s, i) => ({
    id: `${roomId}-${i}`,
    type: s.type,
    x: s.tx * TILE,
    y: s.ty * TILE - (s.type === 'flier' ? 0 : PH),
    vx: s.type === 'flier' ? 1.2 : 1.5,
    vy: 0,
    hp: 1,
    dead: false,
    baseY: s.ty * TILE - (s.type === 'flier' ? 0 : PH),
    floatT: Math.random() * Math.PI * 2,
  }));
}

function mkBoss() {
  return {
    x: CW / 2 - 30, y: TILE * 10,
    vx: 1.8, vy: 0,
    hp: 8, maxHp: 8,
    dead: false,
    invTimer: 0,
    phase: 1,
    jumpTimer: 0,
    projectiles: [],
  };
}

export default class Metroidvania extends BaseGame {
  constructor(config) {
    super(config);
    this.state = null;
    this._loop = new GameLoop(() => this._tick());
    this._keys = {};
    this._justPressed = {};
    this._prevKeys = {};
  }

  _gameId() { return 'metroidvania'; }

  async init() {
    this._setupEventBusBindings();
    this.state = this._buildFullState();
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() { super.destroy(); this._loop.destroy(); this._unbindControls(); }

  start(options = {}) {
    this._loop.stop();
    this.state = this._buildFullState();
    this.state.status = 'playing';
    this._bindControls();
    this._loop.start(16);
    EventBus.emit('game:tick', { state: this.state, action: 'play' });
  }

  restart() {
    this._loop.stop();
    this._unbindControls();
    this.state = this._buildFullState();
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  _onPause()  { this._loop.stop(); }
  _onResume() { this._loop.start(16); }

  _bindControls() {
    this._onKeyDown = e => {
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',
           'KeyA','KeyD','KeyW','KeyS','Space','ShiftLeft','ShiftRight'].includes(e.code)) {
        e.preventDefault();
      }
      this._keys[e.code] = true;
      if (e.key === 'p' || e.key === 'P') EventBus.emit('game:pause-toggle');
      if (e.key === 'r' || e.key === 'R') this.restart();
    };
    this._onKeyUp = e => { this._keys[e.code] = false; };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup',   this._onKeyUp);
  }

  _unbindControls() {
    if (this._onKeyDown) { window.removeEventListener('keydown', this._onKeyDown); this._onKeyDown = null; }
    if (this._onKeyUp)   { window.removeEventListener('keyup',   this._onKeyUp);   this._onKeyUp   = null; }
  }

  _tick() {
    const s = this.state;
    if (s.status !== 'playing') return;

    this._justPressed = {};
    for (const code of ['Space','ArrowUp','KeyW','ShiftLeft','ShiftRight']) {
      if (this._keys[code] && !this._prevKeys[code]) this._justPressed[code] = true;
    }
    this._prevKeys = { ...this._keys };

    this._updatePlayer(s);
    this._updateEnemies(s);
    if (s.bossActive) this._updateBoss(s);
    this._checkPickups(s);
    this._checkRoomTransition(s);

    s.player.score = s.score;
    EventBus.emit('game:tick', { state: s });
  }

  _updatePlayer(s) {
    const p  = s.player;
    const k  = this._keys;
    const jp = this._justPressed;

    // Dash
    if (p.abilities.dash && (jp['ShiftLeft'] || jp['ShiftRight']) && p.dashTimer <= 0 && !p.dashing) {
      p.dashing   = true;
      p.dashTimer = DASH_DUR;
      p.dashDir   = (k['ArrowRight'] || k['KeyD']) ? 1 : (k['ArrowLeft'] || k['KeyA']) ? -1 : (p.facingRight ? 1 : -1);
      p.vy = 0;
    }

    if (p.dashing) {
      p.vx = p.dashDir * DASH_SPD;
      p.dashTimer--;
      if (p.dashTimer <= 0) { p.dashing = false; p.vx = p.dashDir * WALK_SPD; }
    } else {
      // Horizontal
      const left  = k['ArrowLeft']  || k['KeyA'];
      const right = k['ArrowRight'] || k['KeyD'];
      if (left)       { p.vx = -WALK_SPD; p.facingRight = false; }
      else if (right) { p.vx = WALK_SPD;  p.facingRight = true;  }
      else            { p.vx *= 0.75; if (Math.abs(p.vx) < 0.1) p.vx = 0; }

      // Jump
      const wantJump = jp['Space'] || jp['ArrowUp'] || jp['KeyW'];
      if (wantJump) {
        if (p.onGround) {
          p.vy = JUMP_V; p.jumpCount = 1; p.onGround = false;
        } else if (p.abilities.doubleJump && p.jumpCount === 1) {
          p.vy = JUMP_V * 0.9; p.jumpCount = 2;
        }
      }
    }

    // Gravity
    if (!p.dashing) {
      p.vy += GRAVITY;
      if (p.vy > 14) p.vy = 14;
    }

    // Move + collide
    p.onGround = false;
    p.x += p.vx;
    this._resolveX(p, s);
    p.y += p.vy;
    this._resolveY(p, s);

    // Clamp — ne pas bloquer si c'est une sortie (laisse _checkRoomTransition décider)
    const room = ROOM_DEFS[s.roomId];
    if (p.x < 0       && !room?.exits?.left)  { p.x = 0;       p.vx = 0; }
    if (p.x + PW > CW && !room?.exits?.right) { p.x = CW - PW; p.vx = 0; }

    // Spikes — PH-1 pour éviter le faux positif sur sol SOLID au niveau exact des pieds
    if (this._tileAt(s, Math.floor((p.x + PW/2) / TILE), Math.floor((p.y + PH - 1) / TILE)) === T.SPIKE) {
      this._hurtPlayer(s, 1);
    }

    // Invincibility timer
    if (p.invTimer > 0) p.invTimer--;
  }

  _resolveX(p, s) {
    const tileX1 = Math.floor(p.x / TILE);
    const tileX2 = Math.floor((p.x + PW - 1) / TILE);
    const tileY1 = Math.floor(p.y / TILE);
    const tileY2 = Math.floor((p.y + PH - 1) / TILE);
    for (let tx = tileX1; tx <= tileX2; tx++) {
      for (let ty = tileY1; ty <= tileY2; ty++) {
        if (this._tileAt(s, tx, ty) === T.SOLID) {
          if (p.vx > 0) { p.x = tx * TILE - PW; p.vx = 0; }
          else if (p.vx < 0) { p.x = (tx + 1) * TILE; p.vx = 0; }
        }
      }
    }
  }

  _resolveY(p, s) {
    const tileX1 = Math.floor(p.x / TILE);
    const tileX2 = Math.floor((p.x + PW - 1) / TILE);
    const tileY1 = Math.floor(p.y / TILE);
    const tileY2 = Math.floor((p.y + PH) / TILE); // sans -1 : détecte la plateforme dès le premier pixel de contact
    for (let tx = tileX1; tx <= tileX2; tx++) {
      for (let ty = tileY1; ty <= tileY2; ty++) {
        const tile = this._tileAt(s, tx, ty);
        if (tile === T.SOLID) {
          if (p.vy > 0) {
            p.y = ty * TILE - PH; p.vy = 0; p.onGround = true; p.jumpCount = 0;
          } else if (p.vy < 0) {
            p.y = (ty + 1) * TILE; p.vy = 0;
          }
        } else if (tile === T.PLAT && p.vy > 0) {
          const bottom = ty * TILE;
          const prevY  = p.y + PH - p.vy;
          if (prevY <= bottom) {
            p.y = bottom - PH; p.vy = 0; p.onGround = true; p.jumpCount = 0;
          }
        }
      }
    }
  }

  _tileAt(s, tx, ty) {
    const room = ROOM_DEFS[s.roomId];
    if (!room) return T.AIR;
    // Hors-limites horizontal → AIR (pas de mur invisible, les sorties gèrent la transition)
    // Hors-limites vertical → SOLID (plafond/plancher infini)
    if (tx < 0 || tx >= COLS) return T.AIR;
    if (ty < 0 || ty >= ROWS) return T.SOLID;
    return room.tiles[ty]?.[tx] ?? T.AIR;
  }

  _updateEnemies(s) {
    const p = s.player;
    for (const e of s.enemies) {
      if (e.dead) continue;

      if (e.type === 'flier') {
        e.floatT += 0.05;
        e.x += e.vx;
        e.y = e.baseY + Math.sin(e.floatT) * 30;
        if (e.x < TILE || e.x + 28 > CW - TILE) e.vx *= -1;
      } else {
        e.x += e.vx;
        // Reverse at walls or edges
        const tileAhead = Math.floor((e.x + (e.vx > 0 ? 28 : 0)) / TILE);
        const tileBelow = Math.floor((e.y + PH + 1) / TILE);
        const tileAbove = Math.floor(e.y / TILE);
        const wallAhead = this._tileAt(s, tileAhead, Math.floor((e.y + PH/2) / TILE)) === T.SOLID;
        const noFloor   = this._tileAt(s, tileAhead, tileBelow) === T.AIR;
        if (wallAhead || noFloor) e.vx *= -1;
        // Gravity
        e.vy += GRAVITY;
        e.y  += e.vy;
        // Floor
        const ty = Math.floor((e.y + PH) / TILE);
        if (this._tileAt(s, Math.floor((e.x + 14) / TILE), ty) === T.SOLID) {
          e.y = ty * TILE - PH; e.vy = 0;
        }
      }

      // Collision with player
      if (p.invTimer <= 0 && this._rectsOverlap(
        p.x, p.y, PW, PH,
        e.x, e.y, e.type === 'flier' ? 22 : 26, PH
      )) {
        // Stomp? (player above enemy, falling)
        const stomping = p.y + PH <= e.y + 12 && p.vy > 0;
        if (stomping || p.dashing) {
          e.dead = true;
          s.score += 50;
          if (stomping) { p.vy = -8; p.jumpCount = 0; }
        } else {
          this._hurtPlayer(s, 1);
        }
      }
    }
    // Remove dead
    s.enemies = s.enemies.filter(e => !e.dead);
  }

  _updateBoss(s) {
    if (!s.boss || s.boss.dead) return;
    const boss = s.boss;
    const p    = s.player;

    boss.x += boss.vx;
    if (boss.x < TILE || boss.x + 60 > CW - TILE) boss.vx *= -1;

    // Gravity
    boss.vy += GRAVITY;
    boss.y  += boss.vy;
    const ty = Math.floor((boss.y + 40) / TILE);
    if (this._tileAt(s, Math.floor((boss.x + 30) / TILE), ty) === T.SOLID) {
      boss.y = ty * TILE - 40; boss.vy = 0;
    }

    // Periodic jump
    boss.jumpTimer++;
    if (boss.jumpTimer > 80) {
      boss.vy = -10; boss.jumpTimer = 0;
    }

    // Phase 2 at half HP
    if (boss.hp <= boss.maxHp / 2 && boss.phase === 1) {
      boss.phase = 2;
      boss.vx *= 1.6;
    }

    // Projectiles (phase 2)
    if (boss.phase === 2 && s.frame % 60 === 0) {
      boss.projectiles.push({ x: boss.x + 30, y: boss.y + 20, vx: (p.x > boss.x ? 4 : -4), vy: -2 });
    }
    boss.projectiles = boss.projectiles.filter(pr => {
      pr.x += pr.vx; pr.y += pr.vy; pr.vy += 0.2;
      if (pr.x < 0 || pr.x > CW || pr.y > CH) return false;
      if (p.invTimer <= 0 && this._rectsOverlap(p.x, p.y, PW, PH, pr.x - 4, pr.y - 4, 8, 8)) {
        this._hurtPlayer(s, 1); return false;
      }
      return true;
    });

    // Hit boss: stomping or dashing
    if (boss.invTimer > 0) { boss.invTimer--; }
    else if (p.dashing && this._rectsOverlap(p.x, p.y, PW, PH, boss.x, boss.y, 60, 40)) {
      boss.hp--;
      boss.invTimer = 40;
      s.score += 100;
      if (boss.hp <= 0) { boss.dead = true; this._win(s); }
    } else if (p.invTimer <= 0 && this._rectsOverlap(p.x, p.y, PW, PH, boss.x, boss.y, 60, 40)) {
      const stomping = p.y + PH <= boss.y + 10 && p.vy > 0;
      if (stomping) {
        boss.hp--;
        boss.invTimer = 40;
        s.score += 100;
        p.vy = -8;
        if (boss.hp <= 0) { boss.dead = true; this._win(s); }
      } else {
        this._hurtPlayer(s, 1);
      }
    }

    s.frame = (s.frame ?? 0) + 1;
  }

  _checkPickups(s) {
    const p = s.player;
    const room = ROOM_DEFS[s.roomId];
    if (!room?.pickups) return;
    s.activePickups = s.activePickups.filter(pk => {
      if (pk.collected) return false;
      const px = pk.tx * TILE + TILE / 2, py = pk.ty * TILE + TILE / 2;
      if (Math.hypot(p.x + PW/2 - px, p.y + PH/2 - py) < TILE) {
        if (pk.type === 'double-jump') p.abilities.doubleJump = true;
        if (pk.type === 'dash')        p.abilities.dash        = true;
        s.score += 200;
        pk.collected = true;
        s.collectedPickups.add(`${s.roomId}-${pk.type}`);
        EventBus.emit('game:tick', { state: s, action: 'pickup', pickup: pk.type });
        return false;
      }
      return true;
    });
  }

  _checkRoomTransition(s) {
    const p = s.player;
    const room = ROOM_DEFS[s.roomId];
    if (!room?.exits) return;

    let nextRoom = null, spawnX = CW / 2, spawnY = TILE * 12;

    if (p.x + PW >= CW && room.exits.right !== undefined) {
      nextRoom = room.exits.right; spawnX = TILE * 2; spawnY = p.y;
    } else if (p.x <= 0 && room.exits.left !== undefined) {
      nextRoom = room.exits.left; spawnX = CW - PW - TILE * 2; spawnY = p.y;
    } else if (p.y <= 0 && room.exits.up !== undefined) {
      nextRoom = room.exits.up; spawnX = p.x; spawnY = (ROWS - 3) * TILE;
    } else if (p.y + PH >= CH && room.exits.down !== undefined) {
      nextRoom = room.exits.down; spawnX = p.x; spawnY = TILE;
    }

    if (nextRoom !== null) {
      this._loadRoom(s, nextRoom, spawnX, spawnY);
    }
  }

  _loadRoom(s, roomId, spawnX, spawnY) {
    const def   = ROOM_DEFS[roomId];
    s.roomId    = roomId;
    s.roomName  = def.name;
    if (!s.visited.has(roomId)) {
      s.visited.add(roomId);
      s.score += 100;
    }
    s.enemies       = mkEnemies(def.enemies ?? [], roomId);
    s.activePickups = (def.pickups ?? []).filter(pk => {
      const key2 = `${roomId}-${pk.type}`;
      return !s.collectedPickups.has(key2);
    });
    s.bossActive = def.boss === true && !s.bossDefeated;
    s.boss       = s.bossActive ? mkBoss() : null;
    s.frame      = 0;

    const p = s.player;
    p.x  = Math.max(TILE, Math.min(CW - PW - TILE, spawnX));
    p.y  = Math.max(TILE, Math.min(CH - PH - TILE, spawnY));
    p.vx = 0; p.vy = 0;
    EventBus.emit('game:tick', { state: s, action: 'room-change' });
  }

  _hurtPlayer(s, dmg) {
    const p = s.player;
    if (p.invTimer > 0) return;
    p.hp -= dmg;
    p.invTimer = INV_DUR;
    p.vy = -5;
    if (p.hp <= 0) {
      p.hp = 0;
      s.status = 'over';
      this._loop.stop();
      const { best, isRecord } = ScoreService.submit(this._gameId(), s.score);
      EventBus.emit('game:over', {
        result:'lose', icon:'💀', title:'GAME OVER',
        score: s.score, best, isRecord,
        extraInfo: `<div class="overlay-score">${s.visited.size} salles · ${ROOM_DEFS.length} total</div>`,
      });
    }
  }

  _win(s) {
    s.status = 'won';
    s.bossDefeated = true;
    this._loop.stop();
    const { best, isRecord } = ScoreService.submit(this._gameId(), s.score);
    EventBus.emit('game:won', {
      result:'win', icon:'🗺️', title:'BOSS VAINCU !',
      score: s.score, best, isRecord,
      extraInfo: `<div class="overlay-score">${s.visited.size} salles explorées · Toutes les capacités débloquées</div>`,
    });
  }

  _rectsOverlap(ax,ay,aw,ah,bx,by,bw,bh) {
    return ax < bx+bw && ax+aw > bx && ay < by+bh && ay+ah > by;
  }

  _buildFullState() {
    const def = ROOM_DEFS[0];
    return {
      status: 'idle', score: 0,
      roomId: 0, roomName: def.name,
      player: mkPlayer(),
      enemies: mkEnemies(def.enemies ?? [], 0),
      activePickups: [...(def.pickups ?? [])],
      boss: null, bossActive: false, bossDefeated: false,
      visited: new Set([0]),
      collectedPickups: new Set(),
      frame: 0,
      ROOM_DEFS, TILE, COLS, ROWS, CW, CH, PW, PH,
    };
  }
}
