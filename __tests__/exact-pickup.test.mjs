/**
 * A pickup set from where the phone is goes out as the phone's own point,
 * not wherever a search for its address text lands.
 *
 *   node --test __tests__/exact-pickup.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = join(here, '..');
const constantsStub = join(here, 'stubs/expo-constants.cjs');
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-exact-pickup-')), 'bundle.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/google-places.ts'), '--bundle', '--platform=node', '--format=cjs',
  `--alias:expo-constants=${constantsStub}`, '--define:__DEV__=false', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const require = createRequire(import.meta.url);
const { rememberExactPlace, resolvePlaceQuery } = require(outFile);

let searches = 0;
globalThis.fetch = async () => {
  searches += 1;
  throw new Error('no search expected');
};

test('the address of the GPS spot comes back as that exact point, with no search', async () => {
  rememberExactPlace('12 Herbert Macaulay Way, Yaba, Lagos', { lat: 6.509123, lng: 3.378456 });
  const place = await resolvePlaceQuery('  12 herbert macaulay way, yaba, lagos ');
  assert.deepEqual(place, { lat: 6.509123, lng: 3.378456, address: '12 Herbert Macaulay Way, Yaba, Lagos' });
  assert.equal(searches, 0);
});

test('a later fix for the same address replaces the earlier point', async () => {
  rememberExactPlace('Sabo Market, Yaba', { lat: 6.5, lng: 3.37 });
  rememberExactPlace('Sabo Market, Yaba', { lat: 6.50012, lng: 3.37021 });
  const place = await resolvePlaceQuery('Sabo Market, Yaba');
  assert.equal(place.lat, 6.50012);
  assert.equal(place.lng, 3.37021);
});

test('an empty label or a broken point is not kept', async () => {
  rememberExactPlace('   ', { lat: 6.5, lng: 3.3 });
  rememberExactPlace('Nowhere Street', { lat: Number.NaN, lng: 3.3 });
  await assert.rejects(resolvePlaceQuery('Nowhere Street'));
});

test('a Plus Code is told apart from a place name', async () => {
  const { isPlusCode } = require(outFile);
  assert.equal(isPlusCode('GFVQ+VQ4'), true);
  assert.equal(isPlusCode('GFVQ+VQ4, Ikorodu, Lagos'), true);
  assert.equal(isPlusCode('6FR5GFVQ+VQ'), true);
  assert.equal(isPlusCode('15 Aiyetoro Street'), false);
  assert.equal(isPlusCode('Ilemere'), false);
  assert.equal(isPlusCode(''), false);
});
