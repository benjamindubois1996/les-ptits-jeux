import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';
import { TILE, COLS, ROWS, CW, CH, PW, PH } from './Metroidvania.js';

const ID    = 'metroidvania';
const HUD_H = 48;
const FULL_W = CW, FULL_H = CH + HUD_H;

// Tile colors
const TILE_COLORS = { 1:'#2d4a7a', 2:'#5a3a1a', 3:'#cc2222' };

export default class MetroidvaniaRenderer {
  constructor(game, viewport, config) {
    this._game = game; this._vp = viewport;
    this._wrapper = null; this._canvas = null; this._ctx = null;
    this._overlay = null; this._state = null;
    this._pickupAnim = {};
    this._roomFlash = 0;

    this._onTick    = this._onTick.bind(this);
    this._onOver    = this._onOver.bind(this);
    this._onWon     = this._onWon.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
    this._onRestart = this._onRestart.bind(this);
  }

  init() {
    this._injectStyles();
    this._buildLayout();
    this._overlay = new GameOverlay(this._vp);
    this._showStart();
    this._bindEvents();
  }

  destroy() {
    this._unbindEvents();
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById(`${ID}-styles`)?.remove();
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = `${ID}-wrapper`;

    this._canvas = document.createElement('canvas');
    this._canvas.width  = FULL_W;
    this._canvas.height = FULL_H;
    this._ctx = this._canvas.getContext('2d');
    this._scaleCanvas();

    this._wrapper.appendChild(this._canvas);
    this._vp.appendChild(this._wrapper);
  }

  _scaleCanvas() {
    const vw = this._vp.clientWidth  - 8;
    const vh = this._vp.clientHeight - 8;
    const sc = Math.min(vw / FULL_W, vh / FULL_H, 1.5);
    this._canvas.style.width  = `${FULL_W * sc}px`;
    this._canvas.style.height = `${FULL_H * sc}px`;
  }

