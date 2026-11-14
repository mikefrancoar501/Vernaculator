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
import { parseStyle, styleCatalog, SPEAKING_STYLES, READING_LEVELS } from '../src/styles.js';
import { parseProfile, userMessage } from '../src/tasks.js';
import { parseCast, cleanScript, directorSystem, assignRoles, rolePrompt } from '../src/writersroom.js';
import { parseTown, planTown, townPrompt } from '../src/town.js';
import { ruleAssistant, sanitizeAction, runAssistant } from '../src/assistant.js';
import { resolveVoiceId, resolveVoiceSpeed } from '../src/config.js';
import { isComedian, callbackHook, planJoke, comedyLine, comedyPrompt, COMEDIAN_IDS } from '../src/comedy.js';

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

test('social tasks: crib notes and reply drafts treat the post as a person\'s, not an AI\'s', () => {
  const p = personas.get('big_play_ray');
  const crib = buildSystemPrompt(p, { coreValues: [], task: 'crib', source: 'x' });
  assert.match(crib, /TASK: CRIB NOTES/);
  assert.match(crib, /social media post on X/);
  assert.match(crib, /never at the person/);
  assert.match(crib, /Under 280 characters/);
  assert.doesNotMatch(crib, /an AI assistant\. When it helps/);
  const reply = buildSystemPrompt(p, { coreValues: [], task: 'reply', source: 'instagram' });
  assert.match(reply, /TASK: DRAFT A REPLY/);
  assert.match(reply, /posted by them, after they review it/);
  assert.match(userMessage({ task: 'reply', text: 'Post body', question: 'agree with them' }), /<post>\nPost body\n<\/post>[\s\S]*<question>\nagree with them/);
});

test('writers\' room: cast and script validation', () => {
  assert.deepEqual(parseCast(['big_sal', 'nope'], personas), ['big_sal', 'old_oakley', 'big_play_ray', 'elias_stillwater'], 'falls back to the core four');
  assert.deepEqual(assignRoles(['big_sal', 'old_oakley', 'big_play_ray', 'elias_stillwater'], personas).map((r) => `${r.role}:${r.personaId}`), ['setup:big_play_ray', 'escalate:elias_stillwater', 'wildcard:old_oakley', 'closer:big_sal'], 'core four fill every beat');
  const rusty = personas.get('rusty_peters');
  assert.match(rolePrompt('escalate', rusty), /choosing the good side/);
  assert.match(directorSystem([rusty, personas.get('big_sal')]), /REDEMPTION ARC: Rusty Peters/);
  assert.doesNotMatch(directorSystem([personas.get('big_sal'), personas.get('old_oakley')]), /REDEMPTION ARC/);
  assert.deepEqual(assignRoles(['granny_marigold', 'old_oakley', 'big_play_ray', 'professor_pip'], personas).map((r) => `${r.role}:${r.personaId}`), ['setup:big_play_ray', 'escalate:professor_pip', 'wildcard:old_oakley', 'closer:granny_marigold'], 'roles in beat order');
  assert.deepEqual(assignRoles(['big_play_ray', 'captain_ada_quill'], personas).map((r) => r.role), ['setup', 'closer'], 'two-person scene still has a closer');
  assert.match(rolePrompt('wildcard'), /left-field/);
  assert.deepEqual(parseCast(['big_sal', 'old_oakley', 'big_sal', 'professor_pip', 'granny_marigold', 'big_play_ray'], personas), ['big_sal', 'old_oakley', 'professor_pip', 'granny_marigold']);
  const ids = ['big_sal', 'old_oakley'];
  assert.equal(cleanScript([{ personaId: 'big_sal', line: 'hi' }], ids), null, 'needs two speakers');
  assert.deepEqual(cleanScript([{ personaId: 'big_sal', line: ' a  b ' }, { personaId: 'evil', line: 'x' }, { personaId: 'old_oakley', line: 'c' }], ids), [{ personaId: 'big_sal', line: 'a b' }, { personaId: 'old_oakley', line: 'c' }]);
  const sys = directorSystem([personas.get('big_sal'), personas.get('old_oakley')]);
  assert.match(sys, /never about the poster/);
  assert.match(sys, /no jokes/);
  assert.doesNotMatch(sys, /Seinfeld/i);
  assert.match(directorSystem([personas.get('old_oakley')], { roles: [{ personaId: 'old_oakley', role: 'wildcard' }], director: personas.get('big_sal') }), /You are Big Sal[\s\S]*role: Free spirit/);
});

