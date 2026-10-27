/**
 * "Finding drivers": how many drivers saw the price (ride:search_status from
 * newer servers), the clock to the end of the search, and the raise nudge
 * after two minutes with no offer. Older servers send no count: nothing shown.
 *
 *   node --test __tests__/ride-search-status.test.mjs
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
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-search-status-')), 'bundle.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/ride-search-status.ts'), '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const { applySearchStatus, driversSawLine, searchClock, shouldNudgeRaise, RAISE_NUDGE_AFTER_MS } = createRequire(import.meta.url)(outFile);

const NOW = Date.parse('2026-10-27T10:00:00Z');
const ride = { rideId: 'ride-1', status: 'bidding', bidsCloseAt: new Date(NOW + 300_000).toISOString() };

test('search status fills the count and the close time for this ride only', () => {
  const close = new Date(NOW + 240_000).toISOString();
  const next = applySearchStatus(ride, { rideId: 'ride-1', driversNotified: 7, bidsCloseAt: close });
  assert.equal(next.driversNotified, 7);
  assert.equal(next.bidsCloseAt, close);
  assert.equal(next.status, 'bidding');
  assert.equal(applySearchStatus(ride, { rideId: 'ride-2', driversNotified: 7 }), ride, 'another ride: untouched');
  assert.equal(applySearchStatus(null, { rideId: 'ride-1', driversNotified: 7 }), null);
});

test('bad or missing fields keep what was there; nothing changed is the same object', () => {
  const withCount = { ...ride, driversNotified: 4 };
  assert.equal(applySearchStatus(withCount, { rideId: 'ride-1' }), withCount);
  assert.equal(applySearchStatus(withCount, { rideId: 'ride-1', driversNotified: 'lots', bidsCloseAt: 'soon' }), withCount);
  assert.equal(applySearchStatus(withCount, { rideId: 'ride-1', driversNotified: null }).driversNotified, null);
});

test('"N drivers saw your price", hidden for none or unknown', () => {
  assert.equal(driversSawLine(5), '5 drivers saw your price');
  assert.equal(driversSawLine(1), '1 driver saw your price');
  assert.equal(driversSawLine(0), null);
  assert.equal(driversSawLine(null), null);
  assert.equal(driversSawLine(undefined), null);
});

test('the clock counts to the close, then goes', () => {
  assert.equal(searchClock(new Date(NOW + 272_000).toISOString(), NOW), '4:32');
  assert.equal(searchClock(new Date(NOW + 9_000).toISOString(), NOW), '0:09');
  assert.equal(searchClock(new Date(NOW - 1_000).toISOString(), NOW), null);
  assert.equal(searchClock(undefined, NOW), null);
  assert.equal(searchClock('not a date', NOW), null);
});

test('the raise nudge comes after two minutes at one price with no offer', () => {
  assert.equal(shouldNudgeRaise({ pricedAtMs: NOW, nowMs: NOW + RAISE_NUDGE_AFTER_MS - 1, offerCount: 0 }), false);
  assert.equal(shouldNudgeRaise({ pricedAtMs: NOW, nowMs: NOW + RAISE_NUDGE_AFTER_MS, offerCount: 0 }), true);
  assert.equal(shouldNudgeRaise({ pricedAtMs: NOW, nowMs: NOW + 600_000, offerCount: 1 }), false);
  assert.equal(shouldNudgeRaise({ pricedAtMs: null, nowMs: NOW + 600_000, offerCount: 0 }), false);
});
