/**
 * The driver's side of the ride auction, end to end: bid → rider pays →
 * matched → trip. This is the flow that used to strand a driver on a
 * "⏳ Bid sent · waiting for rider" card after the rider had already paid.
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
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-driver-session-')), 'reducer.cjs');

execFileSync('npx', [
  'esbuild', join(projectRoot, 'lib/driver-session-reducer.ts'),
  '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`,
], { cwd: projectRoot, stdio: 'pipe' });

const {
  reduceDriverSession,
  recordBid,
  applyActiveRideSnapshot,
  pruneExpiredBids,
  dismissBid,
  dismissMissedOffer,
  hydrateBidRecords,
  isOfferStale,
  rehydrateMarket,
  selectOfferState,
  ringDeadlineMs,
  RING_WINDOW_MS,
  STALE_OFFER_LINGER_MS,
  MISSED_OFFER_CAP,
  RESOLVED_BID_LINGER_MS,
  defaultDriverSession,
} = createRequire(import.meta.url)(outFile);

const PICKUP = { lat: 6.6018, lng: 3.3515, address: '102 Opebi Rd, Ikeja' };
const DEST = { lat: 6.4969, lng: 3.3556, address: '15 Aiyetoro St, Surulere' };
const NOW = Date.parse('2026-08-28T20:01:00.000Z');

function online() {
  return { ...defaultDriverSession, status: 'online' };
}

function offerPayload(rideId = 'ride-1', extra = {}) {
  return {
    rideId,
    riderId: 'rider-1',
    pickup: PICKUP,
    destination: DEST,
    stops: [],
    fareEstimateNgn: 5200,
    riderOfferNgn: 6000,
    plannedDistanceKm: 17.2,
    plannedDurationSeconds: 1740,
    // The offer card lives 30s — far shorter than the rider takes to pay.
    expiresAt: new Date(NOW + 30_000).toISOString(),
    ...extra,
  };
}

/** Driver sees a request and bids on it. */
function bidSent(rideId = 'ride-1') {
  let s = reduceDriverSession(online(), 'ride:offer', offerPayload(rideId), NOW);
  const offer = s.currentOffer;
  s = recordBid(s, offer, 6000, new Date(NOW).toISOString());
  s = reduceDriverSession(s, 'driver:accept:accepted', { rideId }, NOW);
  // The driver closes the request card and goes back to the map.
  return { ...s, currentOffer: null };
}

test('a bid outlives the 30-second offer card', () => {
  const s = bidSent();
  assert.ok(s.pendingBids['ride-1'], 'the bid is remembered');
  assert.equal(s.pendingBids['ride-1'].amountNgn, 6000);
  assert.equal(s.pendingBids['ride-1'].acceptedAt, undefined, 'nobody has answered yet');
});

test('the rider paying flips the bid to accepted/paid before the match lands', () => {
  const s = reduceDriverSession(bidSent(), 'ride:offer_accepted', {
    rideId: 'ride-1',
    riderId: 'rider-1',
    agreedFareNgn: 6000,
    paymentMethod: 'WALLET',
  }, NOW + 120_000);

  const bid = s.pendingBids['ride-1'];
  assert.ok(bid.acceptedAt, 'the card must stop saying "waiting for rider"');
  assert.equal(bid.riderPaid, true, 'wallet rides are paid at acceptance');
  assert.equal(bid.agreedFareNgn, 6000);
  assert.equal(s.currentRide, null, 'no trip yet — ride:matched starts it');
});

test('a cash acceptance is accepted but not paid', () => {
  const s = reduceDriverSession(bidSent(), 'ride:offer_accepted', {
    rideId: 'ride-1', riderId: 'rider-1', agreedFareNgn: 6000, paymentMethod: 'CASH',
  }, NOW);
  assert.equal(s.pendingBids['ride-1'].riderPaid, false);
});

