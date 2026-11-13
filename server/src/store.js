import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Minimal persistent store for users, session tokens and usage.
 * MVP implementation: one JSON file, written atomically. The interface
 * (findUserByToken / addUsage / getUsage / createUser) is what the rest of the
 * server depends on, so a Postgres/Redis/Firestore adapter can replace it.
 */
export class JsonStore {
  constructor(file) {
    this.file = file;
    this.data = { users: {}, tokens: {}, usage: {} };
    this.#load();
    this.dirty = false;
    this.timer = null;
  }

  #load() {
    try {
      this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.loadedMtime = fs.statSync(this.file).mtimeMs;
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  /** Pick up users/tokens added by another process (e.g. `npm run token:create`) without losing in-memory usage. */
  #refreshAccounts() {
    try {
      const mtime = fs.statSync(this.file).mtimeMs;
      if (mtime === this.loadedMtime) return;
      const disk = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      Object.assign(this.data.users, disk.users);
      Object.assign(this.data.tokens, disk.tokens);
      this.loadedMtime = mtime;
    } catch {
      /* no file yet */
    }
  }

  #scheduleSave() {
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), 250);
    this.timer.unref?.();
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.dirty) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
    this.loadedMtime = fs.statSync(this.file).mtimeMs;
    this.dirty = false;
  }

  static hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /** Creates a user and returns { user, token }. The raw token is only returned here. */
  createUser({ email = null, plan = 'free' } = {}) {
    const id = `usr_${crypto.randomBytes(8).toString('hex')}`;
    const token = `vk_${crypto.randomBytes(24).toString('base64url')}`;
    const user = { id, email, plan, createdAt: new Date().toISOString(), disabled: false };
    this.data.users[id] = user;
    this.data.tokens[JsonStore.hashToken(token)] = { userId: id, createdAt: user.createdAt };
    this.#scheduleSave();
    return { user, token };
  }

  findUserByToken(token) {
    if (!token) return null;
    const hash = JsonStore.hashToken(token);
    if (!this.data.tokens[hash]) this.#refreshAccounts();
    const rec = this.data.tokens[hash];
    if (!rec) return null;
    const user = this.data.users[rec.userId];
    return user && !user.disabled ? user : null;
  }

  static periodKey(date = new Date()) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  getUsage(userId, period = JsonStore.periodKey()) {
    return this.data.usage[`${userId}:${period}`] || { chars: 0, requests: 0 };
  }

  addUsage(userId, chars, period = JsonStore.periodKey()) {
    const key = `${userId}:${period}`;
    const u = this.data.usage[key] || { chars: 0, requests: 0 };
    u.chars += chars;
    u.requests += 1;
    this.data.usage[key] = u;
    this.#scheduleSave();
    return u;
  }
}
