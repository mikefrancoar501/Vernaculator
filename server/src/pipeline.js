import { SentenceBuffer } from './text.js';
import { sanitize } from './guardrails.js';
import { buildSystemPrompt, publicPersona } from './personas.js';
import { routeIntent } from './intent.js';
import { resolveVoiceId } from './config.js';
import { FishSession } from './tts/fish.js';
import { MockSession } from './tts/mock.js';
import { parseReadingLevel, parseStyle, SPEAKING_STYLES } from './styles.js';
import { parseTask, parseProfile, parseSource } from './tasks.js';
import { parseTown, planTown, townPrompt } from './town.js';

const MAX_UTTERANCE_CHARS = 20000;

export function createTtsSession(cfg, persona, { speed = 1, language = '' } = {}) {
  if (cfg.tts.provider === 'fish') {
    return new FishSession({ ...cfg.tts, voiceId: resolveVoiceId(cfg, persona, language), speed, language: language || null });
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
    // personaId: id | 'auto'; readingLevel: 1-5 | null; style: { paraphrase, humor, philosophy, accent };
    // task: speak | keypoints | ask | expound; question (ask); profile: { name, about, ageGroup, language }; source: claude | grok | gemini
    this.opts = {
      ...opts,
      readingLevel: parseReadingLevel(opts.readingLevel),
      style: parseStyle(opts.style),
      task: parseTask(opts.task),
      question: String(opts.question || '').slice(0, 1000),
      profile: parseProfile(opts.profile),
      source: parseSource(opts.source),
    };
    // Town panel: 2-6 persona ids that share the answer.
    this.town = this.opts.task === 'speak' ? parseTown(opts.town, deps.personas) : [];
    // Paraphrase, town and the question tasks need the whole answer before anyone starts talking.
    this.wholeAnswer = this.opts.task !== 'speak' || this.opts.style.paraphrase || this.town.length > 0;
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
    if (this.wholeAnswer) {
      // Buffer until end().
      this.buffered = (this.buffered || '') + (this.buffered ? '\n' : '') + text;
      return;
    }
    this.chain = this.chain.then(() => this.#process(text)).catch((err) => this.#fail(err));
  }

  end() {
    if (this.buffered && !this.cancelled) {
      const all = this.buffered;
      this.buffered = '';
      this.send.json({ type: 'utterance.status', seq: this.seq, status: this.opts.task === 'speak' ? 'paraphrasing' : this.opts.task });
      this.chain = this.chain.then(() => this.#process(all)).catch((err) => this.#fail(err));
    }
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
    const { readingLevel, style, task, profile, source } = this.opts;
    this.system = buildSystemPrompt(persona, { coreValues: this.deps.coreValues, readingLevel, style, task, profile, source });
    this.send.json({ type: 'utterance.persona', seq: this.seq, persona: publicPersona(persona), method, readingLevel, style, task, language: profile.language || null });

    this.#openTts(persona);
  }

  /** Opens a TTS session for `persona` as the current voice. */
  #openTts(persona) {
    const { style, profile } = this.opts;
    this.tts = createTtsSession(this.deps.cfg, persona, { speed: SPEAKING_STYLES[style.accent].speed, language: profile.language });
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
    if (this.town.length) return this.#processTown(raw);
    await this.#ensurePersona(raw);
    await this.#streamInto(raw);
  }

  /** Town panel: each section is voiced by its own character, one after another. */
  async #processTown(raw) {
    const { personas, coreValues } = this.deps;
    const { readingLevel, style, profile, source } = this.opts;
    const plan = planTown(raw, this.town, personas);
    const memberNames = this.town.map((id) => personas.get(id).name);
    this.send.json({ type: 'town.plan', seq: this.seq, members: this.town.map((id) => publicPersona(personas.get(id))), segments: plan.map((p) => p.personaId) });
    for (const [index, seg] of plan.entries()) {
      if (this.cancelled) return;
      const persona = personas.get(seg.personaId);
      this.persona = persona;
      this.system = [
        buildSystemPrompt(persona, { coreValues, readingLevel, style, task: 'speak', profile, source }),
        townPrompt({ index, total: plan.length, prevName: personas.get(plan[index - 1]?.personaId)?.name, nextName: personas.get(plan[index + 1]?.personaId)?.name, memberNames }),
      ].join('\n\n');
      this.send.json({ type: 'utterance.segment', seq: this.seq, index, total: plan.length, persona: publicPersona(persona) });
      if (index === 0) this.send.json({ type: 'utterance.persona', seq: this.seq, persona: publicPersona(persona), method: 'town', readingLevel, style, task: 'speak', language: profile.language || null });
      this.#openTts(persona);
      await this.#streamInto(seg.text, { town: true });
      if (this.cancelled) return;
      this.tts.stop();
      await this.ttsDone;
      this.tts.close();
      this.tts = null;
    }
  }

  async #streamInto(raw, { town = false } = {}) {
    const sentences = new SentenceBuffer();
    const speak = (s) => this.#speak(s);
    try {
      const { task, question } = this.opts;
      const stream = this.deps.llm.stream({
        system: this.system,
        task,
        text: raw,
        question,
        context: task === 'speak' && !town ? this.spoken.slice(-600) : '',
        town,
        research: task === 'expound',
        onSources: (sources) => this.send.json({ type: 'utterance.sources', seq: this.seq, sources }),
        signal: this.abort.signal,
      });
      for await (const delta of stream) {
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
