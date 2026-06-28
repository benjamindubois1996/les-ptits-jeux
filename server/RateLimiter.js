'use strict';

class RateLimiter {
  constructor(maxMessages = 60, windowMs = 1000) {
    this._max    = maxMessages;
    this._window = windowMs;
    this._counts = new Map();
  }

  allow(ws) {
    const now   = Date.now();
    const entry = this._counts.get(ws);

    if (!entry || now >= entry.resetAt) {
      this._counts.set(ws, { count: 1, resetAt: now + this._window });
      return true;
    }

    entry.count++;
    return entry.count <= this._max;
  }

  remove(ws) {
    this._counts.delete(ws);
  }
}

module.exports = { RateLimiter };