test('ride:matched two minutes later still starts the trip from the remembered bid', () => {
  // Offer card expired long ago; the match carries only ids and money
  // (what older gateways send).
  const s = reduceDriverSession(bidSent(), 'ride:matched', {
    rideId: 'ride-1',
    riderId: 'rider-1',
    agreedFareNgn: 6000,
    riderPaid: true,
    riderPhone: '+2348000000000',
  }, NOW + 150_000);

  assert.equal(s.status, 'navigating');
  assert.deepEqual(s.pendingBids, {}, 'the bid is resolved');
  assert.deepEqual(s.offers, [], 'other requests are dropped — the driver is busy');
  assert.equal(s.currentRide.rideId, 'ride-1');
  assert.equal(s.currentRide.fareNgn, 6000);
  assert.equal(s.currentRide.riderPaid, true);
  assert.equal(s.currentRide.riderPhone, '+2348000000000');
  assert.equal(s.currentRide.pickup.address, PICKUP.address, 'route rebuilt from the bid');
  assert.equal(s.currentRide.plannedDistanceKm, 17.2);
});

test('ride:matched for a ride this phone never saw is rebuilt from the payload route', () => {
  // App restarted mid-bid: no offer, no pending bid. The gateway now ships
  // pickup/destination with the match, so the trip must still appear.
  const s = reduceDriverSession(online(), 'ride:matched', {
    rideId: 'ride-9',
    riderId: 'rider-9',
    pickup: PICKUP,
    destination: DEST,
    stops: [],
    agreedFareNgn: 4500,
    rideStatus: 'DRIVER_ASSIGNED',
    riderPaid: true,
  }, NOW);

  assert.equal(s.status, 'navigating');
  assert.equal(s.currentRide.rideId, 'ride-9');
  assert.equal(s.currentRide.destination.address, DEST.address);
});

test("the rider's first name comes with the match, for the chat's title, and survives a resync that lacks it", () => {
  let s = reduceDriverSession(online(), 'ride:matched', {
    rideId: 'ride-7', riderId: 'rider-7', pickup: PICKUP, destination: DEST,
    agreedFareNgn: 3000, rideStatus: 'DRIVER_ASSIGNED', riderName: 'Ada',
  }, NOW);
  assert.equal(s.currentRide.riderName, 'Ada');
  s = reduceDriverSession(s, 'ride:matched', {
    rideId: 'ride-7', riderId: 'rider-7', pickup: PICKUP, destination: DEST,
    agreedFareNgn: 3000, rideStatus: 'DRIVER_EN_ROUTE', resync: true,
  }, NOW);
  assert.equal(s.currentRide.riderName, 'Ada', 'an older server leaves it out; the name stays');
});

test('ride:matched with no route and no memory of the ride is ignored, not crashed', () => {
  const before = online();
  const s = reduceDriverSession(before, 'ride:matched', { rideId: 'ghost', riderId: 'r' }, NOW);
  assert.equal(s, before);
});

test('a reconnect resync reflects how far the trip already is', () => {
  let s = reduceDriverSession(online(), 'ride:matched', {
    rideId: 'ride-1', riderId: 'rider-1', pickup: PICKUP, destination: DEST,
    rideStatus: 'IN_PROGRESS', agreedFareNgn: 6000, resync: true,
  }, NOW);
  assert.equal(s.status, 'active', 'an in-progress ride reopens on the trip screen');

  // The driver ended the trip locally; a resync that still says IN_PROGRESS
  // (DB write trailing the ack) must not drag them back into the trip.
  s = reduceDriverSession(s, 'ride:end:accepted', { fareNgn: 6000 }, NOW);
  assert.equal(s.status, 'completed');
  s = reduceDriverSession(s, 'ride:matched', {
    rideId: 'ride-1', riderId: 'rider-1', pickup: PICKUP, destination: DEST,
    rideStatus: 'IN_PROGRESS', resync: true,
  }, NOW);
  assert.equal(s.status, 'completed', 'never moves a trip backwards');
});

test('a paid flag learned on the bid survives into the trip', () => {
  let s = reduceDriverSession(bidSent(), 'ride:offer_accepted', {
    rideId: 'ride-1', agreedFareNgn: 6000, paymentMethod: 'WALLET',
  }, NOW);
  s = reduceDriverSession(s, 'ride:matched', { rideId: 'ride-1', riderId: 'rider-1' }, NOW);
  assert.equal(s.currentRide.riderPaid, true);
});

test('ride:rider_paid marks the bid, or the trip, paid', () => {
  let s = reduceDriverSession(bidSent(), 'ride:rider_paid', { rideId: 'ride-1' }, NOW);
  assert.equal(s.pendingBids['ride-1'].riderPaid, true);

  s = reduceDriverSession(s, 'ride:matched', { rideId: 'ride-1', riderId: 'rider-1', riderPaid: false }, NOW);
  assert.equal(s.currentRide.riderPaid, true, 'paid on the bid is paid on the trip');
});

