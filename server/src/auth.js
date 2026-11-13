/**
 * Authentication & metering gateway (spec 3.1).
 * Validates session tokens against the store and enforces monthly character quotas.
 */
export class Gateway {
  constructor(store, quotas, rate = { perMinute: 6, perDay: 120 }) {
    this.store = store;
    this.quotas = quotas;
    this.rate = rate;
    this.recent = new Map(); // userId -> timestamps of recent social generations (in memory)
  }

  /**
   * Per-user rate limit on social generations (crib notes, replies, scenes), on top of the
   * monthly quota. Keeps the tool a personal helper, never a bulk-reply engine.
   */
  takeGeneration(user, now = Date.now()) {
    const day = 24 * 3600 * 1000;
    const list = (this.recent.get(user.id) || []).filter((t) => now - t < day);
    const lastMinute = list.filter((t) => now - t < 60000);
    let retryAfterMs = 0;
    if (lastMinute.length >= this.rate.perMinute) retryAfterMs = 60000 - (now - lastMinute[0]);
    else if (list.length >= this.rate.perDay) retryAfterMs = day - (now - list[0]);
    if (retryAfterMs > 0) {
      this.recent.set(user.id, list);
      return { ok: false, retryAfterMs };
    }
    list.push(now);
    this.recent.set(user.id, list);
    return { ok: true };
  }

  authenticate(token) {
    return this.store.findUserByToken(token);
  }

  quotaFor(user) {
    return this.quotas[user.plan] ?? this.quotas.free;
  }

  usage(user) {
    const used = this.store.getUsage(user.id);
    const limit = this.quotaFor(user);
    return { plan: user.plan, period: this.store.constructor.periodKey(), usedChars: used.chars, limitChars: limit, remainingChars: Math.max(0, limit - used.chars) };
  }

  /** Returns true if `chars` more characters fit in this month's quota. */
  canSpend(user, chars) {
    return this.store.getUsage(user.id).chars + chars <= this.quotaFor(user);
  }

  record(user, chars) {
    if (chars > 0) this.store.addUsage(user.id, chars);
  }
}

export function bearer(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}
