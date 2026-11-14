import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseKeysFile, loadKeysFile, keysFileCandidates } from '../src/keysfile.js';

test('keys.env parsing skips comments and blank values and tolerates a BOM and quotes', () => {
  const got = parseKeysFile('\uFEFF# Fancy Bot keys\r\nFISH_API_KEY= "abc123" \r\nANTHROPIC_API_KEY=\r\nTTS_PROVIDER=fish\r\n');
  assert.deepEqual(got, { FISH_API_KEY: 'abc123', TTS_PROVIDER: 'fish' });
});

test('npm start picks up Documents\\FancyBot\\keys.env without overriding what is already set', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fbkeys-'));
  const file = path.join(dir, 'keys.env');
  fs.writeFileSync(file, 'FISH_API_KEY=from-file\nTTS_PROVIDER=fish\nLLM_PROVIDER=anthropic\nANTHROPIC_API_KEY=file-anthropic\n');
  const env = { LLM_PROVIDER: 'mock' };
  const res = loadKeysFile(env, [path.join(dir, 'missing.env'), file]);
  assert.equal(res.file, file);
  assert.equal(env.FISH_API_KEY, 'from-file');
  assert.equal(env.TTS_PROVIDER, 'fish');
  assert.equal(env.LLM_PROVIDER, 'mock'); // the shell's own value wins
  assert.ok(!res.loaded.includes('LLM_PROVIDER'));
  assert.equal(loadKeysFile({}, [path.join(dir, 'nope.env')]), null);
  fs.rmSync(dir, { recursive: true });
});

test('keys.env is looked for in FANCYBOT_KEYS, next to the code, and in Documents or OneDrive\\Documents', () => {
  const c = keysFileCandidates({ FANCYBOT_KEYS: '/x/keys.env', USERPROFILE: '/home/u', OneDrive: '/home/u/OneDrive' });
  assert.equal(c[0], '/x/keys.env');
  assert.ok(c.includes(path.join('/home/u/OneDrive', 'Documents', 'FancyBot', 'keys.env')));
  assert.ok(c.includes(path.join('/home/u', 'Documents', 'FancyBot', 'keys.env')));
});
