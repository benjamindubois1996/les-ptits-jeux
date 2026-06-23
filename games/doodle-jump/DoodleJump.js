import EventBus     from '../../js/core/EventBus.js';
import ScoreService  from '../../js/services/ScoreService.js';
import BaseGame      from '../../js/core/BaseGame.js';

// Platform types
const P_NORMAL   = 'normal';
const P_MOVING   = 'moving';
const P_BREAKING = 'breaking';
const P_SPRING   = 'spring';

export default class DoodleJump extends BaseGame {
  constructor(config) {
    super(config);
    this.state   = this._buildFullState();
    this._loopId = null;
    this._last   = 0;
  }

  _gameId() { return 'doodle-jump'; }

  async init() {
    this._setupEventBusBindings();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() { super.destroy(); this._stopLoop(); }

  start(options = {}) {
    this.state        = this._buildFullState();
    this.state.status = 'playing';
    this.state.mode   = options.mode ?? 'basique';
    EventBus.emit('game:score-update', { score: 0 });
    EventBus.emit('game:tick', { state: this.state, action: 'new-game' });
    this._startLoop();
  }

  restart() {
    this._stopLoop();
    this.state = { ...this._buildFullState(), status: 'idle' };
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  _onPause()  { this._stopLoop(); }
  _onResume() { this._startLoop(); }

  setInputX(vx) {
    if (this.state.status === 'playing') this.state.player.vx = vx;
  }

  _startLoop() {
    this._last = performance.now();
    const tick = (t) => {
      if (this.state.status !== 'playing') return;
      const dt = Math.min((t - this._last) / 1000, 0.05);
      this._last = t;
      this._update(dt);
      EventBus.emit('game:tick', { state: this.state, action: 'tick' });
      this._loopId = requestAnimationFrame(tick);
    };
    this._loopId = requestAnimationFrame(tick);
  }

  _stopLoop() {
    if (this._loopId) { cancelAnimationFrame(this._loopId); this._loopId = null; }
  }

  _update(dt) {
    const { state } = this;
    const cfg = this.config.gameplay;
    const { width, height } = cfg;

    // Gravity + terminal velocity
    state.player.vy += cfg.gravity;
    if (state.player.vy > 16) state.player.vy = 16;

    // Snapshot Y avant déplacement (pour le sweep de collision)
    const prevBottom = state.player.y + cfg.playerH / 2;

    state.player.x += state.player.vx;
    state.player.y += state.player.vy;

    // Wrap horizontally
    if (state.player.x < -cfg.playerW / 2)  state.player.x = width + cfg.playerW / 2;
    if (state.player.x > width + cfg.playerW / 2) state.player.x = -cfg.playerW / 2;

    // Camera: follow player upward
    const screenY = state.player.y - state.camera;
    if (screenY < height * 0.4) {
      const shift = height * 0.4 - screenY;
      state.camera -= shift;
    }

    // Platform collision — sweep : le joueur doit venir du DESSUS de la plateforme
    if (state.player.vy > 0) {
      const currBottom = state.player.y + cfg.playerH / 2;
      const playerLeft  = state.player.x - cfg.playerW / 2 + 4;
      const playerRight = state.player.x + cfg.playerW / 2 - 4;

      for (const p of state.platforms) {
        if (!p.alive) continue;
        const platTop   = p.y;
        const platLeft  = p.x;
        const platRight = p.x + cfg.platformW;

        // Sweep : bottom croise platTop entre le frame précédent et le frame courant
        if (playerRight > platLeft && playerLeft < platRight &&
            prevBottom <= platTop && currBottom >= platTop) {

          // Snapper le joueur sur la surface de la plateforme
          state.player.y = platTop - cfg.playerH / 2;

          if (p.type === P_BREAKING) {
            p.alive = false;
            state.player.vy = cfg.jumpVelocity;
          } else if (p.type === P_SPRING && p.hasSpring) {
            state.player.vy = cfg.springBonus;
            p.hasSpring = false;
          } else {
            state.player.vy = cfg.jumpVelocity;
          }
          break;
        }
      }
    }

    // Move moving platforms
    state.platforms.forEach(p => {
      if (p.type !== P_MOVING) return;
      p.x += p.mvx;
      if (p.x < 0 || p.x + cfg.platformW > width) p.mvx *= -1;
    });

    // Move enemies
    state.enemies.forEach(e => {
      e.x += e.vx;
      if (e.x < 0 || e.x > width - e.w) e.vx *= -1;
    });

    // Enemy collision — jump on top kills enemy, side/bottom = death
    state.enemies = state.enemies.filter(e => {
      const px = state.player.x, py = state.player.y;
      const overlapX = Math.abs(px - (e.x + e.w / 2)) < (cfg.playerW / 2 + e.w / 2 - 6);
      const overlapY = Math.abs((py + cfg.playerH / 2) - (e.y + e.h / 2)) < (cfg.playerH / 2 + e.h / 2 - 4);
      if (!overlapX || !overlapY) return true;

      // Landed on top of enemy?
      if (state.player.vy > 0 && py + cfg.playerH / 2 <= e.y + e.h * 0.4) {
        state.player.vy = cfg.jumpVelocity;
        state.score += 200;
        EventBus.emit('game:score-update', { score: state.score });
        return false; // remove enemy
      }
      // Side / bottom hit = game over
      this._gameOver();
      return true;
    });

    if (state.status !== 'playing') return;

    // Scroll score
    const height_reached = Math.max(0, -(state.camera));
    const heightFactor = this.config.scoring?.heightFactor ?? 1;
    const newScore = Math.floor(height_reached * heightFactor);
    if (newScore > state.score) {
      state.score = newScore;
      EventBus.emit('game:score-update', { score: state.score });
    }

    // Generate new platforms as camera moves up
    const topWorld = state.camera;
    while (state.nextPlatformY > topWorld - 40) {
      this._spawnPlatform(state.nextPlatformY);
      state.nextPlatformY -= this._platformGap();
    }

    // Spawn enemies periodically
    state.enemyTimer -= dt;
    if (state.enemyTimer <= 0 && state.score > 500) {
      state.enemyTimer = 4 + Math.random() * 4;
      this._spawnEnemy();
    }

    // Remove off-screen platforms (below camera + screen height)
    const bottomWorld = state.camera + height + 100;
    state.platforms = state.platforms.filter(p => p.y < bottomWorld);
    state.enemies   = state.enemies.filter(e => e.y < bottomWorld);

    // Game over if player falls off bottom
    if (state.player.y - state.camera > height + 60) {
      this._gameOver();
    }
  }

  _gameOver() {
    const { state } = this;
    state.status = 'over';
    this._stopLoop();
    const { best } = ScoreService.submit(this._gameId(), state.score);
    EventBus.emit('game:over', {
      result: 'lose', icon: '😵', title: 'CHUTE !',
      score: state.score, best,
      extraInfo: `<div class="overlay-score">Hauteur : ${state.score} m</div>`,
    });
  }

  _spawnPlatform(worldY) {
    const cfg = this.config.gameplay;
    const x   = Math.random() * (cfg.width - cfg.platformW);
    const score = Math.abs(worldY) / 10;

    let type = P_NORMAL;
    const r  = Math.random();
    if (score > 100 && r < 0.12) type = P_BREAKING;
    else if (score > 200 && r < 0.22) type = P_MOVING;
    else if (r < 0.08) type = P_SPRING;

    const p = {
      alive: true, x, y: worldY, type,
      mvx: type === P_MOVING ? (Math.random() > 0.5 ? 1.5 : -1.5) : 0,
      hasSpring: type === P_SPRING,
    };
    this.state.platforms.push(p);
  }

  _spawnEnemy() {
    const cfg = this.config.gameplay;
    const w   = 36, h = 28;
    this.state.enemies.push({
      x: Math.random() * (cfg.width - w),
      y: this.state.camera - 50,
      w, h,
      vx: (Math.random() > 0.5 ? 1 : -1) * (1 + Math.random()),
    });
  }

  _platformGap() {
    // Gap grows with height
    const base = 60 + Math.abs(this.state.camera) * 0.01;
    return Math.min(base, 110);
  }

  _buildFullState() {
    const cfg = this.config?.gameplay ?? {};
    const W = cfg.width ?? 360, H = cfg.height ?? 600;

    // First platform under the player
    const platforms = [];
    const startY = H - 60;
    platforms.push({ alive: true, x: W / 2 - (cfg.platformW ?? 68) / 2, y: startY, type: P_NORMAL, mvx: 0, hasSpring: false });

    // Fill screen with random platforms going up
    let y = startY - 70;
    for (let i = 0; i < (cfg.platformCount ?? 10); i++) {
      const x = Math.random() * (W - (cfg.platformW ?? 68));
      platforms.push({ alive: true, x, y, type: P_NORMAL, mvx: 0, hasSpring: false });
      y -= 55 + Math.random() * 20;
    }

    return {
      status: 'idle', mode: 'basique', score: 0,
      player: {
        x: W / 2, y: startY - (cfg.playerH ?? 28),
        vx: 0, vy: 0,
      },
      camera: 0, // worldY of screen top
      platforms,
      enemies: [],
      nextPlatformY: y,
      enemyTimer: 6,
    };
  }
}
