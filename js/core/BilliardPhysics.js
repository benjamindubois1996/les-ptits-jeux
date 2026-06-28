/**
 * BilliardPhysics — moteur physique 2D pour billard
 *
 * Collision balle-balle : collision élastique masse égale (échange total des composantes normales)
 * Sous-steps : divise chaque frame en N sous-étapes pour éviter le tunneling
 * Cushion : coefficient de restitution sur les bandes
 * Spin (V2) : chaque balle a un spin angulaire (w) qui affecte la friction de roulement
 */

export default class BilliardPhysics {
  /**
   * @param {object} opts
   * @param {number} opts.tableW    — largeur de la surface de jeu (px)
   * @param {number} opts.tableH    — hauteur de la surface de jeu (px)
   * @param {number} opts.ballR     — rayon d'une balle (px)
   * @param {number} opts.friction  — coefficient de friction par frame (ex: 0.988)
   * @param {number} opts.cushion   — restitution des bandes (ex: 0.78)
   * @param {number} opts.subSteps  — nombre de sous-étapes par frame (ex: 3)
   */
  constructor({ tableW, tableH, ballR, friction = 0.988, cushion = 0.78, subSteps = 3 }) {
    this.TW       = tableW;
    this.TH       = tableH;
    this.R        = ballR;
    this.friction = friction;
    this.cushion  = cushion;
    this.subSteps = subSteps;
  }

  /**
   * Avance la simulation d'une frame.
   * @param {Ball[]} balls  — tableau de billes { x, y, vx, vy, spin?, pocketed }
   * @param {Pocket[]} pockets — tableau de poches { x, y, r }
   * @param {function(Ball):void} onPocketed — callback quand une balle est empochée
   */
  step(balls, pockets, onPocketed) {
    const dt = 1 / this.subSteps;

    for (let s = 0; s < this.subSteps; s++) {
      // 1. Intégration des positions
      for (const b of balls) {
        if (b.pocketed) continue;
        b.x += b.vx * dt;
        b.y += b.vy * dt;

        // Friction (roulement + légère composante spin V2)
        const fric = Math.pow(this.friction, dt);
        b.vx *= fric;
        b.vy *= fric;

        // Stopper les très petites vitesses
        if (Math.abs(b.vx) < 0.02) b.vx = 0;
        if (Math.abs(b.vy) < 0.02) b.vy = 0;
      }

      // 2. Collisions bandes (cushions) — offset 22px = largeur des rails bois
      const CX = 22, CY = 22;
      for (const b of balls) {
        if (b.pocketed) continue;
        const R = this.R;
        if (b.x - R < CX)              { b.x = CX + R;              b.vx =  Math.abs(b.vx) * this.cushion; }
        if (b.x + R > this.TW - CX)   { b.x = this.TW - CX - R;    b.vx = -Math.abs(b.vx) * this.cushion; }
        if (b.y - R < CY)              { b.y = CY + R;              b.vy =  Math.abs(b.vy) * this.cushion; }
        if (b.y + R > this.TH - CY)   { b.y = this.TH - CY - R;    b.vy = -Math.abs(b.vy) * this.cushion; }
      }

      // 3. Collisions balle-balle (élastique, masse égale → échange composante normale)
      for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) {
          const a = balls[i], b = balls[j];
          if (a.pocketed || b.pocketed) continue;

          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy);
          const minD = this.R * 2;

          if (dist === 0 || dist >= minD) continue;

          // Axe normal de collision (unitaire)
          const nx = dx / dist;
          const ny = dy / dist;

          // Séparer les balles (overlap correction)
          const overlap = (minD - dist) / 2;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;

          // Composantes des vitesses sur l'axe normal
          const avn = a.vx * nx + a.vy * ny;
          const bvn = b.vx * nx + b.vy * ny;

          // Collision seulement si les balles se rapprochent
          if (avn - bvn <= 0) continue;

          // Échange des composantes normales (masses égales → échange parfait)
          const impulse = avn - bvn; // différence sur le normal
          a.vx -= impulse * nx;
          a.vy -= impulse * ny;
          b.vx += impulse * nx;
          b.vy += impulse * ny;

          // Légère perte d'énergie à l'impact (restitution ~0.95)
          const rest = 0.95;
          a.vx *= rest; a.vy *= rest;
          b.vx *= rest; b.vy *= rest;
        }
      }

      // 4. Détection des poches
      for (const b of balls) {
        if (b.pocketed) continue;
        for (const pk of pockets) {
          if (Math.hypot(b.x - pk.x, b.y - pk.y) < pk.r) {
            b.pocketed = true;
            b.vx = 0; b.vy = 0;
            onPocketed(b);
            break;
          }
        }
      }
    }
  }

  /**
   * Vérifie si toutes les balles non-empochées sont immobiles.
   * @param {Ball[]} balls
   * @returns {boolean}
   */
  isIdle(balls) {
    return balls.every(b => b.pocketed || (Math.abs(b.vx) < 0.08 && Math.abs(b.vy) < 0.08));
  }

  /**
   * Calcule la puissance et la direction d'un tir depuis aimStart vers aimEnd.
   * @returns {{ vx, vy }}
   */
  calcShot(aimStart, aimEnd, maxPower = 18) {
    const dx = aimStart.x - aimEnd.x;
    const dy = aimStart.y - aimEnd.y;
    const len = Math.hypot(dx, dy) || 1;
    const power = Math.min(len * 0.22, maxPower);
    return { vx: (dx / len) * power, vy: (dy / len) * power };
  }
}
