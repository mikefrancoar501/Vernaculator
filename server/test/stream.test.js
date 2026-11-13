import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/app.js';
import { JsonStore } from '../src/store.js';

let app, base, token, store;

before(async () => {
  const cfg = loadConfig({ port: 0 });
  cfg.llm.provider = 'mock';
  cfg.tts.provider = 'mock';
  cfg.quotas = { free: 5000, pro: 50000 };
  store = new JsonStore(path.join(os.tmpdir(), `stream-${process.pid}-${Date.now()}.json`));
  token = store.createUser({ plan: 'free' }).token;
  app = createApp(cfg, { store });
  await new Promise((r) => app.server.listen(0, r));
  base = `localhost:${app.server.address().port}`;
});

// Terminate sockets so a failed assertion can't leave the server (and the test run) hanging.
after(() => { for (const c of app.wss.clients) c.terminate(); app.server.close(); });

function connect(origin) {
  const ws = new WebSocket(`ws://${base}/v1/stream`, origin ? { origin } : {});
  const events = [];
  const audio = [];
  ws.on('message', (data, isBinary) => {
    if (isBinary) audio.push(data);
    else events.push(JSON.parse(data.toString()));
  });
  const waitFor = (pred, ms = 8000) =>
    new Promise((resolve, reject) => {
      const t0 = Date.now();
      const tick = () => {
        const hit = events.find(pred);
        if (hit) return resolve(hit);
        if (Date.now() - t0 > ms) return reject(new Error(`timeout; events: ${JSON.stringify(events)}`));
        setTimeout(tick, 20);
      };
      tick();
    });
  return { ws, events, audio, waitFor, opened: new Promise((r, j) => { ws.on('open', r); ws.on('error', j); }) };
}

test('REST: health, personas, auth, transform', async () => {
  const health = await (await fetch(`http://${base}/health`)).json();
  assert.equal(health.ok, true);
  const personas = await (await fetch(`http://${base}/v1/personas`)).json();
  assert.ok(personas.characters.length >= 2);
  assert.ok(!('systemPromptRules' in personas.characters[0]), 'prompts stay server-side');
  assert.equal(personas.defaultPersonaId, 'big_sal');
  assert.equal(personas.styles.readingLevels['1'], 'Super simple');
  assert.ok(personas.styles.speakingStyles.slow);
  assert.equal((await fetch(`http://${base}/v1/usage`)).status, 401);
  const res = await fetch(`http://${base}/v1/transform`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Who will win the big game tonight?', personaId: 'auto' }),
  });
  const body = await res.json();
  assert.equal(body.persona.id, 'big_play_ray');
  const asst = await (await fetch(`http://${base}/v1/assistant`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'switch to Big Sal', current: { size: 'S' } }),
  })).json();
  assert.equal(asst.action.personaId, 'big_sal');
  assert.match(body.text, /Big Play Ray here/);
});

test('WebSocket: streamed utterance yields persona, captions, audio and done', async () => {
  const c = connect();
  await c.opened;
  c.ws.send(JSON.stringify({ type: 'auth', token }));
  await c.waitFor((e) => e.type === 'auth.ok');

  c.ws.send(JSON.stringify({ type: 'utterance.start', seq: 7, personaId: 'auto', readingLevel: 1, style: { humor: true, accent: 'slow' } }));
  c.ws.send(JSON.stringify({ type: 'utterance.text', seq: 7, text: 'Science is fun. Space is huge and ' }));
  c.ws.send(JSON.stringify({ type: 'utterance.text', seq: 7, text: 'full of stars.' }));
  c.ws.send(JSON.stringify({ type: 'utterance.end', seq: 7 }));

  const persona = await c.waitFor((e) => e.type === 'utterance.persona');
  assert.equal(persona.persona.id, 'professor_pip');
  assert.equal(persona.readingLevel, 1);
  assert.deepEqual(persona.style, { paraphrase: false, humor: true, philosophy: false, accent: 'slow' });
  const done = await c.waitFor((e) => e.type === 'utterance.done');
  assert.ok(done.chars > 20);
  const captions = c.events.filter((e) => e.type === 'utterance.caption').map((e) => e.text);
  assert.ok(captions.length >= 2, `captions: ${captions}`);
  assert.ok(c.audio.length > 0, 'received audio frames');
  for (const frame of c.audio) {
    assert.equal(frame.readUInt32BE(0), 7, 'audio frames carry the utterance seq');
    assert.equal(frame[4], 0xff, 'payload starts on an MP3 frame');
  }
  assert.ok(done.usage.usedChars >= done.chars);
  c.ws.close();
});

