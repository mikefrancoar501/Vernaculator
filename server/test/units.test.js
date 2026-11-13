import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { SentenceBuffer, splitSentences } from '../src/text.js';
import { sanitize, containsProfanity } from '../src/guardrails.js';
import { loadPersonas, buildSystemPrompt, effectiveComplexity } from '../src/personas.js';
import { scorePersonas, routeIntent } from '../src/intent.js';
import { JsonStore } from '../src/store.js';
import { Gateway } from '../src/auth.js';
import { loadConfig } from '../src/config.js';
import { splitFrames } from '../src/tts/mp3.js';

const cfg = loadConfig();
const personas = loadPersonas(cfg.personasFile);

test('sentence buffer emits complete sentences incrementally', () => {
  const sb = new SentenceBuffer();
  assert.deepEqual(sb.push('Hello there, friend. This is'), ['Hello there, friend.']);
  assert.deepEqual(sb.push(' a test! And more'), ['This is a test!']);
  assert.deepEqual(sb.flush(), ['And more']);
  assert.deepEqual(splitSentences('One sentence here. Two sentence here?'), ['One sentence here.', 'Two sentence here?']);
});

test('guardrails replace profanity and keep clean text untouched', () => {
  const dirty = ['What the', ['l', 'l', 'e', 'h'].reverse().join(''), 'is this'].join(' ');
  assert.equal(sanitize(dirty).clean, 'What the heck is this');
  assert.ok(containsProfanity(dirty));
  assert.equal(sanitize('Hello class, assess the shell').flagged, false);
});

test('personas.json loads, has plain URLs, and is validated', () => {
  assert.ok(personas.list.length >= 2);
  for (const p of personas.list) {
    assert.match(p.visemeAssets.idleUrl, /^https:\/\/[^\s[\]()]+$/);
    assert.match(p.visemeAssets.talkingUrl, /^https:\/\/[^\s[\]()]+$/);
  }
  const bad = path.join(os.tmpdir(), `bad-personas-${process.pid}.json`);
  fs.writeFileSync(bad, JSON.stringify({ characters: [{ id: 'x', name: 'X', archetype: 'A', systemPromptRules: '', worldviewPerspective: '', intentKeywords: [], visemeAssets: { idleUrl: '[a](b)' } }] }));
  assert.throws(() => loadPersonas(bad), /not a plain URL/);
});

test('system prompt includes rules, worldview, guardrails and complexity scaling', () => {
  const p = personas.get('big_play_ray');
  const prompt = buildSystemPrompt(p, { coreValues: ['Kindness'], readingLevel: 'kid' });
  assert.match(prompt, /1980s sports broadcaster/);
  assert.match(prompt, /competitive athletics/);
  assert.match(prompt, /zero profanity/);
  assert.match(prompt, /Vocabulary level 1/);
  assert.equal(effectiveComplexity(personas.get('elias_stillwater')), 5);
  assert.equal(effectiveComplexity(personas.get('elias_stillwater'), 'teen'), 3);
});

test('intent routing picks personas by keywords and falls back to default', async () => {
  assert.equal(scorePersonas('Who will win the game and what was the score?', personas.list)[0].id, 'big_play_ray');
  assert.equal((await routeIntent('My build fails with a weird error in the code', personas)).personaId, 'captain_ada_quill');
  const fallback = await routeIntent('Zzz qqq', personas);
  assert.equal(fallback.personaId, personas.defaultPersona().id);
  assert.equal(fallback.method, 'default');
});

test('gateway authenticates hashed tokens and enforces monthly quota', () => {
  const file = path.join(os.tmpdir(), `store-${process.pid}-${Date.now()}.json`);
  const store = new JsonStore(file);
  const { user, token } = store.createUser({ plan: 'free' });
  const gw = new Gateway(store, { free: 100, pro: 1000 });
  assert.equal(gw.authenticate(token).id, user.id);
  assert.equal(gw.authenticate('nope'), null);
  assert.ok(!JSON.stringify(store.data).includes(token), 'raw token must not be stored');
  assert.ok(gw.canSpend(user, 100));
  gw.record(user, 60);
  assert.ok(!gw.canSpend(user, 41));
  assert.equal(gw.usage(user).remainingChars, 40);
  store.flush();
  assert.equal(new JsonStore(file).getUsage(user.id).chars, 60);
});

test('mp3 splitter finds whole frames in the mock babble asset', () => {
  const buf = fs.readFileSync(new URL('../assets/mock-babble.mp3', import.meta.url));
  const frames = splitFrames(buf);
  assert.ok(frames.length > 300);
  assert.ok(frames.every((f) => f[0] === 0xff));
});
