// Source and locale checks for the Fancy Bot UX fixes (no browser required).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
const en = JSON.parse(read('extension/_locales/en/messages.json'));
const es = JSON.parse(read('extension/_locales/es/messages.json'));

test('user-visible strings no longer use Sergio as an example', () => {
  assert.doesNotMatch(en.optNameHint.message, /Sergio/i);
  assert.doesNotMatch(es.optNameHint.message, /Sergio/i);
  assert.match(en.optNameHint.message, /Alex/);
  assert.match(es.optNameHint.message, /Álex|Alex/);
  const readme = read('README.md');
  assert.doesNotMatch(readme, /Sergio/);
  assert.match(readme, /Alex, basically what Claude is telling you/);
});

test('help text matches the Meme button and streaming read-aloud', () => {
  assert.match(en.helpVideoBody.message, /🎬 Meme/);
  assert.doesNotMatch(en.helpVideoBody.message, /tap Video\b/i);
  assert.match(es.helpVideoBody.message, /🎬 Meme/);
  assert.doesNotMatch(es.helpVideoBody.message, /toca Video\b/i);
  assert.doesNotMatch(en.helpListenBody.message, /When the answer finishes/i);
  assert.match(en.helpListenBody.message, /while the answer is still coming in/i);
  assert.doesNotMatch(es.helpListenBody.message, /Cuando termine la respuesta/);
  assert.match(es.helpListenBody.message, /mientras la respuesta todavía está llegando/);
});

test('reading-level slider ends match level 1 and level 5 labels', () => {
  assert.equal(en.hudLevelLow.message, en.level1.message);
  assert.equal(en.hudLevelHigh.message, en.level5.message);
  assert.equal(es.hudLevelLow.message, es.level1.message);
  assert.equal(es.hudLevelHigh.message, es.level5.message);
});

test('setup script failure text is tool-neutral and the repo is described as public', () => {
  const setup = read('scripts/fancybot-setup.ps1');
  assert.doesNotMatch(setup, /send it to Claude/i);
  assert.match(setup, /send it to the person who set up Fancy Bot/);
  assert.doesNotMatch(setup, /the repo is private/i);
  assert.match(setup, /the repo is public/);
});

test('options page exposes replaceCompanion and socialPill with current defaults preserved', () => {
  const html = read('extension/options/options.html');
  const js = read('extension/options/options.js');
  assert.match(html, /id="replaceCompanion"/);
  assert.match(html, /id="socialPill"/);
  assert.match(html, /data-i18n="optReplaceCompanion"/);
  assert.match(html, /data-i18n="optSocialPill"/);
  assert.equal(en.optReplaceCompanion.message, "Replace Grok's companion");
  assert.equal(en.optSocialPill.message, 'Show Crib notes button on X/Facebook/Instagram');
  assert.ok(es.optReplaceCompanion.message);
  assert.ok(es.optSocialPill.message);
  assert.match(js, /\$\('replaceCompanion'\)\.checked = s\.replaceCompanion !== false/);
  assert.match(js, /\$\('socialPill'\)\.checked = s\.socialPill !== false/);
});

test('new installs default to size M, and a one-time press-and-hold hint exists', () => {
  const ns = read('extension/content/ns.js');
  const hud = read('extension/content/hud.js');
  const main = read('extension/content/main.js');
  assert.match(ns, /hudSize:\s*'M'/);
  assert.match(ns, /stored\.hudSize === undefined/);
  assert.match(ns, /innerWidth < 360/);
  assert.match(hud, /data-i18n="controlsHint"/);
  assert.match(hud, /showControlsHint\(/);
  assert.match(main, /if \(!settings\.controlsHintSeen\) hud\.showControlsHint\(\)/);
  assert.equal(en.controlsHint.message, 'Press and hold Sal for controls');
  assert.ok(es.controlsHint.message);
});

test('town strip UI caps selection at 6, matching the server', () => {
  const hud = read('extension/content/hud.js');
  const ns = read('extension/content/ns.js');
  assert.match(ns, /const MAX_TOWN = 6/);
  assert.match(hud, /Vern\.MAX_TOWN \|\| 6/);
  assert.match(hud, /ids\.length > max/);
  assert.equal(en.hudTownLimit.message, 'Pick up to 6 characters.');
  assert.equal(es.hudTownLimit.message, 'Elige hasta 6 personajes.');
  const town = read('server/src/town.js');
  assert.match(town, /export const MAX_TOWN = 6/);
});

test('README tickle module is gestures.js', () => {
  const readme = read('README.md');
  assert.doesNotMatch(readme, /tickle\.js/);
  assert.match(readme, /`gestures\.js`/);
  assert.ok(fs.existsSync(path.join(root, 'extension/content/gestures.js')));
});