test('WebSocket: paraphrase waits for the whole answer and returns a short version', async () => {
  const c = connect();
  await c.opened;
  c.ws.send(JSON.stringify({ type: 'auth', token }));
  await c.waitFor((e) => e.type === 'auth.ok');
  const long = [
    'High blood pressure means your heart works harder than it should.',
    'It often has no symptoms, which is why it is called a silent condition.',
    'Doctors measure it with a cuff on your arm.',
    'Many lifestyle factors matter, including salt, sleep, stress and exercise.',
    'Take 10 mg of lisinopril once a day.',
    'Some people notice a dry cough.',
    'Call your doctor right away if you feel faint or your lips swell.',
  ];
  c.ws.send(JSON.stringify({ type: 'utterance.start', seq: 9, personaId: 'big_sal', style: { paraphrase: true }, source: 'grok', profile: { name: 'Sergio' } }));
  for (const s of long.slice(0, 4)) c.ws.send(JSON.stringify({ type: 'utterance.text', seq: 9, text: s }));
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(c.events.filter((e) => e.type === 'utterance.caption').length, 0, 'nothing spoken before the answer is complete');
  for (const s of long.slice(4)) c.ws.send(JSON.stringify({ type: 'utterance.text', seq: 9, text: s }));
  c.ws.send(JSON.stringify({ type: 'utterance.end', seq: 9 }));
  await c.waitFor((e) => e.type === 'utterance.status' && e.status === 'paraphrasing');
  const done = await c.waitFor((e) => e.type === 'utterance.done');
  assert.ok(done.text.length < long.join(' ').length * 0.75, `paraphrase is shorter (${done.text.length} vs ${long.join(' ').length})`);
  assert.match(done.text, /Sergio, basically what Grok is telling you/, 'personal, third-party framing');
  assert.match(done.text, /10 mg/, 'dose kept');
  assert.match(done.text, /Call your doctor/, 'warning kept');
  assert.ok(c.audio.length > 0);
  c.ws.close();
});

test('WebSocket: key points and follow-up questions about the last answer', async () => {
  const c = connect();
  await c.opened;
  c.ws.send(JSON.stringify({ type: 'auth', token }));
  await c.waitFor((e) => e.type === 'auth.ok');
  const answer = 'Lisinopril lowers blood pressure. Take 10 mg once a day. A dry cough is a common side effect. Call your doctor if your lips swell.';
  c.ws.send(JSON.stringify({ type: 'utterance.start', seq: 21, personaId: 'old_oakley', task: 'keypoints', source: 'claude', text: answer, final: true }));
  const kp = await c.waitFor((e) => e.type === 'utterance.done' && e.seq === 21);
  assert.match(kp.text, /First, .*Second, /);
  const persona = c.events.find((e) => e.type === 'utterance.persona' && e.seq === 21);
  assert.equal(persona.task, 'keypoints');
  assert.equal(persona.persona.id, 'old_oakley');

  c.ws.send(JSON.stringify({ type: 'utterance.start', seq: 22, personaId: 'big_sal', task: 'ask', question: 'What about the cough?', source: 'claude', text: answer, final: true, profile: { name: 'Sergio' } }));
  const ans = await c.waitFor((e) => e.type === 'utterance.done' && e.seq === 22);
  assert.match(ans.text, /Claude said: A dry cough/);
  c.ws.close();
});

test('WebSocket: crib notes and a reply draft for a social media post', async () => {
  const c = connect();
  await c.opened;
  c.ws.send(JSON.stringify({ type: 'auth', token }));
  await c.waitFor((e) => e.type === 'auth.ok');
  const post = 'Our city council voted to replace every streetlight with LEDs this spring. It will cost 2 million dollars. They say it pays for itself in six years.';
  c.ws.send(JSON.stringify({ type: 'utterance.start', seq: 41, personaId: 'big_play_ray', task: 'crib', source: 'x', text: post, final: true }));
  const crib = await c.waitFor((e) => e.type === 'utterance.done' && e.seq === 41);
  assert.match(crib.text, /^Crib notes: Our city council/);
  assert.match(crib.text, /six years/);
  assert.equal(c.events.find((e) => e.type === 'utterance.persona' && e.seq === 41).task, 'crib');
  assert.ok(c.audio.some((a) => a.readUInt32BE(0) === 41), 'crib notes are voiced (for the video)');

  c.ws.send(JSON.stringify({ type: 'utterance.start', seq: 42, personaId: 'big_play_ray', task: 'reply', question: 'Bright idea', source: 'x', text: post, final: true }));
  const reply = await c.waitFor((e) => e.type === 'utterance.done' && e.seq === 42);
  assert.match(reply.text, /Bright idea\./);
  c.ws.close();
});