test('cancellation clears the bid; other bids are untouched', () => {
  let s = bidSent('ride-1');
  s = reduceDriverSession(s, 'ride:offer', offerPayload('ride-2'), NOW);
  s = recordBid(s, s.currentOffer, 5000);
  s = { ...s, currentOffer: null };

  s = reduceDriverSession(s, 'ride:cancelled', { rideId: 'ride-1' }, NOW);
  assert.equal(s.pendingBids['ride-1'], undefined);
  assert.ok(s.pendingBids['ride-2']);
  assert.equal(s.currentRide, null);
});

test('the driver cancelling their own trip clears it on the ack', () => {
  let s = reduceDriverSession(bidSent(), 'ride:matched', { rideId: 'ride-1', riderId: 'rider-1' }, NOW);
  assert.equal(s.status, 'navigating');
  s = reduceDriverSession(s, 'ride:cancel:accepted', { rideId: 'ride-1' }, NOW);
  assert.equal(s.currentRide, null);
  assert.equal(s.status, 'online');
});

test('the active-ride snapshot adopts a missed match and clears stale bids', () => {
  const s = applyActiveRideSnapshot(bidSent(), {
    rideId: 'ride-1',
    riderId: 'rider-1',
    driverId: 'drv-1',
    rideStatus: 'DRIVER_ASSIGNED',
    paymentMethod: 'WALLET',
    pickup: PICKUP,
    destination: DEST,
    stops: [],
    agreedFareNgn: 6000,
    riderOfferNgn: 6000,
    riderPaid: true,
    riderPhone: null,
    matchedAt: new Date(NOW).toISOString(),
    arrivedAt: null,
    startedAt: null,
  });
  assert.equal(s.status, 'navigating');
  assert.equal(s.currentRide.rideId, 'ride-1');
  assert.deepEqual(s.pendingBids, {});
});

test('a snapshot with no live trip changes nothing', () => {
  const before = bidSent();
  assert.equal(applyActiveRideSnapshot(before, null), before);
  assert.equal(
    applyActiveRideSnapshot(before, { rideId: 'x', rideStatus: 'COMPLETED', pickup: PICKUP, destination: DEST, stops: [], agreedFareNgn: 0 }),
    before,
  );
});

test('bidding removes the request from the queue — one ride, one card', () => {
  let s = reduceDriverSession(online(), 'ride:offer', offerPayload('ride-1'), NOW);
  assert.equal(s.offers.length, 1);
  s = recordBid(s, s.currentOffer, 6000, new Date(NOW).toISOString());
  assert.equal(s.offers.length, 0, 'the answered request must not sit beside the bid card');
  assert.ok(s.pendingBids['ride-1']);
});

test('a rider counter-offer updates the bid card instead of spawning a new request', () => {
  let s = bidSent('ride-1');
  // Backend re-broadcasts the request with the rider\'s new number.
  s = reduceDriverSession(s, 'ride:offer', offerPayload('ride-1', { riderOfferNgn: 3600 }), NOW + 60_000);
  assert.equal(s.offers.length, 0, 'no duplicate card');
  const bid = s.pendingBids['ride-1'];
  assert.equal(bid.offer.riderOfferNgn, 3600, 'the card carries the rider\'s new ask');
  assert.ok(bid.counteredAt, 'marked as countered');
  assert.equal(bid.amountNgn, 6000, 'my own bid amount is untouched');

  // Same price re-broadcast (driver came online etc.) is not a "counter".
  const again = reduceDriverSession(bidSent('ride-2'), 'ride:offer', offerPayload('ride-2'), NOW);
  assert.equal(again.pendingBids['ride-2'].counteredAt, undefined);
});

