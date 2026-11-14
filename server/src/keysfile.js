import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from './config.js';

/**
 * Where fancybot-keys.bat saves keys: Documents\FancyBot\keys.env (Documents may live in OneDrive).
 * FANCYBOT_KEYS points at a specific file. The code itself lives in Documents\FancyBot\code\server,
 * so the file two folders up is checked first: that is the same base folder the setup script uses.
 */
export function keysFileCandidates(env = process.env) {
  const home = env.USERPROFILE || os.homedir();
  const list = [
    env.FANCYBOT_KEYS,
    path.resolve(ROOT, '..', '..', 'keys.env'),
    env.OneDrive && path.join(env.OneDrive, 'Documents', 'FancyBot', 'keys.env'),
    home && path.join(home, 'OneDrive', 'Documents', 'FancyBot', 'keys.env'),
    home && path.join(home, 'Documents', 'FancyBot', 'keys.env'),
  ];
  return [...new Set(list.filter(Boolean))];
}

/** KEY=value lines; blank values and comments are skipped. A UTF-8 BOM (Notepad) is ignored. */
export function parseKeysFile(text) {
  const out = {};
  for (const line of String(text).replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2').trim();
    if (value) out[m[1]] = value;
  }
  return out;
}

/**
 * Fill in any key that is not already set (setup script, .env, or the shell win), so a plain
 * `npm start` uses the saved keys too instead of the mock "babble" voices.
 * Returns { file, loaded: [names] } or null when no keys file was found. Never logs values.
 */
export function loadKeysFile(env = process.env, candidates = keysFileCandidates(env)) {
  for (const file of candidates) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const loaded = [];
    for (const [k, v] of Object.entries(parseKeysFile(text))) {
      if (env[k]) continue;
      env[k] = v;
      loaded.push(k);
    }
    return { file, loaded };
  }
  return null;
}
