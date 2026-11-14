// Unit tests for the page-top face row: cap at 4, and stay clear of the widget header.
// Run: node --test extension/test/town-strip.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load() {
  const ctx = { window: {}, console, Vern: {} };
  ctx.window.Vern = ctx.Vern;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'content', 'town.js'), 'utf8'), ctx);
  return ctx.Vern;
}

const faces = (...ids) => ids.map((id) => ({ id, name: id }));

test('face row stays at 4, and keeps a chosen library voice visible', () => {
  const V = load();
  assert.equal(V.MAX_STRIP_FACES, 4);
  const four = faces('big_sal', 'old_oakley', 'big_play_ray', 'elias_stillwater');
  assert.deepEqual(V.pickStripMembers(four).map((m) => m.id), ['big_sal', 'old_oakley', 'big_play_ray', 'elias_stillwater']);
  const five = faces('big_sal', 'old_oakley', 'big_play_ray', 'elias_stillwater', 'tex_calloway');
  assert.deepEqual(V.pickStripMembers(five, 'big_sal').map((m) => m.id), ['big_sal', 'old_oakley', 'big_play_ray', 'elias_stillwater']);
  assert.deepEqual(V.pickStripMembers(five, 'tex_calloway').map((m) => m.id), ['big_sal', 'old_oakley', 'big_play_ray', 'tex_calloway']);
  assert.deepEqual(V.pickStripMembers(faces('a', 'b'), 'a').map((m) => m.id), ['a', 'b']);
  assert.deepEqual(V.pickStripMembers([], 'tex_calloway'), []);
});

test('placeStrip stays centered when the widget is not in the top band', () => {
  const V = load();
  const mid = V.placeStrip({ viewportWidth: 900, hud: { left: 600, right: 900, top: 400, bottom: 700 } });
  assert.equal(mid.transform, 'translateX(-50%)');
  assert.equal(mid.left, 450);
  assert.equal(mid.maxWidth, 884);
  const missing = V.placeStrip({ viewportWidth: 900 });
  assert.equal(missing.transform, 'translateX(-50%)');
});

test('placeStrip shifts left of a top-right widget so it cannot cover the collapse button', () => {
  const V = load();
  // Size M widget at the top right of a 900px window (the overlap case in the screenshots).
  const hud = { left: 596, right: 896, top: 1, bottom: 50 };
  const place = V.placeStrip({ viewportWidth: 900, hud });
  assert.equal(place.transform, 'none');
  assert.ok(place.left + place.maxWidth <= hud.left - 8 + 1e-6, `strip ends at ${place.left + place.maxWidth}, hud starts at ${hud.left}`);
  assert.ok(place.maxWidth >= 80, 'still room for the core four');
});

test('placeStrip shifts right of a top-left widget', () => {
  const V = load();
  const hud = { left: 8, right: 136, top: 4, bottom: 45 };
  const place = V.placeStrip({ viewportWidth: 900, hud });
  assert.equal(place.transform, 'none');
  assert.ok(place.left >= hud.right + 8 - 1e-6, `strip starts at ${place.left}, hud ends at ${hud.right}`);
});
