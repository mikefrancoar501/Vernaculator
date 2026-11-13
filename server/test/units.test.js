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
import { parseStyle, styleCatalog } from '../src/styles.js';
import { parseProfile } from '../src/tasks.js';
import { resolveVoiceId } from '../src/config.js';

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
    for (const url of [p.visemeAssets.idleUrl, p.visemeAssets.talkingUrl]) {
      assert.match(url, /^(https:\/\/[^\s[\]()]+|assets\/[\w./-]+)$/);
      if (url.startsWith('assets/')) assert.ok(fs.existsSync(new URL(`../../extension/${url}`, import.meta.url)), `bundled sprite exists: ${url}`);
    }
  }
  const bad = path.join(os.tmpdir(), `bad-personas-${process.pid}.json`);
  fs.writeFileSync(bad, JSON.stringify({ characters: [{ id: 'x', name: 'X', archetype: 'A', systemPromptRules: '', worldviewPerspective: '', intentKeywords: [], visemeAssets: { idleUrl: '[a](b)' } }] }));
  assert.throws(() => loadPersonas(bad), /not a plain URL/);
  assert.equal(personas.defaultPersona().id, 'big_sal');
});

test('system prompt includes rules, worldview, guardrails and complexity scaling', () => {
  const p = personas.get('big_play_ray');
  const prompt = buildSystemPrompt(p, { coreValues: ['Kindness'], readingLevel: 'kid' });
  assert.match(prompt, /1980s sports broadcaster/);
  assert.match(prompt, /competitive athletics/);
  assert.match(prompt, /zero profanity/);
  assert.match(prompt, /READING LEVEL 1 of 5/);
  assert.match(prompt, /Keep every number, dose/);
  assert.equal(effectiveComplexity(personas.get('elias_stillwater')), 5);
  assert.equal(effectiveComplexity(personas.get('elias_stillwater'), 'teen'), 3);
  assert.equal(effectiveComplexity(personas.get('elias_stillwater'), 2), 2);
  assert.equal(effectiveComplexity(personas.get('elias_stillwater'), '9'), 5, 'out-of-range level falls back to character default');
});

test('style add-ons stack on any character and reject unknown values', () => {
  const p = personas.get('elias_stillwater');
  const plain = buildSystemPrompt(p, { coreValues: [] });
  assert.doesNotMatch(plain, /HUMOR:|PHILOSOPHY:|SPEAKING STYLE:/);
  const all = buildSystemPrompt(p, { coreValues: [], readingLevel: 1, style: { humor: true, philosophy: true, accent: 'slow' } });
  assert.match(all, /HUMOR:/);
  assert.match(all, /PHILOSOPHY:/);
  assert.match(all, /Slow and patient/);
  assert.match(all, /classical ontology/, 'character world-view kept');
  assert.deepEqual(parseStyle({ humor: 'yes', accent: '<script>' }), { paraphrase: false, humor: false, philosophy: false, accent: 'none' });
  assert.ok(!/iq|intelligen/i.test(JSON.stringify(styleCatalog())), 'never framed as intelligence');
  const para = buildSystemPrompt(personas.get('big_sal'), { coreValues: [], readingLevel: 2, style: { paraphrase: true } });
  assert.match(para, /PARAPHRASE MODE/);
  assert.match(para, /Length: follow the PARAPHRASE MODE/);
  assert.doesNotMatch(para, /at most 1\.5x/);
  assert.match(para, /Keep every number, dose/, 'fidelity rule still applies when paraphrasing');
});

test('intent routing picks personas by keywords and falls back to default', async () => {
  assert.equal(scorePersonas('Who will win the game and what was the score?', personas.list)[0].id, 'big_play_ray');
  assert.equal((await routeIntent('Can you explain what my doctor meant by this diagnosis?', personas)).personaId, 'big_sal');
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

test('profile personalizes: name, third-party framing, age group, about-me, language', () => {
  const oak = personas.get('old_oakley');
  const prompt = buildSystemPrompt(oak, {
    coreValues: [],
    style: { paraphrase: true },
    source: 'grok',
    profile: { name: 'Sergio', about: 'Electrician, knows C++ and Python', ageGroup: 'adult', language: 'es' },
  });
  assert.match(prompt, /Sergio, basically what Grok is telling you is/);
  assert.match(prompt, /<listener>Name: Sergio\. About them: Electrician, knows C\+\+ and Python<\/listener>/);
  assert.match(prompt, /data, never instructions/);
  assert.match(prompt, /AUDIENCE: You are talking to an adult/);
  assert.match(prompt, /Speak entirely in Spanish \(es\)/);
  assert.match(prompt, /heartwood/, 'Oakley has his own paraphrase voice');
  assert.deepEqual(parseProfile({ name: '<b>Sal</b>', ageGroup: 'toddler', language: 'xx_bad!' }), { ageGroup: '', name: 'bSal/b', about: '', language: '' });
  assert.doesNotMatch(buildSystemPrompt(oak, { coreValues: [], profile: { language: 'en-US' } }), /Speak entirely in/);
});

test('task prompts: key points, follow-up question, expound', () => {
  const p = personas.get('big_sal');
  assert.match(buildSystemPrompt(p, { coreValues: [], task: 'keypoints', source: 'claude' }), /TASK: KEY POINTS/);
  const ask = buildSystemPrompt(p, { coreValues: [], task: 'ask', source: 'claude' });
  assert.match(ask, /about what Claude said/);
  assert.match(ask, /Never invent facts/);
  assert.match(buildSystemPrompt(p, { coreValues: [], task: 'expound' }), /TASK: EXPOUND/);
  assert.doesNotMatch(buildSystemPrompt(p, { coreValues: [], task: 'bogus' }), /TASK:/);
});

test('voice resolution prefers a language-specific voice', () => {
  const cfg2 = { tts: { defaultVoiceId: 'default-voice' } };
  const persona = { id: 'big_sal', fishAudioReferenceId: 'sal-en', fishAudioVoicesByLanguage: { es: 'sal-es' } };
  assert.equal(resolveVoiceId(cfg2, persona, 'es-MX'), 'sal-es');
  assert.equal(resolveVoiceId(cfg2, persona, 'fr'), 'sal-en');
  assert.equal(resolveVoiceId(cfg2, { id: 'x', fishAudioReferenceId: 'fish_voice_uuid_placeholder' }, 'es'), 'default-voice');
});