test('social generations are rate limited per user', () => {
  const g = new Gateway(null, {}, { perMinute: 2, perDay: 3 });
  const u = { id: 'u1' };
  const t = 1_000_000;
  assert.ok(g.takeGeneration(u, t).ok);
  assert.ok(g.takeGeneration(u, t + 1000).ok);
  const blocked = g.takeGeneration(u, t + 2000);
  assert.ok(!blocked.ok && blocked.retryAfterMs === 58000);
  assert.ok(g.takeGeneration({ id: 'u2' }, t + 2000).ok, 'other users unaffected');
  assert.ok(g.takeGeneration(u, t + 61000).ok, 'minute window slides');
  assert.ok(!g.takeGeneration(u, t + 130000).ok, 'daily cap');
});

test('Rapid-fire genius: follows the reading level, fast voice, chosen by the assistant', () => {
  const p = personas.get('big_sal');
  const kid = buildSystemPrompt(p, { coreValues: [], readingLevel: 1, style: { accent: 'rapid' } });
  assert.match(kid, /Rapid-fire genius/);
  assert.match(kid, /never invent studies/);
  assert.ok(kid.includes(READING_LEVELS[1].prompt), 'simple for kids');
  assert.ok(buildSystemPrompt(p, { coreValues: [], readingLevel: 5, style: { accent: 'rapid' } }).includes(READING_LEVELS[5].prompt), 'PhD-dense at expert level');
  assert.equal(SPEAKING_STYLES.rapid.speed, 1.5);
  assert.equal(resolveVoiceSpeed(personas.get('dash_dawson')), 1.7);
  process.env.VOICE_SPEED_DASH_DAWSON = '1.9';
  assert.equal(resolveVoiceSpeed(personas.get('dash_dawson')), 1.9, 'env override for tuning');
  process.env.VOICE_SPEED_DASH_DAWSON = '9';
  assert.equal(resolveVoiceSpeed(personas.get('dash_dawson')), 2, 'clamped to the TTS maximum');
  delete process.env.VOICE_SPEED_DASH_DAWSON;
  assert.equal(personas.get('rusty_peters').voiceSpeed, 1.2, 'Rusty talks fast by nature');
  assert.equal(personas.get('dash_dawson').voiceSpeed, 1.7, 'Dash, the accidental genius, talks fastest');
  assert.match(buildSystemPrompt(personas.get('dash_dawson'), { coreValues: [] }), /no idea he is a genius/);
  assert.equal(ruleAssistant('talk like a fast genius', personas, {}).action.accent, 'rapid');
  assert.equal(ruleAssistant('talk slower please', personas, {}).action.accent, 'slow');
});

test('voice resolution prefers a language-specific voice', () => {
  const cfg2 = { tts: { defaultVoiceId: 'default-voice' } };
  const persona = { id: 'big_sal', fishAudioReferenceId: 'sal-en', fishAudioVoicesByLanguage: { es: 'sal-es' } };
  assert.equal(resolveVoiceId(cfg2, persona, 'es-MX'), 'sal-es');
  assert.equal(resolveVoiceId(cfg2, persona, 'fr'), 'sal-en');
  assert.equal(resolveVoiceId(cfg2, { id: 'x', fishAudioReferenceId: 'fish_voice_uuid_placeholder' }, 'es'), 'default-voice');
});

test('mini-assistant maps requests to settings and validates them', async () => {
  const r1 = ruleAssistant('switch to Old Oakley and talk slower', personas, { readingLevel: 3 });
  assert.equal(r1.action.personaId, 'old_oakley');
  assert.equal(r1.action.accent, 'slow');
  assert.equal(ruleAssistant('who would explain this like a coach?', personas).action.personaId, 'big_play_ray');
  assert.equal(ruleAssistant('Big Sal please', personas).action.personaId, 'big_sal');
  assert.equal(ruleAssistant('that was too complicated', personas, { readingLevel: 3 }).action.readingLevel, 2);
  assert.equal(ruleAssistant('make it bigger', personas, { size: 'S' }).action.size, 'M');
  assert.equal(ruleAssistant('make me laugh', personas).action.humor, true);
  assert.deepEqual(sanitizeAction({ personaId: 'nobody', accent: 'evil', readingLevel: 9, humor: 'yes', size: 'XXL' }, personas), {});
  const none = await runAssistant('hmm', { personas, llm: null, current: {} });
  assert.deepEqual(none.action, {});
  assert.match(none.reply, /switch to Old Oakley/);
});

