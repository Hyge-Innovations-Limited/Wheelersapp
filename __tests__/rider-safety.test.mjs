/**
 * Rider safety in the app (Timi, 14 Nov 2026): what was checked about a driver
 * (✓ chips on each offer), "This trip is recorded" when the trip starts, and
 * the three tips before and after. The server decides; the app reads it.
 *
 *   node --test __tests__/rider-safety.test.mjs
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
const req = createRequire(import.meta.url);
function build(file) {
  const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-safety-')), 'out.cjs');
  execFileSync('npx', ['esbuild', join(projectRoot, file), '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
  return req(outFile);
}

const S = build('lib/rider-safety.ts');
const { mergeOffer } = build('lib/ride-offers.ts');
const { restoredRideFrom } = build('lib/rider-active-ride.ts');

test('checks: only kinds the app knows, each once, with a real date; anything else is dropped', () => {
  const checks = S.parseChecks([
    { kind: 'nin', at: '2026-10-20T09:00:00Z', until: null },
    { kind: 'licence', at: '2026-10-22T09:00:00Z', until: '2028-01-01T00:00:00Z' },
    { kind: 'licence', at: '2026-10-23T09:00:00Z', until: null },
    { kind: 'dna', at: '2026-10-22T09:00:00Z' },
    { kind: 'plate', at: 'not a date' },
    null, 'x',
  ]);
  assert.deepEqual(checks.map((c) => c.kind), ['nin', 'licence']);
  assert.deepEqual(S.parseChecks(undefined), []);
  assert.deepEqual(S.parseChecks({ kind: 'nin' }), []);
});

test('the date beside a check: its month; insurance: when it ends', () => {
  assert.equal(S.checkDate({ kind: 'licence', at: '2026-10-22T09:00:00Z', until: '2028-01-01T00:00:00Z' }), 'Oct 2026');
  assert.equal(S.checkDate({ kind: 'insurance', at: '2026-10-25T09:00:00Z', until: '2027-03-31T00:00:00Z' }), 'to Mar 2027');
  assert.equal(S.checkDate({ kind: 'insurance', at: '2026-10-25T09:00:00Z', until: null }), 'Oct 2026');
  assert.equal(S.CHECK_WORDS.nin.line, 'NIN verified');
});

test('a re-bid keeps the checks the card had when the new message has none', () => {
  const base = { driverId: 'd1', driverUserId: 'u1', counterOfferNgn: 4000, driverName: 'T', driverRating: 5, vehiclePlate: 'P', vehicleModel: 'M', etaSeconds: 60, receivedAt: '2026-11-14T10:00:00Z' };
  const first = mergeOffer([], { ...base, checks: [{ kind: 'nin', at: '2026-10-20T09:00:00Z', until: null }] });
  const again = mergeOffer(first, { ...base, counterOfferNgn: 3800 });
  assert.equal(again[0].counterOfferNgn, 3800);
  assert.deepEqual(again[0].checks.map((c) => c.kind), ['nin']);
});

test('recorded and tips from the server; only real tips, three at most', () => {
  assert.deepEqual(S.safetyFields({ recorded: true, safety: { before: ['a', 'b', 'c', 'd'], after: ['x', '', 5] } }), { recorded: true, safety: { before: ['a', 'b', 'c'], after: ['x'] } });
  assert.deepEqual(S.safetyFields({}), {}, 'an older server: nothing');
  assert.deepEqual(S.safetyFields(null), {});
});

test('which sheet is due: "before" while the driver comes, "start" once it runs and is recorded; each once', () => {
  const seen = new Set();
  const has = (k) => seen.has(k);
  const tips = { before: ['a', 'b', 'c'], after: ['x', 'y', 'z'] };
  assert.equal(S.dueSafetyMoment({ rideId: 'r1', status: 'matched', safety: tips }, has), 'before');
  seen.add('before:r1');
  assert.equal(S.dueSafetyMoment({ rideId: 'r1', status: 'matched', safety: tips }, has), null, 'once');
  assert.equal(S.dueSafetyMoment({ rideId: 'r1', status: 'active', recorded: false, safety: tips }, has), null, 'not recorded: never claimed');
  assert.equal(S.dueSafetyMoment({ rideId: 'r1', status: 'active', recorded: true, safety: tips }, has), 'start');
  assert.equal(S.dueSafetyMoment({ rideId: 'r2', status: 'matched' }, has), null, 'no tips yet: wait');
  assert.equal(S.dueSafetyMoment(null, has), null);
});

test('a trip brought back from the server keeps whether it is recorded and its tips', () => {
  const ride = {
    id: 'r9', status: 'IN_PROGRESS', pickup: { address: 'Yaba' }, destination: { address: 'Lekki' }, stops: [], recorded: true,
    safety: { before: ['a', 'b', 'c'], after: ['x', 'y', 'z'] },
    driver: { id: 'd', userId: 'u', name: 'Tunde', rating: 4.9, vehiclePlate: 'LAG', vehicleMake: 'Toyota', vehicleModel: 'Camry' },
  };
  const restored = restoredRideFrom(ride);
  assert.equal(restored.recorded, true);
  assert.deepEqual(restored.safety.after, ['x', 'y', 'z']);
});

test('the screens: offer chips and their sheet; trip screen and rating screen sheets', () => {
  const card = readFileSync(join(projectRoot, 'components/rider/offer-card.tsx'), 'utf8');
  assert.match(card, /<CheckChips checks=\{checks\} \/>/);
  assert.match(card, /<ChecksSheet checks=\{checksOpen \? checks : null\}/);
  const trip = readFileSync(join(projectRoot, 'app/rider/active-trip.tsx'), 'utf8');
  assert.match(trip, /title=\{safetySheet === "start" \? "Trip started" : safetySheet === "before" \? "Before you get in" : null\}/);
  const rating = readFileSync(join(projectRoot, 'app/rider/trip-rating.tsx'), 'utf8');
  assert.match(rating, /title=\{afterOpen \? "Before you go" : null\}/);
});

test('security icons where the plan put them (shield = checked, lock = money/codes/PIN, mic = recording, W = by Wheelers)', () => {
  const read = (f) => readFileSync(join(projectRoot, f), 'utf8');
  const sheets = read('components/rider/safety-sheets.tsx');
  assert.match(sheets, /<View style=\{styles\.shield\}><ShieldIcon size=\{18\} \/><\/View>/, 'offer chips start with a shield');
  assert.match(sheets, /<WheelersMark size=\{28\} \/>\s*<RText[^>]*>Checked by Wheelers/, 'W beside Checked by Wheelers');
  assert.match(sheets, /<ShieldIcon size=\{22\} \/>\s*<RText[^>]*>\{title/, 'shield beside the tips title');
  assert.match(sheets, /<MicIcon size=\{16\} \/>/, 'mic on "recorded"');
  assert.match(read('app/rider/active-trip.tsx'), /<LockIcon[^>]*\/>\s*<RText[^>]*>\s*Your trip code/, 'lock on the trip code');
  assert.match(read('components/rider/pay-sheet.tsx'), /Secure payment/);
  assert.match(read('components/rider/security-pin.tsx'), /<LockIcon size=\{20\} \/>/);
  assert.match(read('components/TripCodeSheet.tsx'), /<LockIcon size=\{18\} \/>\s*<AppText variant="h2">Trip code/);
  assert.match(read('app/driver/active-trip.tsx'), /<MicIcon color=\{theme\.colors\.red\} size=\{13\} \/>/);
  assert.match(read('components/wallet-pin-sheet.tsx'), /<LockIcon size=\{18\} \/>/);
  assert.match(read('app/driver/withdraw.tsx'), /<LockIcon color=\{theme\.colors\.muted\} size=\{13\} \/>/);
  assert.match(read('lib/driver-papers.ts'), /approved: \{ word: "Approved", color: theme\.colors\.green, icon: "shield-checkmark" \}/);
  assert.match(read('app/driver/profile.tsx'), /<CheckChips checks=\{checks\} \/>/, 'the driver sees their own checks');
  assert.doesNotMatch(read('components/security-icons.tsx'), /#FF7700|colors\.orange/i, 'never orange');
});

// ── The playful tip cards (21 Nov 2026) ──
const CARD = (key, title) => ({ key, emoji: '🚘', kick: 'Plate check', title, line: 'A line.', tone: 'orange' });
const SERVER_CARDS = {
  byStage: { far: CARD('share', 'Let someone ride along'), close: CARD('plate', 'Plate or nothing'), here: CARD('name', 'Make them say it'), trip: CARD('belt', 'Click clack'), after: CARD('keys', 'Phone, wallet, keys'), bogus: CARD('x', 'X') },
  groups: [{ title: 'After the trip', cards: [CARD('keys', 'Phone, wallet, keys'), { key: 'broken' }] }],
};

test('cards: read from the server, anything broken dropped; none from an older server', () => {
  const cards = S.parseSafetyCards(SERVER_CARDS);
  assert.equal(cards.byStage.close.title, 'Plate or nothing');
  assert.equal(cards.byStage.bogus, undefined);
  assert.equal(cards.groups[0].cards.length, 1);
  assert.equal(S.parseSafetyCards(undefined), null);
  assert.equal(S.parseSafetyCards({ byStage: {} }), null);
  assert.equal(S.safetyFields({ safetyCards: SERVER_CARDS }).safetyCards.byStage.far.key, 'share');
});

test('cards: the stage follows the ride, as the server picks it', () => {
  const stage = (etaMinutes, extra = {}) => S.safetyStageFor({ status: 'matched', etaMinutes, ...extra });
  assert.deepEqual([stage(10), stage(6), stage(3), stage(1), stage(null)], ['far', 'wait', 'near', 'close', 'near']);
  assert.equal(stage(3, { arrived: true }), 'here');
  assert.equal(S.safetyStageFor({ status: 'active' }), 'trip');
  assert.equal(S.safetyStageFor({ status: 'completed' }), 'after');
});

test('cards: no "Before you get in" pop-up when the cards came (the tip is on the trip screen); the recorded one stays', () => {
  const seen = () => false;
  const ride = { rideId: 'r', status: 'matched', safety: { before: ['a'], after: [] }, safetyCards: S.parseSafetyCards(SERVER_CARDS) };
  assert.equal(S.dueSafetyMoment(ride, seen), null);
  assert.equal(S.dueSafetyMoment({ ...ride, safetyCards: null }, seen), 'before', 'an older server: the old sheet');
  assert.equal(S.dueSafetyMoment({ ...ride, status: 'active', recorded: true }, seen), 'start');
});
