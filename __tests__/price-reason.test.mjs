/**
 * The one line under the price on "Set your price": why it is up right now.
 * Nothing when the server leaves it out (older servers) or sends nothing worth a line.
 *
 *   node --test __tests__/price-reason.test.mjs
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
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-price-reason-')), 'bundle.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/price-reason.ts'), '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const { priceReasonLine, parsePriceReason, samePriceReason } = createRequire(import.meta.url)(outFile);

test('label and amount, one line', () => {
  assert.equal(priceReasonLine({ label: 'Busy in this area', extraNgn: 1200 }), 'Busy in this area · +₦1,200');
  assert.equal(priceReasonLine({ label: 'Raining', extraNgn: 350 }), 'Raining · +₦350');
});

test('nothing for a missing, null or empty reason', () => {
  for (const value of [undefined, null, {}, [], 'Raining', { label: '', extraNgn: 500 }, { label: 'Rush hour', extraNgn: 0 }, { label: 'Rush hour', extraNgn: -50 }, { label: 'Rush hour' }, { label: 'Rush hour', extraNgn: Number.NaN }]) {
    assert.equal(priceReasonLine(value), null, JSON.stringify(value));
    assert.equal(parsePriceReason(value), null);
  }
});

test('a changed reason is noticed', () => {
  assert.equal(samePriceReason(null, undefined), true);
  assert.equal(samePriceReason({ label: 'Raining', extraNgn: 300 }, { label: 'Raining', extraNgn: 300 }), true);
  assert.equal(samePriceReason({ label: 'Raining', extraNgn: 300 }, null), false);
});
