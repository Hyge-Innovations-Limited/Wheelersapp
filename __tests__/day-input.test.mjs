/**
 * Dates on the papers screens: typed DD/MM/YYYY as printed on Nigerian
 * papers, sent to the server as YYYY-MM-DD.
 *
 *   node --test __tests__/day-input.test.mjs
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
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-day-input-')), 'bundle.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/day-input.ts'), '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const { maskDay, dayToIso, isoToDay, isoToWords, isPast } = createRequire(import.meta.url)(outFile);

test('the slashes are typed for the driver, and nothing but digits gets in', () => {
  assert.equal(maskDay('3'), '3');
  assert.equal(maskDay('31'), '31');
  assert.equal(maskDay('311'), '31/1');
  assert.equal(maskDay('3112'), '31/12');
  assert.equal(maskDay('31122027'), '31/12/2027');
  assert.equal(maskDay('31/12/2027'), '31/12/2027', 'what is already there stays');
  assert.equal(maskDay('31-12-2027 extra 99'), '31/12/2027');
  assert.equal(maskDay('31/1'), '31/1', 'deleting back through a slash works');
});

test('only a whole, real date becomes one', () => {
  assert.equal(dayToIso('31/12/2027'), '2027-12-31');
  assert.equal(dayToIso('01/03/2028'), '2028-03-01');
  assert.equal(dayToIso('31/12/27'), null, 'the year in full');
  assert.equal(dayToIso('30/02/2027'), null, 'February has no 30th');
  assert.equal(dayToIso('29/02/2028'), '2028-02-29', 'a leap year does');
  assert.equal(dayToIso('12/31/2027'), null, 'day first, not month');
  assert.equal(dayToIso(''), null);
});

test('a saved date goes back into the box, and reads as words', () => {
  assert.equal(isoToDay('2027-12-31'), '31/12/2027');
  assert.equal(isoToDay(null), '');
  assert.equal(isoToWords('2027-03-05'), '5 Mar 2027');
  assert.equal(isoToWords(undefined), '');
});

test('a date before today has passed; today itself has not', () => {
  assert.equal(isPast('2026-10-12', '2026-10-13'), true);
  assert.equal(isPast('2026-10-13', '2026-10-13'), false);
  assert.equal(isPast('2027-01-01', '2026-10-13'), false);
});
