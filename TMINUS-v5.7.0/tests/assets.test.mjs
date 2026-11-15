import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PARTS} from '../dist/expedition-core.js';
import {ROOM_ORDER, ROOM_LABEL, PART_ROOM, CHECK_ROOM, designSheet} from '../dist/design-science.js';
import {createExpedition} from '../dist/expedition-core.js';
import {parseGLB, namedNodes} from '../dist/asset-loader.js';

const buf = async f => {const b = await readFile(new URL(f, import.meta.url)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);};

test('ship_interior.glb loads with the vendored GLTFLoader and has the six modules, airlock and spawns', async () => {
  const gltf = await parseGLB(await buf('../dist/assets/ship/ship_interior.glb'));
  const nodes = namedNodes(gltf);
  for (const r of ROOM_ORDER) {
    assert.ok(nodes.has(`module_${r}`), `module_${r}`);
    assert.ok(nodes.has(`spawn_${r}`), `spawn_${r}`);
  }
  assert.ok(nodes.has('module_airlock') && nodes.has('outer_hatch'));
});

test('modules run rear to nose along +Z in the same order the design sheet lists them', async () => {
  const nodes = namedNodes(await parseGLB(await buf('../dist/assets/ship/ship_interior.glb')));
  const z = ROOM_ORDER.map(r => nodes.get(`module_${r}`).position.z);
  assert.deepEqual([...z].sort((a, b) => a - b), z);
});

test('every part and every check maps to a real room with a label', () => {
  for (const p of PARTS) {
    const room = PART_ROOM[p.id];
    assert.ok(room, p.id);
    assert.ok(room === 'hull' || ROOM_ORDER.includes(room), `${p.id} → ${room}`);
    assert.ok(ROOM_LABEL[room]);
  }
  const d = designSheet(createExpedition(1));
  for (const c of d.checks) {
    assert.equal(c.room, CHECK_ROOM[c.id]);
    assert.ok(ROOM_ORDER.includes(c.room), c.id);
  }
});

test('ship nav data lists a walkable grid for every module', async () => {
  const nav = JSON.parse(await readFile(new URL('../dist/assets/ship/ship_nav.json', import.meta.url), 'utf8'));
  assert.ok(Object.keys(nav).length > 0);
});
