// Voice library: personas.json categories/tags, the /v1/personas picker metadata, and voice previews.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/app.js';
import { JsonStore } from '../src/store.js';
import { loadPersonas } from '../src/personas.js';
import { sampleHostAllowed } from '../src/preview.js';
import { ruleAssistant } from '../src/assistant.js';

const cfg0 = loadConfig();
const personas = loadPersonas(cfg0.personasFile);

test('every character has a known category; the original cast comes first', () => {
  const cats = new Set(personas.categories.map((c) => c.id));
  assert.ok(cats.has('bigsal') && cats.has('comics') && cats.has('southern') && cats.has('british'));
  for (const p of personas.list) {
    assert.ok(cats.has(p.category), `${p.id} has a category`);
    assert.ok(Array.isArray(p.tags) && p.tags.length, `${p.id} has search tags`);
  }
  const order = personas.list.map((p) => p.category);
  const firstOther = order.findIndex((c) => c !== 'bigsal' && c !== 'comics');
  assert.ok(order.slice(firstOther).every((c) => c !== 'bigsal' && c !== 'comics'), "Big Sal's World and Comics are listed first");
  assert.equal(personas.categories[0].id, 'bigsal');
  assert.equal(personas.categories[1].id, 'comics');
});

test('voice-library characters have real Fish voices, an accent label, and stay out of auto-routing', () => {
  const library = personas.list.filter((p) => p.voice);
  assert.ok(library.length >= 30, `at least 30 library voices (${library.length})`);
  const ids = new Set();
  for (const p of library) {
    assert.match(p.fishAudioReferenceId, /^[a-f0-9]{32}$/, `${p.id} voice id`);
    assert.ok(!ids.has(p.fishAudioReferenceId), `${p.id} voice is not reused`);
    ids.add(p.fishAudioReferenceId);
    assert.ok(p.accent, `${p.id} accent label`);
    assert.ok(p.previewLine && p.previewLine.length <= 120, `${p.id} short preview line`);
    assert.deepEqual(p.intentKeywords, [], `${p.id} is only used when picked`);
    assert.match(p.voice.page, /^https:\/\/fish\.audio\/m\/[a-f0-9]{32}\/$/);
    assert.doesNotMatch(p.name, /[()]/, 'accent lives in its own field, not in the name');
  }
});

test('invalid picker metadata is rejected', () => {
  const bad = path.join(os.tmpdir(), `bad-cats-${process.pid}.json`);
  const c = { id: 'x', name: 'X', archetype: 'A', systemPromptRules: '', worldviewPerspective: '', intentKeywords: [], visemeAssets: {} };
  fs.writeFileSync(bad, JSON.stringify({ categories: [{ id: 'fun', label: 'Fun' }], characters: [{ ...c, category: 'nope' }] }));
  assert.throws(() => loadPersonas(bad), /not a known category/);
  fs.writeFileSync(bad, JSON.stringify({ characters: [{ ...c, tags: 'pirate' }] }));
  assert.throws(() => loadPersonas(bad), /tags must be a list/);
});

test('mini-assistant: names with punctuation are safe, the original cast keeps its roles', () => {
  assert.equal(ruleAssistant('switch to Seamus O\'Duffy', personas).action.personaId, 'seamus_oduffy');
  assert.equal(ruleAssistant('switch to Sam Rainey, P.I.', personas).action.personaId, 'detective_sam_rainey');
  assert.equal(ruleAssistant('talk like a coach', personas).action.personaId, 'big_play_ray');
  assert.equal(ruleAssistant('talk like a cowboy', personas).action.personaId, 'tex_calloway');
});

test('sample hosts are limited to Fish Audio storage', () => {
  assert.ok(sampleHostAllowed('https://platform.r2.fish.audio/task/abc.mp3'));
  assert.ok(sampleHostAllowed('https://abc123.r2.cloudflarestorage.com/fish-platform-data/x.mp3?sig=1'));
  assert.ok(!sampleHostAllowed('http://platform.r2.fish.audio/task/abc.mp3'));
  assert.ok(!sampleHostAllowed('https://evil.example/fish.audio.mp3'));
  assert.ok(!sampleHostAllowed('not a url'));
});