  _showStart() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] }],
      sel => { this._overlay.hide(); this._game.start(sel); },
      { extraHtml: `<div style="color:rgba(255,255,255,0.5);font-size:10px;text-align:center;line-height:1.8;margin-bottom:4px">
        Explore 8 salles · Débloque Double Saut & Dash<br>
        ← → WASD : courir · ↑ W Espace : sauter<br>
        Shift : Dash (après déblocage) · Saute sur les ennemis !<br>
        Bats le boss final pour gagner !
      </div>` }
    );
  }

  _draw(s) {
    const ctx = this._ctx;
    ctx.fillStyle = '#0a0d18';
    ctx.fillRect(0, 0, FULL_W, FULL_H);

    // Room flash on transition
    if (this._roomFlash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this._roomFlash / 20 * 0.3})`;
      ctx.fillRect(0, 0, FULL_W, FULL_H);
      this._roomFlash--;
    }

    // Game area offset (below HUD)
    ctx.save();
    ctx.translate(0, HUD_H);

    this._drawTiles(ctx, s);
    this._drawPickups(ctx, s);
    this._drawEnemies(ctx, s);
    if (s.bossActive && s.boss && !s.boss.dead) this._drawBoss(ctx, s);
    this._drawPlayer(ctx, s.player);

    ctx.restore();

    this._drawHUD(ctx, s);
  }

  _drawTiles(ctx, s) {
    const roomDef = s.ROOM_DEFS[s.roomId];
    if (!roomDef) return;
    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLS; tx++) {
        const tile = roomDef.tiles[ty]?.[tx];
        if (!tile) continue;
        const x = tx * TILE, y = ty * TILE;
        const color = TILE_COLORS[tile] ?? '#2d4a7a';

        if (tile === 1) {
          // Solid block with edge highlight
          ctx.fillStyle = color;
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.fillRect(x, y, TILE, 2);
          ctx.fillRect(x, y, 2, TILE);
          ctx.fillStyle = 'rgba(0,0,0,0.2)';
          ctx.fillRect(x, y + TILE - 2, TILE, 2);
          ctx.fillRect(x + TILE - 2, y, 2, TILE);
        } else if (tile === 2) {
          // Platform
          ctx.fillStyle = color;
          ctx.fillRect(x, y, TILE, 4);
        } else if (tile === 3) {
          // Spike
          ctx.fillStyle = '#cc2222';
          ctx.beginPath();
          ctx.moveTo(x + TILE/2, y + 2);
          ctx.lineTo(x + TILE - 3, y + TILE - 2);
          ctx.lineTo(x + 3, y + TILE - 2);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  _drawPickups(ctx, s) {
    for (const pk of s.activePickups) {
      const x = pk.tx * TILE + TILE / 2;
      const y = pk.ty * TILE + TILE / 2;
      const t = Date.now() / 600;
      const bob = Math.sin(t) * 3;

      // Glow
      ctx.save();
      ctx.shadowColor = pk.type === 'dash' ? '#ff8800' : '#44aaff';
      ctx.shadowBlur  = 16 + Math.sin(t * 2) * 6;

      // Icon
      ctx.font = '20px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(pk.type === 'dash' ? '💨' : '⬆️', x, y + bob);
      ctx.restore();

      // Label
      ctx.font = '7px Orbitron, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffe033';
      ctx.fillText(pk.type === 'dash' ? 'DASH' : 'DOUBLE SAUT', x, y + 16 + bob);
    }
  }

  _drawEnemies(ctx, s) {
    for (const e of s.enemies) {
      if (e.dead) continue;
      const x = e.x, y = e.y;

      if (e.type === 'flier') {
        // Flying eye
        ctx.fillStyle = '#882222';
        ctx.beginPath(); ctx.ellipse(x + 11, y + 11, 11, 9, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x + 11, y + 10, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#220000';
        ctx.beginPath(); ctx.arc(x + 12, y + 10, 3, 0, Math.PI * 2); ctx.fill();
        // Wings
        ctx.fillStyle = 'rgba(136,34,34,0.5)';
        const wingFlap = Math.sin(Date.now() / 150) * 5;
        ctx.beginPath(); ctx.ellipse(x, y + 6 + wingFlap, 8, 4, -0.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x + 22, y + 6 + wingFlap, 8, 4, 0.5, 0, Math.PI * 2); ctx.fill();
      } else {
        // Walker slime
        ctx.fillStyle = '#226622';
        ctx.beginPath(); ctx.ellipse(x + 13, y + PH - 8, 13, 10, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#33aa33';
        ctx.beginPath(); ctx.ellipse(x + 13, y + PH - 14, 10, 8, 0, 0, Math.PI * 2); ctx.fill();
        // Eyes
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x + 9, y + PH - 16, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 17, y + PH - 16, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(x + (e.vx > 0 ? 10 : 8), y + PH - 16, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + (e.vx > 0 ? 18 : 16), y + PH - 16, 1.5, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  _drawBoss(ctx, s) {
    const b = s.boss;
    const flash = b.invTimer > 0 && Math.floor(b.invTimer / 4) % 2;

    ctx.save();
    if (flash) ctx.globalAlpha = 0.4;

    // Boss body
    ctx.fillStyle = b.phase === 2 ? '#882200' : '#660022';
    ctx.beginPath(); ctx.roundRect(b.x, b.y, 60, 40, 8); ctx.fill();

    // Eyes
    ctx.fillStyle = '#ff4400';
    ctx.beginPath(); ctx.arc(b.x + 16, b.y + 14, 7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(b.x + 44, b.y + 14, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath(); ctx.arc(b.x + 16, b.y + 14, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(b.x + 44, b.y + 14, 3, 0, Math.PI * 2); ctx.fill();

    // Horns
    ctx.fillStyle = '#440011';
    ctx.beginPath(); ctx.moveTo(b.x + 10, b.y); ctx.lineTo(b.x + 4, b.y - 14); ctx.lineTo(b.x + 18, b.y); ctx.fill();
    ctx.beginPath(); ctx.moveTo(b.x + 50, b.y); ctx.lineTo(b.x + 56, b.y - 14); ctx.lineTo(b.x + 42, b.y); ctx.fill();

    ctx.restore();

    // HP bar
    const bw = 80, bh = 8;
    const bx = b.x - 10, by = b.y - 18;
    ctx.fillStyle = '#330000';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = b.phase === 2 ? '#ff4400' : '#cc0033';
    ctx.fillRect(bx, by, (b.hp / b.maxHp) * bw, bh);
    ctx.strokeStyle = '#660000'; ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.font = '7px Orbitron, monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    ctx.fillText(`BOSS ${b.hp}/${b.maxHp}`, bx + bw / 2, by - 3);

    // Phase 2 projectiles
    if (b.phase === 2) {
      for (const pr of b.projectiles) {
        ctx.fillStyle = '#ff6600';
        ctx.shadowColor = '#ff4400'; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(pr.x, pr.y, 5, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
  }

  _drawPlayer(ctx, p) {
    if (p.invTimer > 0 && Math.floor(p.invTimer / 4) % 2) return;

    ctx.save();

    // Dash trail
    if (p.dashing) {
      ctx.fillStyle = 'rgba(68,170,255,0.18)';
      for (let i = 1; i <= 3; i++) {
        ctx.fillRect(p.x - p.vx * i, p.y, PW, PH);
      }
    }

    // Body
    const bodyColor = p.dashing ? '#88ddff' : '#44aaff';
    ctx.fillStyle = bodyColor;
    ctx.fillRect(p.x, p.y + 8, PW, PH - 8);

    // Head
    ctx.fillStyle = '#66bbff';
    ctx.beginPath(); ctx.roundRect(p.x + 1, p.y, PW - 2, 14, 4); ctx.fill();

    // Eye
    ctx.fillStyle = '#fff';
    const eyeX = p.facingRight ? p.x + PW - 6 : p.x + 2;
    ctx.beginPath(); ctx.arc(eyeX, p.y + 5, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#002244';
    ctx.beginPath(); ctx.arc(eyeX + (p.facingRight ? 1 : -1), p.y + 5, 1.5, 0, Math.PI * 2); ctx.fill();

    // Legs (animated)
    if (p.onGround && Math.abs(p.vx) > 0.3) {
      const legAnim = Math.sin(Date.now() / 100) > 0;
      ctx.fillStyle = '#2266aa';
      ctx.fillRect(p.x + 1, p.y + PH - 6, 6, legAnim ? 5 : 3);
      ctx.fillRect(p.x + PW - 7, p.y + PH - 6, 6, legAnim ? 3 : 5);
    }

    // Double jump glint
    if (p.abilities.doubleJump && !p.onGround) {
      ctx.fillStyle = 'rgba(100,180,255,0.3)';
      ctx.beginPath(); ctx.arc(p.x + PW/2, p.y + PH/2, 14, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();
  }

  _drawHUD(ctx, s) {
    const p = s.player;
    ctx.fillStyle = 'rgba(5,8,20,0.95)';
    ctx.fillRect(0, 0, FULL_W, HUD_H);
    ctx.strokeStyle = '#1e3a6a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, HUD_H); ctx.lineTo(FULL_W, HUD_H); ctx.stroke();

    // HP Hearts
    for (let i = 0; i < p.maxHp; i++) {
      ctx.font = '18px serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(i < p.hp ? '❤️' : '🖤', 8 + i * 24, HUD_H / 2);
    }

    // Score
    ctx.font = 'bold 11px Orbitron, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe033';
    ctx.fillText(`${s.score} pts`, FULL_W / 2, HUD_H / 2);

    // Room name
    ctx.font = '9px Orbitron, monospace';
    ctx.fillStyle = '#88aaff';
    ctx.fillText(s.roomName ?? '', FULL_W / 2, HUD_H - 8);

    // Abilities
    let ax = FULL_W - 120;
    ctx.font = '8px Orbitron, monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = p.abilities.doubleJump ? '#44aaff' : '#334455';
    ctx.fillText('⬆ DBL JUMP', ax, HUD_H / 2 - 6);
    ctx.fillStyle = p.abilities.dash ? '#ff8800' : '#334455';
    ctx.fillText('💨 DASH', ax, HUD_H / 2 + 8);

    // Mini-map
    this._drawMinimap(ctx, s);
  }

  _drawMinimap(ctx, s) {
    const MAP_LAYOUT = [
      // [roomId, col, row] on 4×4 grid
      [0, 1, 3],
      [1, 2, 3],
      [2, 3, 3],
      [3, 3, 2],
      [4, 3, 1],
      [5, 2, 0],
      [6, 3, 0],
      [7, 4, 0],
    ];
    const mx = FULL_W - 160, my = 4, cw = 12, ch = 8, gap = 2;

    for (const [rid, col, row] of MAP_LAYOUT) {
      const rx = mx + col * (cw + gap);
      const ry = my + row * (ch + gap);
      const visited  = s.visited.has(rid);
      const isCurrent = s.roomId === rid;
      const isBoss = rid === 7;

      if (!visited) { continue; }
      ctx.fillStyle = isCurrent ? '#44aaff' : (isBoss ? '#cc2233' : '#1a3a6a');
      ctx.fillRect(rx, ry, cw, ch);
      if (isCurrent) {
        ctx.strokeStyle = '#88ddff'; ctx.lineWidth = 1;
        ctx.strokeRect(rx, ry, cw, ch);
      }
    }
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:won',     this._onWon);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:won',     this._onWon);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
  }

  _onTick({ state, action }) {
    this._state = state;
    if (action === 'room-change') this._roomFlash = 20;
    if (state.status === 'playing') this._draw(state);
  }

  _onOver(data) { this._overlay.showGameOver(data, () => { this._overlay.hide(); this._game.start({}); }); }
  _onWon(data)  { this._overlay.showGameOver(data, () => { this._overlay.hide(); this._game.start({}); }); }
  _onPaused()   { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed()  { this._overlay.hide(); }
  _onRestart()  { this._showStart(); }

  _injectStyles() {
    if (document.getElementById(`${ID}-styles`)) return;
    const s = document.createElement('style');
    s.id = `${ID}-styles`;
    s.textContent = `
      .${ID}-wrapper {
        position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
        background:#0a0d18;
      }
      .${ID}-wrapper canvas { display:block; image-rendering:pixelated; }
    `;
    document.head.appendChild(s);
  }
}
