/**
 * A cancelled trip, as the driver reads it: words, never a code — and no alert
 * at all when the driver cancelled it themselves.
 *
 *   node --test __tests__/cancel-copy.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-cancel-copy-')), 'bundle.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/cancel-copy.ts'), '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const { driverCancelNotice } = createRequire(import.meta.url)(outFile);

test('the driver cancelled it themselves: no alert', () => {
  assert.equal(driverCancelNotice({ reason: 'driver_cancelled', cancelledBy: 'driver' }), null);
  assert.equal(driverCancelNotice({ reason: 'driver_cancelled' }), null);
});

test('a code is never shown; a rider\'s own words are', () => {
  const coded = driverCancelNotice({ reason: 'some_new_code', cancelledBy: 'rider' });
  assert.doesNotMatch(coded.body, /_/);
  assert.equal(coded.title, 'The rider cancelled');
  assert.match(driverCancelNotice({ reason: 'rider_no_show', cancelledBy: 'system' }).body, /didn't show up/);
  assert.match(driverCancelNotice({ reason: 'Changed my plans', cancelledBy: 'rider' }).body, /“Changed my plans”/);
});
