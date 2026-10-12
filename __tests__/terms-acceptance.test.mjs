/**
 * Reading and accepting the terms: remembered per person on this phone, and
 * asked again when the terms change.
 *
 *   node --test __tests__/terms-acceptance.test.mjs
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
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-terms-')), 'bundle.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/terms-acceptance.ts'), '--bundle', '--platform=node', '--format=cjs',
  `--alias:@react-native-async-storage/async-storage=${join(here, 'stubs/async-storage.cjs')}`,
  `--alias:@/constants/legal-text=${join(projectRoot, 'constants/legal-text.ts')}`, `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const { acceptedFrom, hasAcceptedTerms, acceptTerms, DRIVER_TERMS_KEY, RIDER_TERMS_KEY } = createRequire(import.meta.url)(outFile);

test('nobody has accepted until they do; then it is remembered for that side only', async () => {
  assert.equal(await hasAcceptedTerms(RIDER_TERMS_KEY), false);
  await acceptTerms(RIDER_TERMS_KEY);
  assert.equal(await hasAcceptedTerms(RIDER_TERMS_KEY), true);
  assert.equal(await hasAcceptedTerms(DRIVER_TERMS_KEY), false, 'the driver side is asked on its own');
  await acceptTerms(DRIVER_TERMS_KEY);
  await acceptTerms(RIDER_TERMS_KEY);
  assert.equal(await hasAcceptedTerms(DRIVER_TERMS_KEY), true);
  assert.equal(await hasAcceptedTerms(RIDER_TERMS_KEY), true);
});

test('when the terms change, an acceptance of the old ones no longer counts', () => {
  const stored = { version: '2026-10-12', who: ['+2348031234567', 'driver'] };
  assert.deepEqual(acceptedFrom(stored, '2026-10-12'), ['+2348031234567', 'driver']);
  assert.deepEqual(acceptedFrom(stored, '2027-01-01'), []);
});

test('anything damaged counts as nobody', () => {
  assert.deepEqual(acceptedFrom(null), []);
  assert.deepEqual(acceptedFrom('yes'), []);
  assert.deepEqual(acceptedFrom({ version: '2026-10-12', who: 'everyone' }, '2026-10-12'), []);
  assert.deepEqual(acceptedFrom({ version: '2026-10-12', who: ['a', 7, ''] }, '2026-10-12'), ['a']);
});