let app, base, token, store, calls, cfg;
const CLIP = Buffer.from('ID3fake-mp3-bytes');
const fakeFetch = async (url) => {
  calls.push(String(url));
  const u = new URL(url);
  if (u.hostname === 'api.fish.audio') {
    const id = u.pathname.split('/').pop();
    if (id === personas.get('waylon_ridge').fishAudioReferenceId) {
      return new Response(JSON.stringify({ _id: id, samples: [{ audio: 'https://abc.r2.cloudflarestorage.com/fish-platform-data/w.mp3?X-Amz-Signature=x' }] }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  }
  if (u.hostname.endsWith('.r2.cloudflarestorage.com')) return new Response(CLIP, { status: 200, headers: { 'content-type': 'audio/mpeg' } });
  throw new Error(`unexpected fetch ${url}`);
};

before(async () => {
  cfg = loadConfig({ port: 0 });
  cfg.llm.provider = 'mock';
  cfg.tts.provider = 'mock';
  cfg.tts.apiKey = '';
  cfg.quotas = { free: 5000, pro: 50000 };
  store = new JsonStore(path.join(os.tmpdir(), `voices-${process.pid}-${Date.now()}.json`));
  token = store.createUser({ plan: 'free' }).token;
  app = createApp(cfg, { store, fetchImpl: fakeFetch, synthesize: async () => Buffer.alloc(4000, 1) });
  await new Promise((r) => app.server.listen(0, r));
  base = `http://localhost:${app.server.address().port}`;
});
after(() => app.server.close());

const auth = () => ({ headers: { Authorization: `Bearer ${token}` } });

test('GET /v1/personas sends categories, accents and tags (but no prompts)', async () => {
  const data = await (await fetch(`${base}/v1/personas`)).json();
  assert.equal(data.categories[0].id, 'bigsal');
  assert.equal(data.categoryGroups.accents, 'Accents');
  const tex = data.characters.find((p) => p.id === 'tex_calloway');
  assert.equal(tex.category, 'southern');
  assert.equal(tex.accent, 'Texas cowboy');
  assert.ok(tex.tags.includes('cowboy'));
  assert.ok(!('systemPromptRules' in tex) && !('previewLine' in tex) && !('fishAudioReferenceId' in tex));
});

test('preview: Fish sample is proxied and cached, and costs no quota', async () => {
  calls = [];
  const r = await fetch(`${base}/v1/personas/waylon_ridge/preview`, auth());
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'audio/mpeg');
  assert.equal(r.headers.get('x-preview-source'), 'sample');
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), CLIP);
  assert.equal(calls.length, 2, 'model lookup + clip download');
  assert.ok(!calls[1].includes('api.fish.audio'));
  const again = await fetch(`${base}/v1/personas/waylon_ridge/preview`, auth());
  assert.equal(again.status, 200);
  assert.equal(calls.length, 2, 'second preview served from cache');
  assert.equal(store.getUsage(store.findUserByToken(token).id).chars, 0);
});

test('preview: no sample in test mode answers 409 instead of playing placeholder beeps', async () => {
  const r = await fetch(`${base}/v1/personas/granny_hexley/preview`, auth());
  assert.equal(r.status, 409);
  assert.equal((await r.json()).error, 'test_mode');
});

test('preview: with real voices, falls back to a short TTS line (charged to quota) when there is no sample', async () => {
  cfg.tts.provider = 'fish';
  try {
    const r = await fetch(`${base}/v1/personas/granny_hexley/preview`, auth());
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('x-preview-source'), 'tts');
    assert.equal((await r.arrayBuffer()).byteLength, 4000);
    const used = store.getUsage(store.findUserByToken(token).id).chars;
    assert.equal(used, personas.get('granny_hexley').previewLine.length);
    await fetch(`${base}/v1/personas/granny_hexley/preview`, auth());
    assert.equal(store.getUsage(store.findUserByToken(token).id).chars, used, 'cached replay is free');
  } finally {
    cfg.tts.provider = 'mock';
  }
});

test('preview: needs a token and a known character', async () => {
  assert.equal((await fetch(`${base}/v1/personas/waylon_ridge/preview`)).status, 401);
  assert.equal((await fetch(`${base}/v1/personas/nobody_here/preview`, auth())).status, 404);
});
