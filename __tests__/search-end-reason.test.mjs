/**
 * Why a driver's search ended, from the `reason` newer servers put on
 * ride:bid_timeout / ride:bid_lost: "Rider cancelled", "Search ended",
 * "Not chosen". Without a reason every card reads as it always did.
 *
 *   node --test __tests__/search-end-reason.test.mjs
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
const dir = mkdtempSync(join(tmpdir(), 'wheelers-search-end-'));
const entry = join(dir, 'entry.ts');
writeFileSync(entry, `
export * from '${join(projectRoot, 'lib/driver-session-reducer.ts')}';
export * from '${join(projectRoot, 'lib/bid-card-state.ts')}';
`);
const outFile = join(dir, 'bundle.cjs');
execFileSync('npx', ['esbuild', entry, '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const { reduceDriverSession, recordBid, defaultDriverSession, bidStage, outcomeLabel, hydrateBidRecords } = createRequire(import.meta.url)(outFile);

const NOW = Date.parse('2026-10-27T10:00:00Z');
const offer = (rideId = 'ride-1') => ({
  rideId, riderId: 'rider-1',
  pickup: { lat: 6.5, lng: 3.3, address: 'Akoka' }, destination: { lat: 6.4, lng: 3.4, address: 'Yaba' }, stops: [],
  fareEstimateNgn: 3000, riderOfferNgn: 3000, expiresAt: new Date(NOW + 60_000).toISOString(), receivedAtMs: NOW,
});
const withBid = (rideId = 'ride-1') => recordBid({ ...defaultDriverSession, status: 'online' }, offer(rideId), 3500, new Date(NOW).toISOString());
const offerPayload = (rideId) => ({ ...offer(rideId), expiresAt: new Date(NOW + 30_000).toISOString() });
const labelOf = (s, rideId = 'ride-1') => {
  const bid = s.pendingBids[rideId];
  return outcomeLabel(bid.outcome, bid.endReason);
};

test('rider cancelled, search ended, not chosen: each says so', () => {
  const cancelled = reduceDriverSession(withBid(), 'ride:bid_timeout', { rideId: 'ride-1', reason: 'rider_cancelled' }, NOW);
  assert.equal(labelOf(cancelled), 'Rider cancelled');
  const timedOut = reduceDriverSession(withBid(), 'ride:bid_timeout', { rideId: 'ride-1', reason: 'timed_out' }, NOW);
  assert.equal(labelOf(timedOut), 'Search ended');
  const lost = reduceDriverSession(withBid(), 'ride:bid_lost', { rideId: 'ride-1', reason: 'booked_other' }, NOW);
  assert.equal(labelOf(lost), 'Not chosen');
  assert.equal(bidStage(lost.pendingBids['ride-1']), 'lost');
});

test('no reason (older server): the old words', () => {
  const timedOut = reduceDriverSession(withBid(), 'ride:bid_timeout', { rideId: 'ride-1' }, NOW);
  assert.equal(timedOut.pendingBids['ride-1'].endReason, undefined);
  assert.equal(labelOf(timedOut), 'Request ended');
  const lost = reduceDriverSession(withBid(), 'ride:bid_lost', { rideId: 'ride-1' }, NOW);
  assert.equal(labelOf(lost), 'Taken by another driver');
  const odd = reduceDriverSession(withBid(), 'ride:bid_timeout', { rideId: 'ride-1', reason: 'something_new' }, NOW);
  assert.equal(labelOf(odd), 'Request ended', 'an unknown reason is ignored');
});

test('a request never answered: "Rider cancelled" files it as cancelled, not as one to still bid on', () => {
  let s = reduceDriverSession({ ...defaultDriverSession, status: 'online' }, 'ride:offer', offerPayload('ride-m'), NOW);
  s = reduceDriverSession(s, 'ride:bid_timeout', { rideId: 'ride-m', reason: 'rider_cancelled' }, NOW + 5_000);
  assert.equal(s.missedOffers[0].reason, 'cancelled');

  let t = reduceDriverSession({ ...defaultDriverSession, status: 'online' }, 'ride:offer', offerPayload('ride-n'), NOW);
  t = reduceDriverSession(t, 'ride:bid_timeout', { rideId: 'ride-n', reason: 'booked_other' }, NOW + 5_000);
  assert.equal(t.missedOffers[0].reason, 'taken');

  let u = reduceDriverSession({ ...defaultDriverSession, status: 'online' }, 'ride:offer', offerPayload('ride-o'), NOW);
  u = reduceDriverSession(u, 'ride:bid_lost', { rideId: 'ride-o', reason: 'timed_out' }, NOW + 5_000);
  assert.equal(u.missedOffers[0].reason, 'expired');
});

test('booked (paid) stays booked when the search ends for others; a fall-through says Not chosen', () => {
  let s = reduceDriverSession(withBid(), 'ride:offer_accepted', { rideId: 'ride-1', agreedFareNgn: 3500, paymentMethod: 'WALLET' }, NOW);
  assert.equal(bidStage(s.pendingBids['ride-1']), 'accepted');
  const still = reduceDriverSession(s, 'ride:bid_timeout', { rideId: 'ride-1', reason: 'timed_out' }, NOW);
  assert.equal(bidStage(still.pendingBids['ride-1']), 'accepted');
  const fell = reduceDriverSession(s, 'ride:bid_lost', { rideId: 'ride-1', reason: 'booked_other' }, NOW);
  assert.equal(labelOf(fell), 'Not chosen');
});

test('declined still lets the driver send a new price, and the reason is not set by it', () => {
  const s = reduceDriverSession(withBid(), 'ride:bid_declined', { rideId: 'ride-1' }, NOW);
  assert.equal(bidStage(s.pendingBids['ride-1']), 'declined');
  assert.equal(s.pendingBids['ride-1'].endReason, undefined);
});

test('ride:cancelled by the rider on a bid (not our trip) keeps the card as "Rider cancelled"', () => {
  let s = reduceDriverSession(withBid(), 'ride:offer_accepted', { rideId: 'ride-1', agreedFareNgn: 3500, paymentMethod: 'WALLET' }, NOW);
  s = reduceDriverSession(s, 'ride:cancelled', { rideId: 'ride-1', reason: 'rider_cancelled', cancelledBy: 'rider' }, NOW);
  const bid = s.pendingBids['ride-1'];
  assert.ok(bid);
  assert.equal(bid.acceptedAt, undefined);
  assert.equal(bid.riderPaid, false);
  assert.equal(labelOf(s), 'Rider cancelled');

  // Without a word on who cancelled: cleared, as before.
  const plain = reduceDriverSession(withBid(), 'ride:cancelled', { rideId: 'ride-1' }, NOW);
  assert.equal(plain.pendingBids['ride-1'], undefined);
});

test('ride:cancelled for the trip itself still ends the trip', () => {
  let s = reduceDriverSession(withBid(), 'ride:matched', { rideId: 'ride-1', riderId: 'rider-1' }, NOW);
  assert.equal(s.currentRide.rideId, 'ride-1');
  s = reduceDriverSession(s, 'ride:cancelled', { rideId: 'ride-1', reason: 'rider_cancelled', cancelledBy: 'rider' }, NOW);
  assert.equal(s.currentRide, null);
  assert.equal(s.pendingBids['ride-1'], undefined);
});

test('a reconnect does not wipe a "Rider cancelled" card the server marks CANCELLED; a card still waiting is cleared as before', () => {
  const rec = (rideId) => ({
    rideId, riderId: 'rider-1', status: 'CANCELLED', amountNgn: 3500, createdAt: new Date(NOW).toISOString(), resolvedAt: new Date(NOW).toISOString(),
    ride: { status: 'CANCELLED', pickupAddress: 'Akoka', destAddress: 'Yaba', fareEstimateNgn: 3000, riderOfferNgn: 3000, agreedFareNgn: null },
  });
  const ended = reduceDriverSession(withBid(), 'ride:bid_timeout', { rideId: 'ride-1', reason: 'rider_cancelled' }, NOW);
  const synced = hydrateBidRecords(ended, [rec('ride-1')], NOW + 1_000);
  assert.ok(synced.pendingBids['ride-1'], 'kept');
  assert.equal(labelOf(synced), 'Rider cancelled');

  const waiting = hydrateBidRecords(withBid('ride-2'), [rec('ride-2')], NOW + 1_000);
  assert.equal(waiting.pendingBids['ride-2'], undefined, 'a live-looking card of a cancelled ride still goes');
});

test('a request re-sent for a ride whose card ended shows again; the sync does not bring the old card back over it', () => {
  const ended = reduceDriverSession(withBid(), 'ride:bid_timeout', { rideId: 'ride-1', reason: 'rider_cancelled' }, NOW);
  const resent = reduceDriverSession(ended, 'ride:offer', offerPayload('ride-1'), NOW + 5_000);
  assert.equal(resent.pendingBids['ride-1'], undefined);
  assert.ok(resent.offers.some((o) => o.rideId === 'ride-1'));
  const synced = hydrateBidRecords(resent, [{
    rideId: 'ride-1', riderId: 'rider-1', status: 'EXPIRED', amountNgn: 3500, createdAt: new Date(NOW).toISOString(), resolvedAt: new Date(NOW).toISOString(),
    ride: { pickupAddress: 'Akoka', destAddress: 'Yaba', fareEstimateNgn: 3000, riderOfferNgn: 3000, agreedFareNgn: null },
  }], NOW + 6_000);
  assert.equal(synced.pendingBids['ride-1'], undefined);
});
