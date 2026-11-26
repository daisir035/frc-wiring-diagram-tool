import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_PARTS, PART_CATEGORIES } from '../src/lib/wiring.ts';
import { LIBRARY_GROUPS, LIBRARY_VARIANTS, librarySections } from '../src/lib/partCatalog.ts';

const defs = new Map(BUILTIN_PARTS.map((def) => [def.id, def]));
const visible = BUILTIN_PARTS.filter((def) => !def.hideInLibrary);
const cards = (sections) => sections.flatMap((section) => section.groups.flatMap((group) => group.defs.map((def) => def.id)));

test('catalog names only real parts, each in its own category', () => {
  for (const [category, groups] of Object.entries(LIBRARY_GROUPS)) {
    assert.ok(PART_CATEGORIES.includes(category), category);
    for (const id of groups.flatMap((group) => group.parts)) {
      assert.ok(defs.has(id), `unknown part ${id}`);
      assert.equal(defs.get(id).category, category, id);
    }
  }
  for (const [variant, base] of Object.entries(LIBRARY_VARIANTS)) {
    assert.ok(defs.has(variant) && defs.has(base), variant);
  }
});

test('every visible built-in part is listed exactly once, size variants share a card', () => {
  const listed = cards(librarySections(BUILTIN_PARTS));
  assert.equal(new Set(listed).size, listed.length, 'duplicate cards');
  for (const def of visible) {
    if (LIBRARY_VARIANTS[def.id]) assert.ok(!listed.includes(def.id), `${def.id} should share a card`);
    else assert.ok(listed.includes(def.id), `${def.id} missing from library`);
  }
  assert.ok(!listed.includes('pneumatic-manifold-solenoid-4'));
});

test('no catch-all "其他" category and no pneumatic group is too big to scan', () => {
  assert.ok(!PART_CATEGORIES.includes('其他'));
  for (const section of librarySections(BUILTIN_PARTS)) {
    for (const group of section.groups) assert.ok(group.defs.length <= 6, `${section.category}/${group.label}`);
  }
});

test('search finds size variants and group names', () => {
  assert.ok(cards(librarySections(BUILTIN_PARTS, 'am-2034_6')).includes('am-2034_6'));
  assert.deepEqual(librarySections(BUILTIN_PARTS, '配电板').flatMap((s) => s.groups.map((g) => g.label)), ['配电板']);
  assert.deepEqual(librarySections(BUILTIN_PARTS, '', '电机').map((s) => s.category), ['电机']);
});

test('custom parts and parts the catalog does not name still appear', () => {
  const custom = { ...defs.get('roborio'), id: 'custom-1', name: '我的板卡', category: '自定义' };
  const unlisted = { ...defs.get('pot'), id: 'new-sensor', name: '新传感器' };
  const listed = cards(librarySections([...BUILTIN_PARTS, custom, unlisted]));
  assert.ok(listed.includes('custom-1') && listed.includes('new-sensor'));
});

test('the inline 10A fuse is not offered; fuses are set on the PDH channels', () => {
  assert.ok(!cards(librarySections(BUILTIN_PARTS)).includes('fuseAuto10'));
  assert.ok(defs.has('fuseAuto10'), 'kept so older drawings still open');
});