test('a timed-out bid becomes a terminal card that says why — never vanishes', () => {
  const s = reduceDriverSession(bidSent('ride-1'), 'ride:bid_timeout', { rideId: 'ride-1' }, NOW);
  const bid = s.pendingBids['ride-1'];
  assert.equal(bid.outcome, 'expired', 'stays visible with its outcome');
  assert.ok(bid.resolvedAt);
  assert.deepEqual(s.offers, []);

  // Rider chose someone else → same shape, different story.
  const lost = reduceDriverSession(bidSent('ride-2'), 'ride:bid_lost', { rideId: 'ride-2' }, NOW);
  assert.equal(lost.pendingBids['ride-2'].outcome, 'lost');

  // A dead bid never absorbs a fresh broadcast for its old rideId.
  const revived = reduceDriverSession(s, 'ride:offer', offerPayload('ride-1'), NOW);
  assert.equal(revived.pendingBids['ride-1'].outcome, 'expired', 'terminal stays terminal');

  // The driver can swipe the story away.
  assert.deepEqual(dismissBid(s, 'ride-1').pendingBids, {});

  // Unknown ride: no-op, same reference.
  const before = online();
  assert.equal(reduceDriverSession(before, 'ride:bid_timeout', { rideId: 'ghost' }, NOW), before);
});

test('an unresolved bid past its auction turns terminal, then leaves after the linger', () => {
  const s = bidSent('ride-1');
  assert.equal(pruneExpiredBids(s, NOW + 40_000), s, 'young bids survive, same reference');

  // A bid is money on the table until the RIDER acts — the offer's own 30s
  // clock passing does not end it, and neither do the next many minutes...
  assert.equal(pruneExpiredBids(s, NOW + 100_000), s, 'own lifetime beats the offer clock');
  assert.equal(
    pruneExpiredBids(s, NOW + 20 * 60_000).pendingBids['ride-1'].outcome,
    undefined,
    'still open twenty minutes in',
  );

  // ...only the long dropped-frame backstop finally turns it terminal.
  const stale = pruneExpiredBids(s, NOW + 31 * 60_000);
  assert.equal(stale.pendingBids['ride-1'].outcome, 'expired', 'converted, not deleted');

  // …and only after the 10-minute linger does the card actually leave.
  assert.deepEqual(pruneExpiredBids(stale, NOW + 31 * 60_000 + 601_000).pendingBids, {});

  // A counter refreshes the offer (fresh expiresAt) — negotiation alive.
  const countered = reduceDriverSession(s, 'ride:offer',
    offerPayload('ride-1', { riderOfferNgn: 3600, expiresAt: new Date(NOW + 130_000).toISOString() }), NOW + 40_000);
  assert.equal(pruneExpiredBids(countered, NOW + 60_000).pendingBids['ride-1'].outcome, undefined);

  // An accepted bid holds much longer (resync will normally convert it).
  const accepted = reduceDriverSession(bidSent('ride-2'), 'ride:offer_accepted', { rideId: 'ride-2', paymentMethod: 'WALLET' }, NOW);
  assert.ok(pruneExpiredBids(accepted, NOW + 300_000).pendingBids['ride-2']);
  assert.deepEqual(pruneExpiredBids(accepted, NOW + 601_000).pendingBids, {});
});

test('the full happy path: offer → bid → paid → matched → arrived → started → completed', () => {
  let s = bidSent();
  s = reduceDriverSession(s, 'ride:offer_accepted', { rideId: 'ride-1', agreedFareNgn: 6000, paymentMethod: 'WALLET' }, NOW);
  s = reduceDriverSession(s, 'ride:matched', { rideId: 'ride-1', riderId: 'rider-1', agreedFareNgn: 6000, riderPaid: true }, NOW);
  assert.equal(s.status, 'navigating');
  s = reduceDriverSession(s, 'ride:arrived:ack', { rideId: 'ride-1' }, NOW);
  assert.equal(s.status, 'arrived');
  s = reduceDriverSession(s, 'ride:start:accepted', { rideId: 'ride-1', startedAt: new Date(NOW).toISOString() }, NOW);
  assert.equal(s.status, 'active');
  assert.ok(s.currentRide.startedAt);
  s = reduceDriverSession(s, 'ride:end:accepted', { rideId: 'ride-1', fareNgn: 6000, distanceKm: 17.4 }, NOW);
  assert.equal(s.status, 'completed');
  assert.equal(s.currentRide.completedFareNgn, 6000);
  assert.equal(s.currentRide.distanceKm, 17.4);
});

test('messages that are not session transitions are reported as unhandled', () => {
  assert.equal(reduceDriverSession(online(), 'chat:message', {}, NOW), null);
  assert.equal(reduceDriverSession(online(), 'wallet:updated', {}, NOW), null);
});

/* ── missed requests: a timer running out is a UI event, not a deletion ── */

