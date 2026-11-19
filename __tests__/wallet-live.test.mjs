/**
 * The live wallet (19 Nov 2026): the server's wallet:live changes the kept copies in place, with no fetch.
 *
 *   node --test __tests__/wallet-live.test.mjs
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
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-wallet-live-')), 'out.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/wallet-live-merge.ts'), '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const M = createRequire(import.meta.url)(outFile);

const kept = { walletId: 'w1', balanceNgn: 1000, lockedNgn: 0, updatedAt: '2026-11-19T10:00:00.000Z', withdrawalFeeNgn: 50, payoutAccount: { bankName: 'GTBank' }, owedNgn: 0, driverPaused: false };

test('the balance message: the new balance and its cash lines; the payout account and fees stay', () => {
  const next = M.overviewWithLive(kept, { balanceNgn: 3500, lockedNgn: 500, updatedAt: '2026-11-19T10:01:00.000Z', owedNgn: 0, driverPaused: false, cashRides: true });
  assert.equal(next.balanceNgn, 3500);
  assert.equal(next.lockedNgn, 500);
  assert.equal(next.cashRides, true);
  assert.deepEqual(next.payoutAccount, { bankName: 'GTBank' });
  assert.equal(next.withdrawalFeeNgn, 50);
  assert.equal(M.overviewWithLive(null, { balanceNgn: 1 }), null, 'nothing kept: fetched when opened');
  assert.equal(M.overviewWithLive(kept, { balanceNgn: 1, updatedAt: '2026-11-19T09:00:00.000Z' }), null, 'an older message never undoes a newer balance');
});

test('the transaction message: on top, once, newest first, at most what is kept', () => {
  const rows = [{ id: 'b', createdAt: '2026-11-19T09:00:00.000Z' }, { id: 'a', createdAt: '2026-11-19T08:00:00.000Z' }];
  const next = M.historyWithLive(rows, { id: 'c', createdAt: '2026-11-19T10:00:00.000Z' }, 40);
  assert.deepEqual(next.map((r) => r.id), ['c', 'b', 'a']);
  assert.equal(M.historyWithLive(next, { id: 'c', createdAt: '2026-11-19T10:00:00.000Z' }, 40), null, 'the same row twice: once');
  assert.deepEqual(M.historyWithLive(rows, { id: 'z', createdAt: '2026-11-19T10:00:00.000Z' }, 2).map((r) => r.id), ['z', 'b']);
  assert.equal(M.historyWithLive(null, { id: 'c' }, 40), null);
});
