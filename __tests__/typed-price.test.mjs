/**
 * Typing a price: nearest ₦50, the lowest allowed, the most allowed, nothing usable.
 *
 *   node --test __tests__/typed-price.test.mjs
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
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-typed-price-')), 'bundle.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/typed-price.ts'), '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const { resolveTypedPrice, settleTypedPrice } = createRequire(import.meta.url)(outFile);

test('rounds to the nearest 50', () => {
  assert.deepEqual(resolveTypedPrice('5030', 1000), { amount: 5050, low: false });
  assert.deepEqual(resolveTypedPrice('5024', 1000), { amount: 5000, low: false });
  assert.deepEqual(resolveTypedPrice('5025', 1000), { amount: 5050, low: false });
});
test('accepts commas and the naira sign', () => {
  assert.deepEqual(resolveTypedPrice('₦6,500', 1000), { amount: 6500, low: false });
});
test('under the lowest: the lowest, flagged', () => {
  assert.deepEqual(resolveTypedPrice('300', 1000), { amount: 1000, low: true });
  assert.deepEqual(resolveTypedPrice('1010', 1050), { amount: 1050, low: true });
});
test('empty, junk or zero: unchanged (null)', () => {
  for (const v of ['', '  ', 'abc', '0', '000', undefined, null]) assert.equal(resolveTypedPrice(v, 1000), null, String(v));
});

test('under 50 after rounding: unchanged (null), even with a minimum', () => {
  assert.equal(resolveTypedPrice('20', 1000), null);
  assert.equal(resolveTypedPrice('24', 0), null);
  assert.deepEqual(resolveTypedPrice('25', 0), { amount: 50, low: false });
});
test('minimum 0 means no floor', () => {
  assert.deepEqual(resolveTypedPrice('500', 0), { amount: 500, low: false });
});

test('settling: unedited text never changes the price, even an odd one', () => {
  assert.deepEqual(settleTypedPrice('5025', '5025', 5025, 1000), { amount: 5025, low: false, changed: false });
});
test('settling: a typed raise lands rounded; junk keeps the price; low is flagged', () => {
  assert.deepEqual(settleTypedPrice('9030', '5000', 5000, 1000), { amount: 9050, low: false, changed: true });
  assert.deepEqual(settleTypedPrice('', '5000', 5000, 1000), { amount: 5000, low: false, changed: false });
  assert.deepEqual(settleTypedPrice('200', '5000', 5000, 1000), { amount: 1000, low: true, changed: true });
});
test('settling then stepping: the step is taken from the typed price', async () => {
  const { amount } = settleTypedPrice('9000', '5000', 5000, 1000);
  assert.equal(amount + 100, 9100);
});

// The button under the price follows what is typed (Timi, 10 Nov 2026): the same number the commit would give.
test('while typing, the button shows what the commit would send', () => {
  assert.equal(settleTypedPrice('5730', '5000', 5000, 3650).amount, 5750);
  assert.equal(settleTypedPrice('1000', '5000', 5000, 3650).amount, 3650, 'under the minimum: the minimum');
  assert.equal(settleTypedPrice('', '5000', 5000, 3650).amount, 5000, 'nothing usable yet: the price it had');
  assert.equal(settleTypedPrice('5000', '5000', 5000, 3650).amount, 5000, 'unedited');
});
