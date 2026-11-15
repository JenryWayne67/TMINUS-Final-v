import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const from = path => readFile(new URL(path, import.meta.url), 'utf8');

test('release identifies one current bundle and does not link nonexistent downloads', async () => {
  const pkg = JSON.parse(await from('../package.json'));
  const release = JSON.parse(await from('../dist/release.json'));
  const html = await from('../dist/index.html');
  const menu = await from('../dist/crew-experience.js');
  const campaign = await from('../dist/campaign-ui.js');
  const original = await from('../dist/game.js');
  assert.equal(pkg.version, release.version);
  assert.equal(release.entry, `t-minus-v${pkg.version}.js`);
  assert.match(html, new RegExp(`src="t-minus-v${pkg.version.replaceAll('.', '\\.')}\.js"`));
  assert.match(menu, /PHASE 5 BUILD 5\.7\.0/);
  assert.doesNotMatch(menu + campaign + original, /href="(?:\.\/)?(?:t-minus-campaign-v5\.0\.1|t-minus-source)\.zip"/);
});

test('grounding and shadow configuration survive build updates', async () => {
  const world = await from('../dist/world.js');
  const crew = await from('../dist/crew-world.js');
  const experience = await from('../dist/crew-experience.js');
  const campaign = await from('../dist/campaign-world.js');
  assert.match(world, /export function floorHeightAt\(/);
  assert.match(experience, /floorHeightAt\(p\.x,p\.z\)/);
  assert.match(experience, /state\.phase==='surface' \? -\.10/);
  assert.match(crew, /leg\.position\.set\(sign\*\.19,\.74,0\)/);
  assert.match(campaign, /renderer\.shadowMap\.enabled=true/);
  assert.match(campaign, /sun\.castShadow=true/);
});
