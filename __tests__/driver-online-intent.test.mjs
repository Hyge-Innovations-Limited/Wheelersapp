/**
 * Closing the app must not take a driver off shift: the Go Online choice is
 * kept on the phone, and a stale or broken one is ignored.
 *
 *   node --test __tests__/driver-online-intent.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'wheelers-online-intent-'));
const outFile = join(dir, 'bundle.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/driver-online-intent.ts'), '--bundle', '--platform=node', '--format=cjs',
  `--alias:@react-native-async-storage/async-storage=${join(projectRoot, '__tests__/stubs/async-storage.cjs')}`, `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const { parseOnlineIntent, ONLINE_INTENT_MAX_AGE_MS } = createRequire(import.meta.url)(outFile);

const NOW = Date.parse('2026-10-01T10:00:00Z');

test('a fresh choice comes back as it was saved', () => {
  assert.deepEqual(parseOnlineIntent(JSON.stringify({ lat: 6.5, lng: 3.3, at: NOW - 60_000 }), NOW), { lat: 6.5, lng: 3.3, at: NOW - 60_000 });
});

test('yesterday\'s choice, a broken one, or none: not online', () => {
  assert.equal(parseOnlineIntent(JSON.stringify({ lat: 6.5, lng: 3.3, at: NOW - ONLINE_INTENT_MAX_AGE_MS - 1 }), NOW), null);
  assert.equal(parseOnlineIntent('{not json', NOW), null);
  assert.equal(parseOnlineIntent(JSON.stringify({ lat: 'x', lng: 3.3, at: NOW }), NOW), null);
  assert.equal(parseOnlineIntent(null, NOW), null);
});