test('town panel: members validated, answer split by topic with handoffs', () => {
  assert.deepEqual(parseTown(['big_sal', 'nobody', 'big_sal'], personas), [], 'needs 2+ valid members');
  assert.deepEqual(parseTown(['big_sal', 'professor_pip', 'x'], personas), ['big_sal', 'professor_pip']);
  const text = 'Your doctor wants to explain the diagnosis simply.\nIn science terms, space and stars are made of gas, a fun experiment to learn about.\nFor your budget, the cost to save money is low.';
  const plan = planTown(text, ['big_sal', 'professor_pip', 'sir_reginald_ledger'], personas);
  assert.deepEqual(plan.map((p) => p.personaId), ['big_sal', 'professor_pip', 'sir_reginald_ledger']);
  const single = planTown('Plain words here. More plain words. And more.', ['big_sal', 'old_oakley'], personas);
  assert.equal(single.length, 2, 'a one-speaker answer still hands the bottom line to another member');
  const tp = townPrompt({ index: 1, total: 3, prevName: 'Big Sal', nextName: 'Old Oakley', memberNames: ['Big Sal', 'Professor Pip', 'Old Oakley'] });
  assert.match(tp, /handoff from Big Sal/);
  assert.match(tp, /Old Oakley continues after you/);
});

test('town comedians are listed as Comic first names, with their own art and fallback voices', () => {
  const expected = {
    reggie_riff: { name: 'Comic Reggie', full: /Reggie Riff/, voice: 'fish_voice_uuid_placeholder' },
    chuy_carcajadas: { name: 'Comic Chuy', full: /Chuy Carcajadas/, voice: 'fish_voice_uuid_placeholder' },
    marty_midstep: { name: 'Comic Marty', full: /Marty Midstep/, voice: '1619ab48d9d04885bb4bae30f5ec50e0' },
    winnie_brightwater: { name: 'Comic Winnie', full: /Winnie Brightwater/, voice: 'fish_voice_uuid_placeholder' },
    priya_nair: { name: 'Comic Priya', full: /Priya Nair/, voice: 'fish_voice_uuid_placeholder' },
  };
  for (const [id, want] of Object.entries(expected)) {
    const p = personas.get(id);
    assert.ok(p, `missing comedian ${id}`);
    assert.equal(p.name, want.name);
    assert.match(p.systemPromptRules, want.full, 'full name lives in the description');
    assert.match(p.systemPromptRules, /Keep it PG/i);
    assert.match(p.systemPromptRules, /Original material only/i);
    assert.match(p.systemPromptRules, /never a person/i);
    assert.equal(p.fishAudioReferenceId, want.voice);
    assert.equal(p.visemeAssets.idleUrl, `assets/sprites/${id}_idle.svg`);
    assert.equal(p.visemeAssets.talkingUrl, `assets/sprites/${id}_talking.svg`);
    assert.equal(COMEDIAN_IDS[id] !== undefined, true);
    assert.equal(isComedian(p), true);
  }
  assert.match(personas.get('chuy_carcajadas').systemPromptRules, /Kid-safe Spanish only/);
  assert.match(personas.get('priya_nair').systemPromptRules, /started the school comedy club/);
  assert.equal(isComedian(personas.get('big_play_ray')), false);
  // Missing Fish voices fall back the same way as other unfinished personas.
  const voices = { tts: { defaultVoiceId: 'default-voice' } };
  assert.equal(resolveVoiceId(voices, personas.get('reggie_riff')), 'default-voice');
  assert.equal(resolveVoiceId(voices, personas.get('chuy_carcajadas')), 'default-voice');
  assert.equal(resolveVoiceId(voices, personas.get('winnie_brightwater')), 'default-voice');
  assert.equal(resolveVoiceId(voices, personas.get('priya_nair')), 'default-voice');
  assert.equal(resolveVoiceId(voices, personas.get('marty_midstep')), '1619ab48d9d04885bb4bae30f5ec50e0');
});

