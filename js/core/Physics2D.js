export default class Physics2D {
  constructor({ gravity = 0, drag = 0 } = {}) {
    this.gravity = gravity;
    this.drag    = drag;
    this._x  = 0; this._y  = 0;
    this._vx = 0; this._vy = 0;
  }

  reset(x = 0, y = 0) { this._x = x; this._y = y; this._vx = 0; this._vy = 0; }
  applyForce(vx, vy)   { this._vx += vx; this._vy += vy; }

  update(dt) {
    this._vy += this.gravity * dt;
    this._vx *= (1 - this.drag * dt);
    this._vy *= (1 - this.drag * dt);
    this._x  += this._vx * dt;
    this._y  += this._vy * dt;
  }

  get x()  { return this._x; }
  get y()  { return this._y; }
  get vx() { return this._vx; }
  get vy() { return this._vy; }
  set vx(v){ this._vx = v; }
  set vy(v){ this._vy = v; }
  set x(v) { this._x = v; }
  set y(v) { this._y = v; }
}
