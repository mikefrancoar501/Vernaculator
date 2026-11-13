import { SentenceBuffer } from './text.js';
import { sanitize } from './guardrails.js';
import { buildSystemPrompt, publicPersona } from './personas.js';
import { routeIntent } from './intent.js';
import { resolveVoiceId } from './config.js';
import { FishSession } from './tts/fish.js';
import { MockSession } from './tts/mock.js';
import { parseReadingLevel, parseStyle, SPEAKING_STYLES } from './styles.js';

const MAX_UTTERANCE_CHARS = 20000;

export function createTtsSession(cfg, persona, { speed = 1 } = {}) {
  if (cfg.tts.provider === 'fish') {
    return new FishSession({ ...cfg.tts, voiceId: resolveVoiceId(cfg, persona), speed });
  }
  return new MockSession({ speed });
}

/** 4-byte big-endian utterance sequence number prefixed to every binary audio frame. */
export function audioFrame(seq, buf) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(seq >>> 0, 0);
  return Buffer.concat([head, buf]);
}

/**
 * One spoken message: raw host-LLM text in (possibly streamed in chunks),
 * persona-styled captions + MP3 audio out.
 *
 *   raw chunk -> [quota check] -> LLM style transfer (streamed)
 *             -> sentence split -> guardrail sanitize -> Fish TTS -> binary audio to client
 */
export class Utterance {
  constructor({ seq, user, opts, deps, send }) {
    this.seq = seq;
    this.user = user;
    // { personaId: string | 'auto', readingLevel: 1-5 | null, style: { humor, philosophy, accent } }
    this.opts = { ...opts, readingLevel: parseReadingLevel(opts.readingLevel), style: parseStyle(opts.style) };
    this.deps = deps; // { cfg, personas, coreValues, llm, gateway }
    this.send = send; // { json(obj), binary(buf) }
    this.chain = Promise.resolve();
    this.persona = null;
    this.tts = null;
    this.spoken = '';
    this.inputChars = 0;
    this.outputChars = 0;
    this.cancelled = false;
    this.abort = new AbortController();
    this.ttsDone = null;
  }

  append(text) {
    if (this.cancelled || !text) return;
    this.chain = this.chain.then(() => this.#process(text)).catch((err) => this.#fail(err));
  }

  end() {
    this.chain = this.chain.then(() => this.#finish()).catch((err) => this.#fail(err));
    return this.chain;
  }

  cancel(reason = 'cancelled') {
    if (this.cancelled) return;
    this.cancelled = true;
    this.abort.abort();
    this.tts?.close();
    this.send.json({ type: 'utterance.cancelled', seq: this.seq, reason });
  }

  async #ensurePersona(firstText) {
    if (this.persona) return;
    const { personas, cfg, llm } = this.deps;
    let method = 'manual';
    let persona = this.opts.personaId && this.opts.personaId !== 'auto' ? personas.get(this.opts.personaId) : null;
    if (!persona) {
      const routed = await routeIntent(firstText, personas, { mode: cfg.intentMode, llm });
      persona = personas.get(routed.personaId);
      method = routed.method;
    }
    this.persona = persona;
    const { readingLevel, style } = this.opts;
    this.system = buildSystemPrompt(persona, { coreValues: this.deps.coreValues, readingLevel, style });
    this.send.json({ type: 'utterance.persona', seq: this.seq, persona: publicPersona(persona), method, readingLevel, style });

    this.tts = createTtsSession(cfg, persona, { speed: SPEAKING_STYLES[style.accent].speed });
    this.ttsDone = new Promise((resolve) => {
      this.tts.on('finish', resolve);
      this.tts.on('error', (err) => {
        this.send.json({ type: 'error', seq: this.seq, code: 'tts_error', message: err.message });
        resolve('error');
      });
    });
    this.tts.on('audio', (buf) => {
      if (!this.cancelled) this.send.binary(audioFrame(this.seq, buf));
    });
    this.tts.open();
  }

  async #process(raw) {
    if (this.cancelled) return;
    this.inputChars += raw.length;
    if (this.inputChars > MAX_UTTERANCE_CHARS) {
      this.send.json({ type: 'error', seq: this.seq, code: 'too_long', message: 'Message too long to read aloud; the rest was skipped.' });
      return;
    }
    const { gateway } = this.deps;
    if (!gateway.canSpend(this.user, raw.length)) {
      this.send.json({ type: 'error', seq: this.seq, code: 'quota_exceeded', message: 'Monthly character quota reached.', usage: gateway.usage(this.user) });
      this.cancel('quota_exceeded');
      return;
    }
    await this.#ensurePersona(raw);

    const sentences = new SentenceBuffer();
    const speak = (s) => this.#speak(s);
    try {
      for await (const delta of this.deps.llm.stream({ system: this.system, text: raw, context: this.spoken.slice(-600), signal: this.abort.signal })) {
        if (this.cancelled) return;
        sentences.push(delta).forEach(speak);
      }
    } catch (err) {
      if (this.cancelled) return;
      // Degrade gracefully: speak the sanitized original rather than going silent.
      this.send.json({ type: 'error', seq: this.seq, code: err.code === 'refusal' ? 'llm_refusal' : 'llm_error', message: err.message, recoverable: true });
      sentences.flush();
      sentences.push(`${raw} `).forEach(speak);
    }
    sentences.flush().forEach(speak);
    this.tts.flush();
  }

  #speak(sentence) {
    if (this.cancelled) return;
    const { clean, flagged } = sanitize(sentence);
    if (!clean.trim()) return;
    this.tts.sendText(clean);
    this.spoken += `${clean} `;
    this.outputChars += clean.length;
    this.deps.gateway.record(this.user, clean.length);
    this.send.json({ type: 'utterance.caption', seq: this.seq, text: clean, filtered: flagged || undefined });
  }

  async #finish() {
    if (this.cancelled) return;
    if (this.tts) {
      this.tts.stop();
      await this.ttsDone;
      this.tts.close();
    }
    if (this.cancelled) return;
    this.send.json({ type: 'utterance.done', seq: this.seq, chars: this.outputChars, text: this.spoken.trim(), usage: this.deps.gateway.usage(this.user) });
  }

  #fail(err) {
    console.error(`[utterance ${this.seq}]`, err);
    if (this.cancelled) return;
    this.send.json({ type: 'error', seq: this.seq, code: 'internal', message: 'Something went wrong voicing this message.' });
    this.cancel('error');
  }
}