test('a run-out request stays in the queue — stale and biddable, not deleted', () => {
  let s = reduceDriverSession(online(), 'ride:offer', offerPayload('ride-m1'), NOW);
  s = pruneExpiredBids(s, NOW + 31_000); // past expiresAt (NOW+30s)
  // The countdown ending is a UI event: the offer is still there to bid on.
  assert.equal(s.offers.length, 1);
  assert.equal(isOfferStale(s.offers[0], NOW + 31_000), true);
  assert.equal(s.missedOffers.length, 0);
  // Only after the stale linger does it become a tombstone.
  s = pruneExpiredBids(s, NOW + 30_000 + STALE_OFFER_LINGER_MS + 1_000);
  assert.equal(s.offers.length, 0);
  assert.equal(s.missedOffers.length, 1);
  assert.equal(s.missedOffers[0].offer.rideId, 'ride-m1');
  assert.equal(s.missedOffers[0].reason, 'expired');
  assert.equal(s.currentOffer, null);
});

test('an answered request never doubles as a missed card — the bid card owns it', () => {
  let s = bidSent('ride-m2');
  s = pruneExpiredBids(s, NOW + 61_000);
  assert.equal(s.missedOffers.length, 0);
  assert.ok(s.pendingBids['ride-m2']);
});

test('bid_timeout on an untouched request files it as missed (expired)', () => {
  let s = reduceDriverSession(online(), 'ride:offer', offerPayload('ride-m3'), NOW);
  s = reduceDriverSession(s, 'ride:bid_timeout', { rideId: 'ride-m3' }, NOW + 5_000);
  assert.equal(s.offers.length, 0);
  assert.equal(s.missedOffers.length, 1);
  assert.equal(s.missedOffers[0].reason, 'expired');
});

test('bid_lost on an untouched request files it as missed (taken)', () => {
  let s = reduceDriverSession(online(), 'ride:offer', offerPayload('ride-m4'), NOW);
  s = reduceDriverSession(s, 'ride:bid_lost', { rideId: 'ride-m4' }, NOW + 5_000);
  assert.equal(s.missedOffers.length, 1);
  assert.equal(s.missedOffers[0].reason, 'taken');
});

test('a re-broadcast revives even a tombstoned request back into the live queue', () => {
  const dead = NOW + 30_000 + STALE_OFFER_LINGER_MS + 1_000;
  let s = reduceDriverSession(online(), 'ride:offer', offerPayload('ride-m5'), NOW);
  s = pruneExpiredBids(s, dead);
  assert.equal(s.missedOffers.length, 1);
  s = reduceDriverSession(
    s,
    'ride:offer',
    offerPayload('ride-m5', { expiresAt: new Date(dead + 120_000).toISOString() }),
    dead + 1_000,
  );
  assert.equal(s.missedOffers.length, 0);
  assert.equal(s.offers.length, 1);
});

test('missed cards leave after their linger, and the pile is capped', () => {
  let s = online();
  for (let i = 0; i < MISSED_OFFER_CAP + 3; i += 1) {
    s = reduceDriverSession(s, 'ride:offer', offerPayload(`ride-c${i}`), NOW);
  }
  const dead = NOW + 30_000 + STALE_OFFER_LINGER_MS + 1_000;
  s = pruneExpiredBids(s, dead);
  assert.equal(s.missedOffers.length, MISSED_OFFER_CAP);
  s = pruneExpiredBids(s, dead + RESOLVED_BID_LINGER_MS + 1);
  assert.equal(s.missedOffers.length, 0);
});

test('dismissMissedOffer removes exactly the swiped card', () => {
  let s = reduceDriverSession(online(), 'ride:offer', offerPayload('ride-m6'), NOW);
  s = reduceDriverSession(s, 'ride:offer', offerPayload('ride-m7'), NOW);
  s = pruneExpiredBids(s, NOW + 30_000 + STALE_OFFER_LINGER_MS + 1_000);
  assert.equal(s.missedOffers.length, 2);
  s = dismissMissedOffer(s, 'ride-m6');
  assert.equal(s.missedOffers.length, 1);
  assert.equal(s.missedOffers[0].offer.rideId, 'ride-m7');
});

/* ── the ring window: 30s of noise inside a 90s auction ── */

