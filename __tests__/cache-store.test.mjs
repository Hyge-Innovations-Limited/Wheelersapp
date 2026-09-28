/**
 * Where screens keep their last copy: per user, in plain or secure storage,
 * marked stale when the server says it changed, and wiped at sign-out.
 *
 *   node --test __tests__/cache-store.test.mjs
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
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-cache-')), 'cache-store.cjs');

execFileSync('npx', [
  'esbuild', join(projectRoot, 'lib/cache-store.ts'),
  '--bundle', '--platform=node', '--format=cjs',
  `--alias:expo-secure-store=${join(here, 'stubs/secure-store.cjs')}`,
  `--alias:@react-native-async-storage/async-storage=${join(here, 'stubs/async-storage.cjs')}`,
  `--outfile=${outFile}`,
], { cwd: projectRoot, stdio: 'pipe' });

const req = createRequire(import.meta.url);
const cache = req(outFile);
const secure = req(join(here, 'stubs/secure-store.cjs')).__store;
const plain = req(join(here, 'stubs/async-storage.cjs')).__store;

const token = (sub) => `x.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.y`;

test("a copy is kept under the signed-in user's id, read from the login token", () => {
  assert.equal(cache.tokenSubject(token('0b6f-user-1')), '0b6f-user-1');
  assert.equal(cache.tokenSubject('not-a-token'), null);
  assert.equal(cache.scopedKey('user-1', 'wallet.overview'), 'user-1.wallet.overview');
  assert.equal(cache.scopedKey('user-1', 'earnings/today?x'), 'user-1.earnings_today_x', 'only characters secure storage allows');
});

test('plain and secure copies round-trip; sign-out wipes both, and only ours', async () => {
  await cache.writeStored('plain', 'u1.earnings.today', { data: { total: 5 }, at: 1 });
  await cache.writeStored('secure', 'u1.wallet.overview', { data: { balanceNgn: 900 }, at: 2 });
  plain.set('someone.else', 'keep me');
  assert.deepEqual(await cache.readStored('plain', 'u1.earnings.today'), { data: { total: 5 }, at: 1 });
  assert.deepEqual(await cache.readStored('secure', 'u1.wallet.overview'), { data: { balanceNgn: 900 }, at: 2 });
  assert.equal(await cache.readStored('memory', 'u1.earnings.today'), null, 'memory-only copies never touch storage');
  assert.ok(![...plain.values()].some((v) => v.includes('900')), 'the account data is not in plain storage');

  cache.memory.set('u1.wallet.overview', { data: {}, at: 2 });
  await cache.clearCachedQueries();
  assert.equal(await cache.readStored('plain', 'u1.earnings.today'), null);
  assert.equal(await cache.readStored('secure', 'u1.wallet.overview'), null);
  assert.equal(secure.size, 0);
  assert.equal(cache.memory.size, 0);
  assert.equal(plain.get('someone.else'), 'keep me', "another app feature's storage is left alone");
});

test('the server says the wallet changed: every wallet copy is stale, and screens showing it are told', () => {
  cache.memory.set('u1.wallet.overview', { data: 1, at: Date.now() });
  cache.memory.set('u1.wallet.transactions', { data: 2, at: Date.now() });
  cache.memory.set('u1.earnings.today', { data: 3, at: Date.now() });
  const told = [];
  cache.staleListeners.add((prefix) => told.push(prefix));
  cache.invalidateCached('wallet');
  assert.equal(cache.memory.get('u1.wallet.overview').at, 0);
  assert.equal(cache.memory.get('u1.wallet.transactions').at, 0);
  assert.notEqual(cache.memory.get('u1.earnings.today').at, 0, 'earnings untouched');
  assert.deepEqual(told, ['wallet']);
});
