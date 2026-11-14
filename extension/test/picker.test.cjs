// Unit test for the character picker's search and categories (no browser needed).
// Run: node --test extension/test/picker.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load(locale = {}) {
  const ctx = {
    window: {},
    console,
    Vern: {
      settings: { values: { personaId: 'big_sal', sceneCast: ['big_sal', 'old_oakley'], townMembers: [] } },
      t: (k, fb, subs) => {
        let s = locale[k] ?? fb ?? '';
        (subs || []).forEach((v, i) => { s = s.replace(`$${i + 1}`, v); });
        return s;
      },
      personaName: (p) => p.name,
    },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'content', 'picker.js'), 'utf8'), ctx);
  return ctx.Vern;
}

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'shared', 'personas.json'), 'utf8'));
const list = data.characters.map((c) => ({ id: c.id, name: c.name, archetype: c.archetype, category: c.category, accent: c.accent || '', tags: c.tags || [] }));
const catalog = { categories: data.categories, categoryGroups: data.categoryGroups };
const ids = (arr) => arr.map((p) => p.id);

test('categories filter, and accent groups gather every accent', () => {
  const V = load();
  assert.deepEqual(ids(V.filterPersonas(list, { category: 'comics', catalog })).sort(), ['chuy_carcajadas', 'marty_midstep', 'priya_nair', 'reggie_riff', 'winnie_brightwater']);
  const southern = ids(V.filterPersonas(list, { category: 'southern', catalog }));
  assert.ok(southern.includes('tex_calloway') && southern.includes('miss_beulah'));
  const accents = V.filterPersonas(list, { category: 'group:accents', catalog });
  assert.ok(accents.some((p) => p.category === 'british') && accents.some((p) => p.category === 'irish'));
  assert.ok(!accents.some((p) => p.category === 'bigsal' || p.category === 'fun'));
  assert.equal(V.filterPersonas(list, { category: 'all', catalog }).length, list.length);
});

test('search matches name, accent, archetype and tags, word by word, by prefix', () => {
  const V = load();
  const q = (query, category = 'all') => ids(V.filterPersonas(list, { query, category, catalog }));
  assert.ok(q('southern').includes('waylon_ridge'));
  assert.ok(q('brit').includes('jeeves_pemberton'), 'prefix of the accent');
  assert.ok(q('butler').includes('jeeves_pemberton'), 'tag');
  assert.ok(q('pirate').includes('pirate'), 'the original Pirate is found by tag');
  assert.ok(q('cowboy').includes('tex_calloway'));
  assert.deepEqual(q('texas cowboy'), ['tex_calloway'], 'every word must match');
  assert.ok(q('Big Sal').includes('big_sal'));
  assert.ok(q('comic marty').includes('marty_midstep'));
  assert.ok(q('o\'duffy').includes('seamus_oduffy'));
  assert.deepEqual(q('zzzz'), []);
  assert.ok(q('grandma', 'family').every((id) => list.find((p) => p.id === id).category === 'family'));
});

test('locale synonyms and accents: Spanish search finds English-tagged voices', () => {
  const V = load({ pickerSynonyms: 'pirata=pirate;vaquero=cowboy;sureno=southern;abuela=grandma', accent_southern: 'sureño' });
  const q = (query) => ids(V.filterPersonas(list, { query, catalog }));
  assert.ok(q('pirata').includes('pirate'));
  assert.ok(q('vaquero').includes('tex_calloway'));
  assert.ok(q('sureño').includes('bobby_ray_tucker'), 'diacritics are ignored');
  assert.ok(q('abuela').includes('grandma_pearl'));
});

test('labels and the short cast roster', () => {
  const V = load({ accent_texas_cowboy: 'vaquero de Texas' });
  assert.equal(V.personaLabel(list.find((p) => p.id === 'tex_calloway')), 'Tex Calloway (vaquero de Texas)');
  assert.equal(V.personaLabel(list.find((p) => p.id === 'big_sal')), 'Big Sal');
  const roster = ids(V.castRoster(list, 'tex_calloway'));
  assert.ok(roster.includes('tex_calloway') && roster.includes('big_sal') && roster.includes('reggie_riff'));
  assert.ok(!roster.includes('waylon_ridge'), 'unchosen library voices stay out of the cast lists');
});
