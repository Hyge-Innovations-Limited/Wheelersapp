/**
 * A tapped push opens what it is about; the same notification is never handled twice;
 * drivers have no Skip on a request.
 *
 *   node --test __tests__/push-routing.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-push-routing-')), 'bundle.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/push-routing.ts'), '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const { riderOnTop, stackActionFor, stackNamesFrom, notePushOpened, armPushHold, setPushFallbackNavigator, releasePushHoldAndNavigate, setRiderPushProbe, riderPushTarget, riderPushWait, reopenedRideIds, routePush, handleTapResponse, releasePushHold, resetPushRoutingForTests, focusDriverOffer, subscribeOfferFocus, clearOfferFocus } = createRequire(import.meta.url)(outFile);

function run(data, isDriverApp, extra = {}) {
  const log = { nav: [], focus: [], chat: [], call: [] };
  routePush(data, {
    isDriverApp,
    navigate: (h) => log.nav.push(h),
    requestOpenTripChat: (id) => { log.chat.push(id); return extra.chatOpened ?? false; },
    requestCurrentCall: (id) => log.call.push(id),
    liveCallSupported: extra.call ?? true,
    focusDriverOffer: (id) => log.focus.push(id),
  });
  return log;
}

test('driver ride:request opens Active with that request first', () => {
  const log = run({ type: 'ride:request', rideId: 'r1' }, true);
  assert.deepEqual(log.nav, ['/driver/(tabs)/active']);
  assert.deepEqual(log.focus, ['r1']);
});

test('driver ride:request without a ride id: Active alone', () => {
  const log = run({ type: 'ride:request' }, true);
  assert.deepEqual(log.nav, ['/driver/(tabs)/active']);
  assert.deepEqual(log.focus, []);
});

test('rider app ignores ride:request', () => {
  assert.deepEqual(run({ type: 'ride:request', rideId: 'r1' }, false).nav, []);
});

test('existing routes unchanged', () => {
  assert.deepEqual(run({ type: 'kyc_approved' }, true).nav, ['/driver/onboarding/pending']);
  assert.deepEqual(run({ type: 'dispatch_nudge', online: '1', rideId: 'x' }, true).nav, ['/driver/(tabs)/active']);
  assert.deepEqual(run({ type: 'dispatch_nudge', online: '0' }, true).nav, ['/driver/(tabs)/home']);
  assert.deepEqual(run({ type: 'wallet:updated' }, true).nav, ['/driver/(tabs)/wallet']);
  assert.deepEqual(run({ type: 'ride:cancelled' }, true).nav, ['/driver/(tabs)/active']);
  assert.deepEqual(run({ type: 'ride:offer' }, false).nav, ['/rider']);
  assert.deepEqual(run({ type: 'ride:matched' }, false).nav, ['/rider/active-trip']);
  assert.deepEqual(run({ type: 'call:incoming', rideId: 'c' }, false).call, ['c']);
  assert.deepEqual(run({ type: 'chat:message', rideId: 'c' }, false).nav, ['/rider/active-trip']);
  assert.deepEqual(run({ type: 'chat:message', rideId: 'c' }, true).nav, ['/driver/(tabs)/active']);
  assert.deepEqual(run({ type: 'chat:message', rideId: 'c' }, true, { chatOpened: true }).nav, []);
});

test('more routes, unchanged', () => {
  assert.deepEqual(run({ type: 'kyc_rejected' }, true).nav, ['/driver/onboarding/pending']);
  for (const type of ['ride:scheduled_started', 'ride:bid_timeout', 'ride:driver_arrived', 'ride:driver_cancelled']) {
    assert.deepEqual(run({ type }, false).nav, ['/rider'], type);
  }
  assert.deepEqual(run({ type: 'ride:matched' }, false).nav, ['/rider/active-trip']);
  assert.deepEqual(run({ type: 'call:missed', rideId: 'c' }, false).nav, ['/rider/active-trip']);
  assert.deepEqual(run({ type: 'call:missed', rideId: 'c' }, true).nav, ['/driver/(tabs)/active']);
  const noCall = run({ type: 'call:incoming', rideId: 'c' }, false, { call: false });
  assert.deepEqual(noCall.call, []);
  assert.deepEqual(noCall.nav, []);
});

function tap(id, data, now) {
  return { notification: { date: now, request: { identifier: id, content: { data } } } };
}
function deps(log, held) {
  return {
    isDriverApp: true,
    navigate: (h) => log.push(h),
    requestOpenTripChat: () => false,
    requestCurrentCall: () => {},
    liveCallSupported: true,
    focusDriverOffer,
  };
}

test('the same response twice: one navigate; live tap then launch read: one navigate', () => {
  resetPushRoutingForTests();
  releasePushHold();
  const log = [];
  const r = tap('a1', { type: 'wallet:updated' }, Date.now());
  assert.equal(handleTapResponse(r, deps(log)), true);
  assert.equal(handleTapResponse(r, deps(log)), false);
  assert.equal(handleTapResponse(r, deps(log), { launch: true }), false);
  assert.deepEqual(log, ['/driver/(tabs)/wallet']);
});

test('a tap before the splash lets go is parked, not navigated; the splash takes it', () => {
  resetPushRoutingForTests();
  const log = [];
  assert.equal(handleTapResponse(tap('p1', { type: 'ride:request', rideId: 'z' }, Date.now()), deps(log), { launch: true }), true);
  assert.deepEqual(log, []);
  assert.equal(releasePushHold(), '/driver/(tabs)/active');
  assert.equal(releasePushHold(), null);
  // and after release it goes straight through
  handleTapResponse(tap('p2', { type: 'wallet:updated' }, Date.now()), deps(log));
  assert.deepEqual(log, ['/driver/(tabs)/wallet']);
});

test('a launch read counts only while the hold is on', () => {
  resetPushRoutingForTests();
  const log = [];
  // the tap that launched the app: read before the splash lets go, however old the notification
  const old = Date.now() - 3 * 60 * 60 * 1000;
  assert.equal(handleTapResponse(tap('l1', { type: 'wallet:updated' }, old), deps(log), { launch: true }), true);
  assert.equal(releasePushHold(), '/driver/(tabs)/wallet');
  // a tap made while signed out, read after sign-in (hold gone): not replayed
  assert.equal(handleTapResponse(tap('l2', { type: 'wallet:updated' }, Date.now()), deps(log), { launch: true }), false);
  assert.deepEqual(log, []);
});

test('JS alive after a swipe from Recents: release, arm again, launch tap is parked not dropped', () => {
  resetPushRoutingForTests();
  releasePushHold();
  armPushHold();
  const log = [];
  assert.equal(handleTapResponse(tap('r1', { type: 'ride:request', rideId: 'q' }, Date.now()), deps(log), { launch: true }), true);
  assert.deepEqual(log, []);
  assert.equal(releasePushHold(), '/driver/(tabs)/active');
});

test('arming while already held keeps a tap parked meanwhile (launch read before the splash mounts)', () => {
  resetPushRoutingForTests();
  const log = [];
  assert.equal(handleTapResponse(tap('h1', { type: 'wallet:updated' }, Date.now()), deps(log), { launch: true }), true);
  armPushHold(); // the splash mounting
  assert.deepEqual(log, []);
  assert.equal(releasePushHold(), '/driver/(tabs)/wallet');
});

test('failsafe: releasing without the splash navigates what was parked', () => {
  resetPushRoutingForTests();
  handleTapResponse(tap('f1', { type: 'wallet:updated' }, Date.now()), deps([]));
  const seen = [];
  setPushFallbackNavigator((h) => seen.push(h));
  releasePushHoldAndNavigate();
  assert.deepEqual(seen, ['/driver/(tabs)/wallet']);
  releasePushHoldAndNavigate();
  assert.deepEqual(seen, ['/driver/(tabs)/wallet']);
});

test('a throwing navigate does not mark the notification handled', () => {
  resetPushRoutingForTests();
  releasePushHold();
  const r = tap('t1', { type: 'wallet:updated' }, Date.now());
  assert.throws(() => handleTapResponse(r, { ...deps([]), navigate: () => { throw new Error('x'); } }));
  const log = [];
  assert.equal(handleTapResponse(r, deps(log)), true);
});

test('offer focus: waiting focus is delivered on subscribe, later ones too, unsubscribe stops it', () => {
  resetPushRoutingForTests();
  focusDriverOffer('early');
  const seen = [];
  const off = subscribeOfferFocus((id) => seen.push(id));
  assert.deepEqual(seen, ['early']);
  focusDriverOffer('later');
  assert.deepEqual(seen, ['early', 'later']);
  off();
  focusDriverOffer('after');
  assert.deepEqual(seen, ['early', 'later']);
  clearOfferFocus();
  const again = [];
  subscribeOfferFocus((id) => again.push(id))();
  assert.deepEqual(again, []);
});

test('no Skip on a request: feed and full-screen have no reject path', () => {
  const feed = readFileSync(join(projectRoot, 'components/driver-request-feed.tsx'), 'utf8');
  const full = readFileSync(join(projectRoot, 'app/driver/incoming-request.tsx'), 'utf8');
  assert.ok(!/>Skip</.test(feed));
  assert.ok(!/rejectRide/.test(feed));
  assert.ok(!/rejectRide|Decline ride/.test(full));
  assert.ok(/dismissBid\(offer\.rideId\)/.test(feed), 'the ✕ that clears a resolved bid stays');
  assert.ok(/<TripDetailsChips details=\{offer\.tripDetails\} compact noteOnOwnLine/.test(feed));
});

const RIDE = (status, over = {}) => ({ rideId: 'r1', status, itinerary: 'A|B', offerNgn: 3000, ...over });

test('rider: offer / scheduled_started open the offers screen with the ride\'s params', () => {
  for (const type of ['ride:offer', 'ride:scheduled_started']) {
    assert.equal(riderPushTarget(type, 'r1', { ride: RIDE('bidding'), pathname: '/rider/wallet' }), '/matching?itinerary=A%7CB&offer=3000');
  }
  assert.equal(riderPushTarget('ride:offer', 'r1', { ride: RIDE('bidding', { offerNgn: undefined }), pathname: '/rider' }), '/matching?itinerary=A%7CB');
});
test('rider: already on /matching for that ride: stay', () => {
  assert.equal(riderPushTarget('ride:offer', 'r1', { ride: RIDE('bidding'), pathname: '/matching' }), 'stay');
  assert.equal(riderPushTarget('ride:bid_timeout', 'r1', { ride: RIDE('bidding'), pathname: '/matching' }), 'stay');
});
test('rider: booked goes to the trip, ended goes Home', () => {
  assert.equal(riderPushTarget('ride:offer', 'r1', { ride: RIDE('matched'), pathname: '/rider' }), '/rider/active-trip');
  assert.equal(riderPushTarget('ride:offer', 'r1', { ride: RIDE('cancelled'), pathname: '/rider' }), '/rider');
  assert.equal(riderPushTarget('ride:offer', 'r1', { ride: RIDE('completed'), pathname: '/rider' }), '/rider');
  assert.equal(riderPushTarget('ride:offer', 'r1', { ride: RIDE('active'), pathname: '/rider/active-trip' }), 'stay');
});
test('rider: bid_timeout -> matching if still searching, else Home', () => {
  assert.equal(riderPushTarget('ride:bid_timeout', 'r1', { ride: RIDE('bidding'), pathname: '/rider' }).startsWith('/matching'), true);
  assert.equal(riderPushTarget('ride:bid_timeout', 'r1', { ride: RIDE('matched'), pathname: '/rider' }), '/rider');
  assert.equal(riderPushTarget('ride:bid_timeout', 'r1', { ride: RIDE('cancelled'), pathname: '/rider' }), '/rider');
});
test('rider: driver_arrived / driver_cancelled -> trip if on, else Home', () => {
  for (const type of ['ride:driver_arrived', 'ride:driver_cancelled']) {
    assert.equal(riderPushTarget(type, 'r1', { ride: RIDE('matched'), pathname: '/rider' }), '/rider/active-trip');
    assert.equal(riderPushTarget(type, 'r1', { ride: RIDE('active'), pathname: '/matching' }), '/rider/active-trip');
    assert.equal(riderPushTarget(type, 'r1', { ride: RIDE('bidding'), pathname: '/rider' }), '/rider');
  }
});
test('rider: no ride loaded waits; another ride live goes Home; an ended other ride waits', () => {
  assert.equal(riderPushTarget('ride:offer', 'r1', { ride: null, pathname: '/rider' }), 'wait');
  assert.equal(riderPushTarget('ride:offer', 'r1', { ride: RIDE('bidding', { rideId: 'other' }), pathname: '/rider' }), '/rider');
  assert.equal(riderPushTarget('ride:offer', 'r1', { ride: RIDE('completed', { rideId: 'other' }), pathname: '/rider' }), 'wait');
  assert.equal(riderPushTarget('ride:offer', undefined, { ride: RIDE('bidding'), pathname: '/rider' }).startsWith('/matching'), true);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
test('rider push: waits for the ride to load, then opens offers; never drops the tap', async () => {
  resetPushRoutingForTests(); releasePushHold(); reopenedRideIds.clear();
  Object.assign(riderPushWait, { totalMs: 600, everyMs: 20 });
  let ride = null;
  setRiderPushProbe(() => ({ ride, pathname: '/rider/wallet' }));
  const log = [];
  handleTapResponse(tap('w1', { type: 'ride:offer', rideId: 'r1' }, Date.now()), { ...deps(log), isDriverApp: false });
  await sleep(80);
  assert.deepEqual(log, []);
  ride = RIDE('bidding');
  await sleep(80);
  assert.deepEqual(log, ['/matching?itinerary=A%7CB&offer=3000']);
  assert.ok(reopenedRideIds.has('r1'));
  // never loads: falls back to Home after the wait
  ride = null;
  handleTapResponse(tap('w2', { type: 'ride:offer', rideId: 'r1' }, Date.now()), { ...deps(log), isDriverApp: false });
  await sleep(700);
  assert.equal(log.at(-1), '/rider');
  setRiderPushProbe(null);
});
test('rider push: a cold-start tap is parked and the splash gets the offers screen', async () => {
  resetPushRoutingForTests(); reopenedRideIds.clear();
  Object.assign(riderPushWait, { totalMs: 600, everyMs: 20 });
  setRiderPushProbe(() => ({ ride: RIDE('bidding'), pathname: '/' }));
  const log = [];
  handleTapResponse(tap('c1', { type: 'ride:offer', rideId: 'r1' }, Date.now()), { ...deps(log), isDriverApp: false }, { launch: true });
  await sleep(40);
  assert.deepEqual(log, []);
  assert.equal(releasePushHold(), '/matching?itinerary=A%7CB&offer=3000');
  setRiderPushProbe(null);
});
test('rider push: already on matching: nothing navigated; no probe: Home as before', async () => {
  resetPushRoutingForTests(); releasePushHold();
  setRiderPushProbe(() => ({ ride: RIDE('bidding'), pathname: '/matching' }));
  const log = [];
  handleTapResponse(tap('s1', { type: 'ride:offer', rideId: 'r1' }, Date.now()), { ...deps(log), isDriverApp: false });
  await sleep(40);
  assert.deepEqual(log, []);
  setRiderPushProbe(null);
  handleTapResponse(tap('s2', { type: 'ride:offer', rideId: 'r1' }, Date.now()), { ...deps(log), isDriverApp: false });
  await sleep(20);
  assert.deepEqual(log, ['/rider']);
});

test('rider push: goes through the probe\'s go (pop back to the screen already in the stack), not a second push', async () => {
  resetPushRoutingForTests(); releasePushHold(); reopenedRideIds.clear();
  const went = [];
  setRiderPushProbe(() => ({ ride: RIDE('bidding'), pathname: '/rider-cancel', go: (h) => went.push(h) }));
  const log = [];
  handleTapResponse(tap('g1', { type: 'ride:offer', rideId: 'r1' }, Date.now()), { ...deps(log), isDriverApp: false });
  await sleep(30);
  assert.deepEqual(went, ['/matching?itinerary=A%7CB&offer=3000']);
  assert.deepEqual(log, []);
  setRiderPushProbe(() => ({ ride: RIDE('active'), pathname: '/rider-chat', go: (h) => went.push(h) }));
  handleTapResponse(tap('g2', { type: 'ride:driver_arrived', rideId: 'r1' }, Date.now()), { ...deps(log), isDriverApp: false });
  await sleep(30);
  assert.equal(went.at(-1), '/rider/active-trip');
  setRiderPushProbe(null);
});

test('rider push: a parked tap does not mark the ride reopened until the splash takes it', async () => {
  resetPushRoutingForTests(); reopenedRideIds.clear();
  setRiderPushProbe(() => ({ ride: RIDE('bidding'), pathname: '/' }));
  const log = [];
  handleTapResponse(tap('k1', { type: 'ride:offer', rideId: 'r1' }, Date.now()), { ...deps(log), isDriverApp: false }, { launch: true });
  await sleep(30);
  assert.equal(reopenedRideIds.has('r1'), false);
  const parked = releasePushHold();
  // dropped (splash went to /legal): still not marked
  assert.equal(reopenedRideIds.has('r1'), false);
  notePushOpened(parked);
  assert.equal(reopenedRideIds.has('r1'), true);
  setRiderPushProbe(null);
});

test('rider push: the wait stops when the probe is cleared or the rider signs out', async () => {
  resetPushRoutingForTests(); releasePushHold(); reopenedRideIds.clear();
  Object.assign(riderPushWait, { totalMs: 600, everyMs: 20 });
  const log = [];
  let ride = null;
  setRiderPushProbe(() => ({ ride, pathname: '/rider' }));
  handleTapResponse(tap('x1', { type: 'ride:offer', rideId: 'r1' }, Date.now()), { ...deps(log), isDriverApp: false });
  await sleep(50);
  setRiderPushProbe(null);
  ride = RIDE('bidding');
  await sleep(700);
  assert.deepEqual(log, []);
  let signedIn = true;
  setRiderPushProbe(() => ({ ride, pathname: '/rider', signedIn }));
  ride = null;
  handleTapResponse(tap('x2', { type: 'ride:offer', rideId: 'r1' }, Date.now()), { ...deps(log), isDriverApp: false });
  await sleep(50);
  signedIn = false;
  ride = RIDE('bidding');
  await sleep(100);
  assert.deepEqual(log, []);
  setRiderPushProbe(null);
});

test('stack action: pop back (params kept), push when absent, never replace', () => {
  const M = '/matching?itinerary=A&offer=3000';
  assert.deepEqual(stackActionFor(['rider', 'matching', 'rider-cancel'], M), { kind: 'pop', count: 1 });
  assert.deepEqual(stackActionFor(['rider', 'matching', 'rider-add-money', 'x'], M), { kind: 'pop', count: 2 });
  assert.deepEqual(stackActionFor(['rider', 'matching'], M), { kind: 'none' });
  assert.deepEqual(stackActionFor(['rider'], M), { kind: 'push' });
  assert.deepEqual(stackActionFor(['index', 'rider'], M), { kind: 'push' });
  assert.deepEqual(stackActionFor(['rider', 'rider-chat'], '/rider/active-trip'), { kind: 'pop', count: 1, thenNavigate: true });
  assert.deepEqual(stackActionFor(['rider'], '/rider/active-trip'), { kind: 'push' });
  assert.deepEqual(stackActionFor(['rider', 'matching'], '/rider/active-trip'), { kind: 'pop', count: 1, thenNavigate: true });
  assert.deepEqual(stackActionFor(['splash'], '/rider/active-trip'), { kind: 'push' });
});
test('stack names: found at the root or nested', () => {
  assert.deepEqual(stackNamesFrom({ routes: [{ name: 'rider' }, { name: 'matching' }], index: 1 }), ['rider', 'matching']);
  assert.deepEqual(stackNamesFrom({ routes: [{ name: '__root', state: { routes: [{ name: 'rider' }, { name: 'rider-cancel' }], index: 1 } }], index: 0 }), ['rider', 'rider-cancel']);
  assert.deepEqual(stackNamesFrom(undefined), []);
});
test('rider target: payment screens and another live ride\'s screen: stay', () => {
  for (const pathname of ['/rider-add-money', '/rider-withdraw', '/wallet/fund']) {
    assert.equal(riderPushTarget('ride:offer', 'r1', { ride: RIDE('bidding'), pathname }), 'stay', pathname);
    assert.equal(riderPushTarget('ride:offer', 'r1', { ride: null, pathname }), 'stay', pathname);
  }
  assert.equal(riderPushTarget('ride:offer', 'r1', { ride: RIDE('bidding', { rideId: 'o' }), pathname: '/matching' }), 'stay');
  assert.equal(riderPushTarget('ride:offer', 'r1', { ride: RIDE('active', { rideId: 'o' }), pathname: '/rider/active-trip' }), 'stay');
  assert.equal(riderPushTarget('ride:offer', 'r1', { ride: RIDE('bidding', { rideId: 'o' }), pathname: '/rider/wallet' }), '/rider');
});
test('rider push: Home fallback is plain navigate, never go', async () => {
  resetPushRoutingForTests(); releasePushHold();
  const went = [], log = [];
  setRiderPushProbe(() => ({ ride: RIDE('completed'), pathname: '/rider/wallet', go: (h) => went.push(h) }));
  handleTapResponse(tap('h1', { type: 'ride:offer', rideId: 'r1' }, Date.now()), { ...deps(log), isDriverApp: false });
  await sleep(30);
  assert.deepEqual(went, []);
  assert.deepEqual(log, ['/rider']);
  setRiderPushProbe(null);
});

test('stack action: only /rider and /rider/... are the rider route; riderOnTop gates the tab jump', () => {
  assert.deepEqual(stackActionFor(['rider', 'x'], '/rider-chat'), { kind: 'push' });
  assert.deepEqual(stackActionFor(['rider', 'x'], '/rider-cancel'), { kind: 'push' });
  assert.deepEqual(stackActionFor(['rider', 'x'], '/rider'), { kind: 'pop', count: 1 });
  assert.equal(riderOnTop(['rider']), true);
  assert.equal(riderOnTop(['rider', 'rider-chat']), false);
  assert.equal(riderOnTop([]), false);
});
