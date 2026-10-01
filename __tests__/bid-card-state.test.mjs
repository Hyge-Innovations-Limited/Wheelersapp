/**
 * A driver's bid card: white while waiting, yellow while the rider pays,
 * green when accepted, red when the rider declined every offer. No "Change
 * bid" once the driver took the rider's own price.
 *
 *   node --test __tests__/bid-card-state.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = join(here, '..');
const dir = mkdtempSync(join(tmpdir(), 'wheelers-bid-card-'));
const entry = join(dir, 'entry.ts');
writeFileSync(entry, `
export * from '${join(projectRoot, 'lib/driver-session-reducer.ts')}';
export * from '${join(projectRoot, 'lib/bid-card-state.ts')}';
`);
const outFile = join(dir, 'bundle.cjs');
execFileSync('npx', ['esbuild', entry, '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const { reduceDriverSession, recordBid, defaultDriverSession, bidStage, tookRidersPrice, hydrateBidRecords } = createRequire(import.meta.url)(outFile);

const NOW = Date.parse('2026-10-01T10:00:00Z');
const offer = (riderOfferNgn = 3000) => ({
  rideId: 'ride-1', riderId: 'rider-1',
  pickup: { lat: 6.5, lng: 3.3, address: 'Akoka' }, destination: { lat: 6.4, lng: 3.4, address: 'Yaba' }, stops: [],
  fareEstimateNgn: 3000, riderOfferNgn, expiresAt: new Date(NOW + 60_000).toISOString(), receivedAtMs: NOW,
});
const withBid = (amount, riderOfferNgn = 3000) => recordBid({ ...defaultDriverSession }, offer(riderOfferNgn), amount, new Date(NOW).toISOString());
const stageOf = (s) => bidStage(s.pendingBids['ride-1']);

test('waiting, then paying, then accepted', () => {
  let s = withBid(3500);
  assert.equal(stageOf(s), 'waiting');
  s = reduceDriverSession(s, 'ride:rider_paying', { rideId: 'ride-1' }, NOW);
  assert.equal(stageOf(s), 'paying');
  s = reduceDriverSession(s, 'ride:offer_accepted', { rideId: 'ride-1', agreedFareNgn: 3500, paymentMethod: 'WALLET' }, NOW);
  assert.equal(stageOf(s), 'accepted');
  assert.equal(reduceDriverSession(s, 'ride:bid_declined', { rideId: 'ride-1' }, NOW), s, 'an accepted bid is never turned red');
});

test('the rider declined every offer: red, "declined"', () => {
  const s = reduceDriverSession(withBid(3500), 'ride:bid_declined', { rideId: 'ride-1' }, NOW);
  assert.equal(stageOf(s), 'declined');
});

test('another driver won: grey "taken"; a bid that is not ours is left alone', () => {
  const s = reduceDriverSession(withBid(3500), 'ride:bid_lost', { rideId: 'ride-1' }, NOW);
  assert.equal(stageOf(s), 'lost');
  const other = withBid(3500);
  assert.equal(reduceDriverSession(other, 'ride:bid_declined', { rideId: 'ride-2' }, NOW), other);
});

test('took the rider\'s own price: no Change bid; a counter-bid keeps it', () => {
  assert.equal(tookRidersPrice(withBid(3000).pendingBids['ride-1']), true);
  assert.equal(tookRidersPrice(withBid(3500).pendingBids['ride-1']), false);
});

test('the server saying DECLINED rebuilds a red card', () => {
  const s = hydrateBidRecords(withBid(3500), [{
    rideId: 'ride-1', riderId: 'rider-1', status: 'DECLINED', amountNgn: 3500, createdAt: new Date(NOW).toISOString(), resolvedAt: new Date(NOW).toISOString(),
    ride: { pickupAddress: 'Akoka', destAddress: 'Yaba', fareEstimateNgn: 3000, riderOfferNgn: 3000, agreedFareNgn: null },
  }], NOW);
  assert.equal(stageOf(s), 'declined');
});

test('declined stays a live card: the rider\'s next price lands on it (still red, not on Home), and a new bid makes it white again', () => {
  const declined = reduceDriverSession(withBid(4400, 4200), 'ride:bid_declined', { rideId: 'ride-1' }, NOW);
  assert.equal(stageOf(declined), 'declined');
  assert.equal(declined.pendingBids['ride-1'].outcome, undefined, 'not an end');

  const resent = reduceDriverSession(declined, 'ride:offer', offer(4600), NOW + 5_000);
  assert.equal(stageOf(resent), 'declined', 'still red');
  assert.equal(resent.pendingBids['ride-1'].offer.riderOfferNgn, 4600, 'with the rider\'s new price');
  assert.equal(resent.offers.length, 0, 'not queued on Home as a new request');

  const rebid = recordBid(resent, resent.pendingBids['ride-1'].offer, 4600, new Date(NOW + 9_000).toISOString());
  assert.equal(stageOf(rebid), 'waiting', 'a new bid is live again');
});

test('the server says DECLINED for a card still waiting here: it turns red, and stays a live card', () => {
  const s = hydrateBidRecords(withBid(3500), [{
    rideId: 'ride-1', riderId: 'rider-1', status: 'DECLINED', amountNgn: 3500, createdAt: new Date(NOW).toISOString(), resolvedAt: new Date(NOW).toISOString(),
    ride: { pickupAddress: 'Akoka', destAddress: 'Yaba', fareEstimateNgn: 3000, riderOfferNgn: 3000, agreedFareNgn: null },
  }], NOW);
  assert.equal(stageOf(s), 'declined');
  assert.equal(s.pendingBids['ride-1'].outcome, undefined);
});

test('the trip was cancelled: the server row (CANCELLED) removes the card — no green "Starting your trip…" coming back', () => {
  const accepted = reduceDriverSession(withBid(2800, 2500), 'ride:offer_accepted', { rideId: 'ride-1', agreedFareNgn: 2800, paymentMethod: 'WALLET' }, NOW);
  assert.equal(stageOf(accepted), 'accepted');
  const rec = (status) => [{
    rideId: 'ride-1', riderId: 'rider-1', status, amountNgn: 2800, createdAt: new Date(NOW).toISOString(), resolvedAt: new Date(NOW).toISOString(),
    ride: { pickupAddress: 'Akoka', destAddress: 'Yaba', fareEstimateNgn: 2500, riderOfferNgn: 2500, agreedFareNgn: 2800 },
  }];
  const synced = hydrateBidRecords(accepted, rec('CANCELLED'), NOW);
  assert.equal(synced.pendingBids['ride-1'], undefined, 'the card is gone');
  const fresh = hydrateBidRecords({ ...defaultDriverSession }, rec('CANCELLED'), NOW);
  assert.equal(fresh.pendingBids['ride-1'], undefined, 'and is never rebuilt');
});

test('the trip is over: the "Accepted · Starting your trip…" card goes, and the sync never brings it back', () => {
  const accepted = reduceDriverSession(withBid(12500, 11900), 'ride:offer_accepted', { rideId: 'ride-1', agreedFareNgn: 12500, paymentMethod: 'WALLET' }, NOW);
  const done = reduceDriverSession(accepted, 'ride:completed', { rideId: 'ride-1', fareNgn: 12500 }, NOW);
  assert.equal(done.pendingBids['ride-1'], undefined, 'gone on completion');

  const rec = [{
    rideId: 'ride-1', riderId: 'rider-1', status: 'ACCEPTED', amountNgn: 12500, createdAt: new Date(NOW).toISOString(), resolvedAt: new Date(NOW).toISOString(),
    ride: { status: 'COMPLETED', pickupAddress: 'Ilemere', destAddress: 'Unilag', fareEstimateNgn: 11900, riderOfferNgn: 11900, agreedFareNgn: 12500 },
  }];
  assert.equal(hydrateBidRecords({ ...defaultDriverSession }, rec, NOW).pendingBids['ride-1'], undefined, 'not rebuilt from the server');
  assert.equal(hydrateBidRecords(accepted, rec, NOW).pendingBids['ride-1'], undefined, 'and a stale local one is removed');
});
