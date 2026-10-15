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
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = join(here, '..');
const constantsStub = join(here, 'stubs/expo-constants.cjs');
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-exact-pickup-')), 'bundle.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/google-places.ts'), '--bundle', '--platform=node', '--format=cjs',
  `--alias:expo-constants=${constantsStub}`, '--define:__DEV__=false', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
// A key, so picked places are looked up; every request is answered by the stubs below.
process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-key';
const require = createRequire(import.meta.url);
const { rememberExactPlace, rememberPickedPlace, resolvePlaceQuery } = require(outFile);

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

test('a spot reads like a ride app shows it, from what Google really answered', () => {
  const { placeLabelFromResults } = require(outFile);
  const google = JSON.parse(readFileSync(join(here, 'fixtures/google-reverse.json'), 'utf8'));
  // Ilemere, where the first answer is only "Ikorodu, Ikorodu" and the area is in a later one.
  assert.equal(placeLabelFromResults(google.ilemereOrupodi), 'Orupodi, Ilemere, Ikorodu');
  assert.equal(placeLabelFromResults(google.ilemereAdebs), 'Adebs Rd, Ilemere, Ikorodu');
  assert.equal(placeLabelFromResults(google.yaba), '3 Herbert Macaulay Way, Yaba');
  assert.equal(placeLabelFromResults(google.lekkiPhase1), '68 Admiralty Way, Lekki Phase I, Lekki');
  assert.equal(placeLabelFromResults([]), null);
});

test('a place picked from the suggestions goes out at its own spot, under the words picked, with no search of those words', async () => {
  const label = 'University Of Lagos Faculty of Science, Lagos, Nigeria';
  const asked = [];
  globalThis.fetch = async (url, init) => {
    asked.push(String(url));
    if (String(url).startsWith('https://places.googleapis.com/v1/places/ChIJfaculty')) {
      assert.equal(init.headers['X-Goog-FieldMask'], 'location', 'only the spot is asked for: the cheapest lookup');
      return new Response(JSON.stringify({ location: { latitude: 6.5151215, longitude: 3.3993455 } }), { status: 200 });
    }
    throw new Error(`no other request expected: ${url}`);
  };
  rememberPickedPlace(label, 'ChIJfaculty');
  // Asked for at once, as the trip screen does while the lookup is still on its way.
  const place = await resolvePlaceQuery(label);
  assert.deepEqual(place, { lat: 6.5151215, lng: 3.3993455, address: label });
  assert.equal(asked.length, 1);
  assert.deepEqual(await resolvePlaceQuery(label), place, 'and kept after');
  assert.equal(asked.length, 1);
});

test('a place found by its words is never named by a Plus Code', async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes('/geocode/json')) {
      return new Response(JSON.stringify({ status: 'OK', results: [{
        formatted_address: 'G98X+2PX, Lagos Mainland, Lagos 101245, Lagos, Nigeria',
        types: ['plus_code'],
        geometry: { location: { lat: 6.5151, lng: 3.3993 } },
        address_components: [
          { long_name: 'G98X+2PX', types: ['plus_code'] },
          { long_name: 'Akoka', types: ['neighborhood', 'political'] },
          { long_name: 'Lagos Mainland', types: ['administrative_area_level_2', 'political'] },
          { long_name: 'Lagos', types: ['administrative_area_level_1', 'political'] },
          { long_name: 'Nigeria', types: ['country', 'political'] },
        ],
      }] }), { status: 200 });
    }
    throw new Error(`unexpected ${url}`);
  };
  const place = await resolvePlaceQuery('faculty of science unilag');
  assert.equal(place.address, 'Akoka, Lagos Mainland');
});