test('ringDeadlineMs is receivedAt + 30s, clamped to the offer expiry', () => {
  const s = reduceDriverSession(
    online(),
    'ride:offer',
    offerPayload('ride-r1', { expiresAt: new Date(NOW + 90_000).toISOString() }),
    NOW,
  );
  const offer = s.offers[0];
  assert.equal(offer.receivedAtMs, NOW);
  assert.equal(ringDeadlineMs(offer), NOW + RING_WINDOW_MS);
  // a request already near expiry rings only until the auction closes
  const late = { ...offer, expiresAt: new Date(NOW + 10_000).toISOString() };
  assert.equal(ringDeadlineMs(late), NOW + 10_000);
});

/* ── tapping never deletes; reloads never empty the Active tab ── */

test('tapping a stale request opens it instead of pruning it away', () => {
  let s = reduceDriverSession(online(), 'ride:offer', offerPayload('ride-t1'), NOW);
  s = pruneExpiredBids(s, NOW + 31_000); // stale but lingering
  s = selectOfferState(s, 'ride-t1');
  assert.equal(s.offers.length, 1);
  assert.equal(s.currentOffer?.rideId, 'ride-t1');
});

test('tapping a missed tombstone revives it into the queue, biddable again', () => {
  const dead = NOW + 30_000 + STALE_OFFER_LINGER_MS + 1_000;
  let s = reduceDriverSession(online(), 'ride:offer', offerPayload('ride-t2'), NOW);
  s = pruneExpiredBids(s, dead);
  assert.equal(s.missedOffers.length, 1);
  s = selectOfferState(s, 'ride-t2');
  assert.equal(s.missedOffers.length, 0);
  assert.equal(s.offers.length, 1);
  assert.equal(s.currentOffer?.rideId, 'ride-t2');
});

test('rehydrateMarket restores a persisted snapshot without clobbering live state', () => {
  const liveState = reduceDriverSession(online(), 'ride:offer', offerPayload('ride-live'), NOW);
  const snapshot = {
    offers: [
      offerPayload('ride-live', { fareEstimateNgn: 1 }), // stale duplicate — live wins
      { ...offerPayload('ride-snap'), receivedAtMs: NOW },
    ],
    pendingBids: {
      'ride-bid': {
        offer: { ...offerPayload('ride-bid'), receivedAtMs: NOW },
        amountNgn: 6500,
        sentAt: new Date(NOW).toISOString(),
      },
    },
    missedOffers: [],
  };
  const s = rehydrateMarket(liveState, snapshot, NOW + 5_000);
  assert.equal(s.offers.length, 2);
  const live = s.offers.find((o) => o.rideId === 'ride-live');
  assert.notEqual(live.fareEstimateNgn, 1);
  assert.ok(s.pendingBids['ride-bid']);
});

test('hydrateBidRecords rebuilds bid cards from server records, socket truth first', () => {
  const record = (rideId, status, extra = {}) => ({
    rideId,
    amountNgn: 7000,
    status,
    createdAt: new Date(NOW - 60_000).toISOString(),
    resolvedAt: status === 'PENDING' ? null : new Date(NOW - 30_000).toISOString(),
    ride: {
      pickupAddress: PICKUP.address,
      destAddress: DEST.address,
      riderOfferNgn: 6000,
      agreedFareNgn: null,
      fareEstimateNgn: 5200,
    },
    ...extra,
  });
  let s = bidSent('ride-live'); // live socket bid must not be overwritten
  s = hydrateBidRecords(
    s,
    [
      record('ride-live', 'PENDING', { amountNgn: 1 }),
      record('ride-pend', 'PENDING'),
      record('ride-lost', 'LOST'),
      record('ride-old', 'EXPIRED', {
        createdAt: new Date(NOW - 60 * 60_000).toISOString(),
        resolvedAt: new Date(NOW - 59 * 60_000).toISOString(),
      }),
      record('ride-gone', 'WITHDRAWN'),
    ],
    NOW,
  );
  assert.notEqual(s.pendingBids['ride-live'].amountNgn, 1);
  assert.ok(s.pendingBids['ride-pend']);
  assert.equal(s.pendingBids['ride-pend'].outcome, undefined);
  assert.equal(s.pendingBids['ride-lost'].outcome, 'lost');
  assert.equal(s.pendingBids['ride-old'], undefined); // too old to resurrect
  assert.equal(s.pendingBids['ride-gone'], undefined); // withdrawn stays gone
});
