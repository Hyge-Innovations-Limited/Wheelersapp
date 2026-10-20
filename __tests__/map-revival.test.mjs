/**
 * Maps are built afresh when the app comes back after a while away (Android
 * can hand a long-paused map back without its blue dot, pins or route); a
 * quick look away changes nothing.
 *
 *   node --test __tests__/map-revival.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, '..');
const reactStub = join(here, 'stubs/react-hooks-once.cjs');
const rnStub = join(here, 'stubs/react-native-appstate.cjs');
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-map-revival-')), 'bundle.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'hooks/use-map-revival.ts'), '--bundle', '--platform=node', '--format=cjs',
  `--alias:react=${reactStub}`, `--alias:react-native=${rnStub}`, `--external:${reactStub}`, `--external:${rnStub}`, `--outfile=${outFile}`],
  { cwd: projectRoot, stdio: 'pipe' });
const require = createRequire(import.meta.url);
const { useMapRevival } = require(outFile);
const react = require(reactStub);
const appState = require(rnStub);

test('a quick look away keeps the map; back after the wait, it is built afresh; the listener goes with the screen', (t) => {
  let now = 1_000_000;
  t.mock.method(Date, 'now', () => now);
  const first = useMapRevival(120_000);
  assert.equal(first, 0);
  const generation = () => react.__state.values[0];

  appState.__emit('background'); now += 30_000; appState.__emit('active');
  assert.equal(generation(), 0, 'thirty seconds away: the same map');

  appState.__emit('inactive'); now += 60_000; appState.__emit('background'); now += 70_000; appState.__emit('active');
  assert.equal(generation(), 1, 'over two minutes away, counted from when it first left: a fresh map');

  appState.__emit('active');
  assert.equal(generation(), 1, 'already in front: nothing');

  for (const cleanup of react.__state.cleanups) cleanup();
  assert.equal(appState.__count(), 0);
});
