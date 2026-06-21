export default class Vector2 {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }

  add(v)     { return new Vector2(this.x + v.x, this.y + v.y); }
  sub(v)     { return new Vector2(this.x - v.x, this.y - v.y); }
  scale(n)   { return new Vector2(this.x * n, this.y * n); }
  magnitude(){ return Math.sqrt(this.x * this.x + this.y * this.y); }
  normalize() {
    const m = this.magnitude();
    return m === 0 ? new Vector2() : this.scale(1 / m);
  }
  dot(v)     { return this.x * v.x + this.y * v.y; }
  rotate(rad) {
    const cos = Math.cos(rad), sin = Math.sin(rad);
    return new Vector2(this.x * cos - this.y * sin, this.x * sin + this.y * cos);
  }
  clone()    { return new Vector2(this.x, this.y); }

  static fromAngle(rad, length = 1) {
    return new Vector2(Math.cos(rad) * length, Math.sin(rad) * length);
  }
}