test('comedy algorithm plans jokes deterministically and shapes social prompts', () => {
  const post = 'The self-checkout asked me for help again.';
  const a = planJoke('standup', post, [], 0);
  const b = planJoke('standup', post, [], 0);
  assert.deepEqual(a, b, 'same text and turn make the same plan');
  const c = planJoke('standup', post, [], 1);
  assert.ok(c.kind, 'a later turn still returns a plan');
  assert.equal(callbackHook(''), '');
  assert.equal(callbackHook('The platypus in a raincoat waved.'), 'platypus');
  assert.equal(planJoke('observer', post, [], 0).hook, '', 'no callback hook without history');
  const hooked = planJoke('improv', 'Yes, and the toaster spoke up.', ['The platypus in a raincoat waved.'], 0);
  if (hooked.kind === 'callback') assert.equal(hooked.hook, 'platypus');

  const line = comedyLine('standup', post);
  assert.match(line, /JOKE BLUEPRINT/);
  assert.match(line, /nah-nah-nah build/);

  const reggie = buildSystemPrompt(personas.get('reggie_riff'), { coreValues: [], task: 'crib', text: post });
  assert.match(reggie, /COMEDY ALGORITHM/);
  assert.match(reggie, /nah-nah-nah build/);
  assert.match(reggie, /never a person/);
  assert.match(reggie, /Original material only/);

  const reply = buildSystemPrompt(personas.get('chuy_carcajadas'), { coreValues: [], task: 'reply', text: post });
  assert.match(reply, /COMEDY ALGORITHM/);
  assert.match(reply, /Kid-safe Spanish only/);
  assert.match(reply, /family is always the hero/i);

  const marty = comedyPrompt(personas.get('marty_midstep'), { task: 'crib', text: post });
  assert.match(marty, /observational/);
  assert.match(marty, /what's the deal with/);

  const winnie = comedyPrompt(personas.get('winnie_brightwater'), { task: 'crib', text: post });
  assert.match(winnie, /yes, and/i);

  const priya = comedyPrompt(personas.get('priya_nair'), { task: 'crib', text: post });
  assert.match(priya, /pun|wordplay|one-liner/i);
  assert.match(priya, /groan/);

  const speak = buildSystemPrompt(personas.get('reggie_riff'), { coreValues: [], task: 'speak', text: post });
  assert.doesNotMatch(speak, /COMEDY ALGORITHM/, 'everyday read-aloud keeps the voice, not a joke plan');
  assert.equal(comedyPrompt(personas.get('big_sal'), { task: 'crib', text: post }), '');
});

test('mini-assistant finds comedians by Comic name or first name', () => {
  assert.equal(ruleAssistant('switch to Comic Reggie', personas).action.personaId, 'reggie_riff');
  assert.equal(ruleAssistant('talk like Priya', personas).action.personaId, 'priya_nair');
  assert.equal(ruleAssistant('switch to Comic Chuy', personas).action.personaId, 'chuy_carcajadas');
  assert.equal(ruleAssistant('switch to Marty', personas).action.personaId, 'marty_midstep');
  assert.equal(ruleAssistant('Winnie please', personas).action.personaId, 'winnie_brightwater');
  assert.equal(ruleAssistant('switch to Big Sal', personas).action.personaId, 'big_sal', '"comic" alone is not a name match');
});

test('a saved Fish key turns real voices on even without TTS_PROVIDER (no more babble beeps)', () => {
  const keep = { TTS_PROVIDER: process.env.TTS_PROVIDER, FISH_API_KEY: process.env.FISH_API_KEY, LLM_PROVIDER: process.env.LLM_PROVIDER, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY };
  try {
    for (const k of Object.keys(keep)) delete process.env[k];
    assert.equal(loadConfig().tts.provider, 'mock');
    assert.equal(loadConfig().llm.provider, 'mock');
    process.env.FISH_API_KEY = 'test-fish-key';
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    assert.equal(loadConfig().tts.provider, 'fish');
    assert.equal(loadConfig().llm.provider, 'anthropic');
    process.env.TTS_PROVIDER = 'mock'; // an explicit choice still wins
    assert.equal(loadConfig().tts.provider, 'mock');
  } finally {
    for (const [k, v] of Object.entries(keep)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});
