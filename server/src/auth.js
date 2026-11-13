/**
 * Authentication & metering gateway (spec 3.1).
 * Validates session tokens against the store and enforces monthly character quotas.
 */
export class Gateway {
  constructor(store, quotas) {
    this.store = store;
    this.quotas = quotas;
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
