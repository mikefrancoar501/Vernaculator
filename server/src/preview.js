import { resolveVoiceId, resolveVoiceSpeed } from './config.js';
import { createTtsSession } from './pipeline.js';

/**
 * Short voice previews for the character picker.
 *
 * 1. Fish Audio sample: every public Fish voice has a demo clip. We look it up through the public
 *    model API (no key needed, no TTS credit spent, no quota used) and proxy it so the extension
 *    only ever talks to this server. Sample links are short-lived signed URLs, so the audio bytes
 *    are cached here instead of the link.
 * 2. Fallback (no sample, a private voice, or the lookup fails): speak the character's short
 *    previewLine with Fish TTS. That costs a few dozen characters of the user's monthly quota,
 *    and is cached per voice so repeat previews are free. In test mode (mock TTS) there is no
 *    fallback: the placeholder beeps would just sound broken.
 */
const FISH_API = 'https://api.fish.audio';
const SAMPLE_HOSTS = [/(^|\.)fish\.audio$/, /\.r2\.cloudflarestorage\.com$/, /\.r2\.dev$/];
const MAX_SAMPLE_BYTES = 3 * 1024 * 1024;
const TTL_MS = 12 * 3600 * 1000;
const MAX_CACHE = 120;
const PER_MINUTE = 20;
const TIMEOUT_MS = 8000;

export function defaultPreviewLine(persona) {
  return `Hi, I'm ${persona.name}. This is how I sound.`;
}

export function sampleHostAllowed(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && SAMPLE_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

export class VoicePreviews {
  constructor(cfg, { gateway, fetchImpl, synthesize } = {}) {
    this.cfg = cfg;
    this.gateway = gateway;
    this.fetch = fetchImpl || globalThis.fetch;
    this.synth = synthesize || ((persona, line) => this.#synthesize(persona, line));
    this.cache = new Map(); // key -> { audio, source, at }
    this.recent = new Map(); // userId -> timestamps
    this.samplesOn = (process.env.PREVIEW_SAMPLES ?? '1') !== '0';
  }

  #limited(user, now = Date.now()) {
    const list = (this.recent.get(user.id) || []).filter((t) => now - t < 60000);
    if (list.length >= PER_MINUTE) {
      this.recent.set(user.id, list);
      return 60000 - (now - list[0]);
    }
    list.push(now);
    this.recent.set(user.id, list);
    return 0;
  }

  #cached(key) {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit;
    this.cache.delete(key);
    return null;
  }

  #store(key, value) {
    if (this.cache.size >= MAX_CACHE) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(key, { ...value, at: Date.now() });
  }

  async get(user, persona) {
    const voiceId = resolveVoiceId(this.cfg, persona);
    const line = persona.previewLine || defaultPreviewLine(persona);
    const sampleKey = voiceId ? `sample:${voiceId}` : null;
    const ttsKey = `tts:${this.cfg.tts.provider}:${voiceId || 'default'}:${line}`;
    const hit = (sampleKey && this.#cached(sampleKey)) || this.#cached(ttsKey);
    if (hit) return { audio: hit.audio, source: hit.source };

    const wait = this.#limited(user);
    if (wait) return { error: 'rate_limited', status: 429, retryAfterMs: wait };

    if (sampleKey && this.samplesOn) {
      const audio = await this.#fishSample(voiceId).catch((err) => {
        console.warn(`[preview] no Fish sample for ${persona.id}: ${err.message}`);
        return null;
      });
      if (audio) {
        this.#store(sampleKey, { audio, source: 'sample' });
        return { audio, source: 'sample' };
      }
    }

    // Test mode (no Fish key) would only play the placeholder beeps, which sound broken.
    if (this.cfg.tts.provider !== 'fish') return { error: 'test_mode', status: 409 };
    if (!this.gateway.canSpend(user, line.length)) return { error: 'quota_exceeded', status: 402 };
    const audio = await this.synth(persona, line);
    if (!audio?.length) return { error: 'preview_unavailable', status: 502 };
    this.gateway.record(user, line.length);
    this.#store(ttsKey, { audio, source: 'tts' });
    return { audio, source: 'tts' };
  }

  async #fishSample(voiceId) {
    if (!/^[a-f0-9]{32}$/.test(voiceId)) throw new Error('not a Fish voice id');
    const headers = this.cfg.tts.apiKey ? { Authorization: `Bearer ${this.cfg.tts.apiKey}` } : {};
    const res = await this.fetch(`${FISH_API}/model/${voiceId}`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`model lookup HTTP ${res.status}`);
    const model = await res.json();
    const url = (model.samples || []).map((s) => s?.audio).find((a) => typeof a === 'string' && sampleHostAllowed(a));
    if (!url) throw new Error('model has no sample clip');
    // Fish keys never go to the storage host.
    const clip = await this.fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!clip.ok) throw new Error(`sample HTTP ${clip.status}`);
    const len = Number(clip.headers.get('content-length') || 0);
    if (len > MAX_SAMPLE_BYTES) throw new Error('sample too large');
    const buf = Buffer.from(await clip.arrayBuffer());
    if (!buf.length || buf.length > MAX_SAMPLE_BYTES) throw new Error('sample empty or too large');
    return buf;
  }

  #synthesize(persona, line) {
    return new Promise((resolve) => {
      const tts = createTtsSession(this.cfg, persona, { speed: resolveVoiceSpeed(persona) });
      const chunks = [];
      const done = (ok) => {
        clearTimeout(timer);
        try { tts.close(); } catch { /* closed */ }
        resolve(ok ? Buffer.concat(chunks) : null);
      };
      const timer = setTimeout(() => done(chunks.length > 0), 15000);
      tts.on('audio', (b) => chunks.push(b));
      tts.on('finish', () => done(true));
      tts.on('error', (err) => {
        console.warn(`[preview] TTS failed for ${persona.id}: ${err.message}`);
        done(false);
      });
      tts.open();
      tts.sendText(line);
      tts.flush();
      tts.stop();
    });
  }
}
