// Writers' room scenes on X: a 4-member cast (with a comedian) must give everyone a voice, and the
// widget must hear about it when fewer characters can speak.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/app.js';
import { JsonStore } from '../src/store.js';
import { MockLLM } from '../src/llm.js';
import { loadPersonas } from '../src/personas.js';
import { cleanScript, includeEveryone, parseCast, resolveSpeaker } from '../src/writersroom.js';

const CAST = ['marty_midstep', 'old_oakley', 'big_play_ray', 'elias_stillwater'];
const POST = 'My neighbor mows at 6am.';
const personas = loadPersonas(loadConfig().personasFile);
const nameOf = (p) => /performing as "([^"]+)"/.exec(p)?.[1];
const rateLimited = () => Object.assign(new Error('429 {"type":"rate_limit_error","message":"Number of request tokens has exceeded your per-minute rate limit"}'), { status: 429 });

const apps = [];
after(() => { for (const a of apps) { for (const c of a.wss.clients) c.terminate(); a.server.close(); } });

async function runScene(llm, { town = CAST, director = 'big_sal' } = {}) {
  const cfg = loadConfig({ port: 0 });
  cfg.llm.provider = 'mock';
  cfg.tts.provider = 'mock';
  const store = new JsonStore(path.join(os.tmpdir(), `room-${process.pid}-${Date.now()}-${Math.random()}.json`));
  const token = store.createUser({ plan: 'pro' }).token;
  const app = createApp(cfg, { store, llm });
  apps.push(app);
  await new Promise((r) => app.server.listen(0, r));
  const ws = new WebSocket(`ws://localhost:${app.server.address().port}/v1/stream`);
  const events = [];
  ws.on('message', (data, isBinary) => { if (!isBinary) events.push(JSON.parse(data.toString())); });
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  const waitFor = (pred, ms = 30000) => new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      const hit = events.find(pred);
      if (hit) return resolve(hit);
      if (Date.now() - t0 > ms) return reject(new Error(`timeout; events: ${JSON.stringify(events.map((e) => e.type))}`));
      setTimeout(tick, 20);
    };
    tick();
  });
  ws.send(JSON.stringify({ type: 'auth', token }));
  await waitFor((e) => e.type === 'auth.ok');
  // Exactly what the extension sends for '🎬 Writers' room scene' on X (the cast rides in `town`).
  ws.send(JSON.stringify({ type: 'utterance.start', seq: 7, personaId: 'big_sal', task: 'scene', source: 'x', style: { paraphrase: true, humor: true, philosophy: true, accent: 'none' }, town, director, text: POST, final: true }));
  const end = await waitFor((e) => (e.type === 'utterance.done' || (e.type === 'error' && !e.recoverable)) && e.seq === 7);
  ws.close();
  const speakers = events.filter((e) => e.type === 'utterance.segment').map((e) => e.persona.id);
  return { end, events, speakers, notice: events.find((e) => e.type === 'scene.notice') };
}

test('writers\' room: speaker labels map to cast ids (Comic Marty, first names)', () => {
  assert.equal(resolveSpeaker('Comic Marty', CAST, personas), 'marty_midstep');
  assert.equal(resolveSpeaker('Marty Midstep', CAST, personas), 'marty_midstep');
  assert.equal(resolveSpeaker('Oakley', CAST, personas), 'old_oakley');
  assert.equal(resolveSpeaker('Big', [...CAST, 'big_sal'], personas), null, 'ambiguous first word');
  const script = cleanScript([{ personaId: 'Comic Marty', line: 'Hi.' }, { personaId: 'Big Play Ray', line: 'Ho.' }, { personaId: 'nobody', line: 'x' }], CAST, personas);
  assert.deepEqual(script.map((l) => l.personaId), ['marty_midstep', 'big_play_ray']);
  assert.deepEqual(parseCast(CAST, personas), CAST, 'comedians are valid cast members');
  const all = includeEveryone(script, CAST.map((id) => ({ personaId: id, line: `${id} pitch` })));
  assert.deepEqual(new Set(all.map((l) => l.personaId)), new Set(CAST), 'everyone who pitched speaks');
  assert.equal(all.at(-1).line, 'Ho.', 'the closing line stays last');
});

test('writers\' room: a rate-limit burst no longer collapses the scene to one character', async () => {
  // Reproduces Mike's report: the AI provider rejects most of the parallel pitch calls and the
  // director call (rate limit after a few scenes in a row). Before the fix every error was
  // swallowed and the scene was built from the one pitch that got through: one voice, no message.
  class BurstLLM extends MockLLM {
    tries = new Map();
    directs = 0;
    async complete(args) {
      const who = nameOf(args.system);
      const n = (this.tries.get(who) || 0) + 1;
      this.tries.set(who, n);
      if (who !== 'Comic Marty' && n === 1) throw rateLimited();
      return super.complete(args);
    }
    async direct(args) {
      if (++this.directs === 1) throw rateLimited();
      return super.direct(args);
    }
  }
  const { end, speakers, notice } = await runScene(new BurstLLM());
  assert.equal(end.type, 'utterance.done');
  assert.deepEqual(new Set(speakers), new Set(CAST), `all four speak (${speakers})`);
  assert.equal(notice, undefined, 'no warning when the whole cast speaks');
});

test('writers\' room: when the AI keeps failing, the widget is told who could not speak', async () => {
  class DownLLM extends MockLLM {
    async complete(args) {
      if (nameOf(args.system) !== 'Comic Marty') throw rateLimited();
      return super.complete(args);
    }
    async direct() { throw rateLimited(); }
  }
  const { end, speakers, notice } = await runScene(new DownLLM());
  assert.equal(end.type, 'utterance.done');
  assert.deepEqual(speakers, ['marty_midstep']);
  assert.ok(notice, 'scene.notice sent');
  assert.equal(notice.reason, 'pitch_failed');
  assert.deepEqual(notice.speakers.map((p) => p.name), ['Comic Marty']);
  assert.deepEqual(notice.missing.map((p) => p.id).sort(), ['big_play_ray', 'elias_stillwater', 'old_oakley']);
  assert.match(notice.detail, /rate limit/);
});

test('writers\' room: a director that uses display names or skips someone still voices the full cast', async () => {
  class NamesLLM extends MockLLM {
    async direct() {
      return [
        { personaId: 'Comic Marty', line: 'Six a.m. is not a lawn hour.' },
        { personaId: 'Old Oakley', line: 'The grass was asleep, friend.' },
        { personaId: 'Big Play Ray', line: 'And that is the whole post.' },
      ];
    }
  }
  const { end, speakers, notice } = await runScene(new NamesLLM());
  assert.equal(end.type, 'utterance.done');
  assert.deepEqual(new Set(speakers), new Set(CAST), `all four speak (${speakers})`);
  assert.equal(speakers.at(-1), 'big_play_ray', 'closer keeps the last line');
  assert.equal(notice, undefined);
});

test('writers\' room: a stale cast id is ignored and reported', async () => {
  const { end, speakers, notice } = await runScene(new MockLLM(), { town: ['old_oakley', 'big_play_ray', 'comic_nobody'] });
  assert.equal(end.type, 'utterance.done');
  assert.deepEqual(new Set(speakers), new Set(['old_oakley', 'big_play_ray']));
  assert.equal(notice.reason, 'unknown_cast');
  assert.deepEqual(notice.unknown, ['comic_nobody']);
});