test('WebSocket: writers\' room turns a post into a multi-character mini-scene', async () => {
  const c = connect();
  await c.opened;
  c.ws.send(JSON.stringify({ type: 'auth', token }));
  await c.waitFor((e) => e.type === 'auth.ok');
  const post = 'Our office got a new coffee machine with 47 settings. Nobody knows how to make plain coffee anymore. There is now a laminated guide.';
  c.ws.send(JSON.stringify({ type: 'utterance.start', seq: 51, task: 'scene', source: 'x', town: ['big_play_ray', 'granny_marigold', 'professor_pip'], text: post, final: true }));
  const done = await c.waitFor((e) => e.type === 'utterance.done' && e.seq === 51, 15000);
  const statuses = c.events.filter((e) => e.type === 'utterance.status' && e.seq === 51).map((e) => e.status);
  assert.ok(statuses.includes('pitching') && statuses.includes('directing'), `pitch then direct (${statuses})`);
  const segs = c.events.filter((e) => e.type === 'utterance.segment' && e.seq === 51).map((e) => e.persona.id);
  assert.ok(new Set(segs).size >= 2, `several characters speak (${segs})`);
  assert.ok(done.script.length === segs.length, 'one script line per voiced segment');
  assert.match(done.text, /^Big Play Ray: So our office got a new coffee machine/m);
  assert.match(done.text, /^Granny Marigold: Wait, /m);
  const castEv = c.events.find((e) => e.type === 'scene.cast' && e.seq === 51);
  assert.equal(castEv.director.id, 'big_sal');
  assert.deepEqual(castEv.roles.map((r) => r.role), ['setup', 'escalate', 'closer']);
  assert.deepEqual(segs.slice(0, 3), ['big_play_ray', 'professor_pip', 'granny_marigold'], 'lines follow the beats');
  const caps = c.events.filter((e) => e.type === 'utterance.caption' && e.seq === 51);
  assert.ok(caps.every((e) => e.speaker), 'captions carry the speaker');
  assert.ok(c.audio.filter((a) => a.readUInt32BE(0) === 51).length >= segs.length, 'each line is voiced');
  c.ws.close();
});

test('WebSocket: town panel voices each section with its own character', async () => {
  const c = connect();
  await c.opened;
  c.ws.send(JSON.stringify({ type: 'auth', token }));
  await c.waitFor((e) => e.type === 'auth.ok');
  const text = 'Your doctor wants to explain the diagnosis simply.\nIn science terms, space and stars are made of gas, a fun experiment.\nFor your budget, the cost to save money is low.';
  c.ws.send(JSON.stringify({ type: 'utterance.start', seq: 31, town: ['big_sal', 'professor_pip', 'sir_reginald_ledger'], text, final: true }));
  const done = await c.waitFor((e) => e.type === 'utterance.done' && e.seq === 31, 15000);
  const segs = c.events.filter((e) => e.type === 'utterance.segment' && e.seq === 31);
  assert.deepEqual(segs.map((e) => e.persona.id), ['big_sal', 'professor_pip', 'sir_reginald_ledger']);
  assert.match(done.text, /Thanks, Big Sal\. Professor Pip:/, 'handoff between characters');
  assert.ok(c.audio.length >= 3);
  c.ws.close();
});

test('WebSocket: rejects bad token and disallowed origin', async () => {
  const c = connect();
  await c.opened;
  c.ws.send(JSON.stringify({ type: 'auth', token: 'bad' }));
  await c.waitFor((e) => e.type === 'auth.error');

  const evil = new WebSocket(`ws://${base}/v1/stream`, { origin: 'https://evil.example' });
  await assert.rejects(new Promise((r, j) => { evil.on('open', r); evil.on('error', j); }), /403/);
});

test('WebSocket: quota exceeded cancels utterance', async () => {
  const { user, token: t2 } = store.createUser({ plan: 'free' });
  store.addUsage(user.id, 4990);
  const c = connect('https://claude.ai');
  await c.opened;
  c.ws.send(JSON.stringify({ type: 'auth', token: t2 }));
  await c.waitFor((e) => e.type === 'auth.ok');
  c.ws.send(JSON.stringify({ type: 'utterance.start', seq: 1, text: 'This sentence is definitely longer than ten characters.', final: true }));
  const err = await c.waitFor((e) => e.type === 'error');
  assert.equal(err.code, 'quota_exceeded');
  c.ws.close();
});
