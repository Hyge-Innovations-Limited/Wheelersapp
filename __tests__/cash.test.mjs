/**
 * Pay with cash (Timi, 18 Nov 2026): the app only reads what the server says. Cash is offered when the server says
 * cashRides; a driver's debt from cash trips is owedNgn, and past the limit (driverPaused) the deposit that clears it.
 * At the end of a cash trip the driver collects the whole fare and owes Wheelers the rest.
 *
 *   node --test __tests__/cash.test.mjs
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
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-cash-')), 'out.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/cash.ts'), '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const C = createRequire(import.meta.url)(outFile);

test('Cash is offered only when the server says so (an older server says nothing)', () => {
  assert.equal(C.cashOffered({ cashRides: true }), true);
  assert.equal(C.cashOffered({ cashRides: false }), false);
  assert.equal(C.cashOffered({}), false);
  assert.equal(C.cashOffered(null), false);
});

test('the accept sends cash, or the wallet as it always did', () => {
  assert.equal(C.acceptPaymentMethod('cash'), 'cash');
  assert.equal(C.acceptPaymentMethod('wallet'), 'wallet_balance');
  assert.equal(C.acceptPaymentMethod(undefined), 'wallet_balance');
});

test('what a driver owes: nothing, under the limit, past it (with the deposit to send)', () => {
  assert.equal(C.driverOwed({ owedNgn: 0 }), null);
  assert.equal(C.driverOwed({}), null, 'an older server: no debt shown');
  assert.deepEqual(C.driverOwed({ owedNgn: 650, driverPaused: false, depositToDriveNgn: 0 }), { owedNgn: 650, paused: false, depositNgn: 650 });
  assert.deepEqual(C.driverOwed({ owedNgn: 1400, driverPaused: true, depositToDriveNgn: 1550 }), { owedNgn: 1400, paused: true, depositNgn: 1550 });
});

test('a cash trip\'s end: collect the whole fare, owe Wheelers the rest', () => {
  assert.deepEqual(C.cashPayout(3300, 2595), { collectNgn: 3300, owedNgn: 705 });
  assert.deepEqual(C.cashPayout(0, 0), { collectNgn: 0, owedNgn: 0 });
  assert.deepEqual(C.cashPayout(1000, 1200), { collectNgn: 1000, owedNgn: 0 }, 'never owes a negative');
});
