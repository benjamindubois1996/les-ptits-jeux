import Vector2 from './Vector2.js';

export default class Particles {
  constructor() { this._particles = []; }

  emit(x, y, { count = 10, angle = 0, spread = Math.PI, speed = 100, color = '#fff', life = 600, size = 3 } = {}) {
    for (let i = 0; i < count; i++) {
      const a = angle - spread / 2 + Math.random() * spread;
      const s = speed * (0.5 + Math.random() * 0.5);
      this._particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        color, size: size * (0.5 + Math.random()),
        life, maxLife: life,
      });
    }
  }

  update(dt) {
    const dtS = dt / 1000;
    this._particles = this._particles.filter(p => {
      p.x  += p.vx * dtS;
      p.y  += p.vy * dtS;
      p.vy += 200 * dtS;
      p.life -= dt;
      return p.life > 0;
    });
  }

  draw(ctx) {
    for (const p of this._particles) {
      const alpha = p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  clear() { this._particles = []; }
  get count() { return this._particles.length; }
}
