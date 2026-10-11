/**
 * The words on the rider's Trips, receipt and schedule screens: "Tomorrow,
 * 7:30 am", "8 Oct, 9:05 pm", "15.5 km · 26 min", and which pickup times a
 * rider may choose (at least 15 minutes away, on the half hour).
 *
 *   node --test __tests__/trip-words.test.mjs
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
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-trip-words-')), 'bundle.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/trip-words.ts'), '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const w = createRequire(import.meta.url)(outFile);

// Sunday 11 October 2026, 2:05 pm, in whatever zone the test runs in.
const now = new Date(2026, 9, 11, 14, 5, 0, 0);
const at = (day, hour, minute = 0) => new Date(2026, 9, day, hour, minute);

test('a time and a day in words', () => {
  assert.equal(w.timeWords(at(11, 7, 30)), '7:30 am');
  assert.equal(w.timeWords(at(11, 0, 5)), '12:05 am');
  assert.equal(w.timeWords(at(11, 12, 0)), '12:00 pm');
  assert.equal(w.timeWords(at(11, 23, 59)), '11:59 pm');
  assert.equal(w.minutesWords(450), '7:30 am');
  assert.equal(w.dayWords(at(11, 23), now), 'Today');
  assert.equal(w.dayWords(at(12, 0, 1), now), 'Tomorrow');
  assert.equal(w.dayWords(at(10, 23, 59), now), 'Yesterday');
  assert.equal(w.dayWords(at(13, 9), now), 'Tuesday 13 Oct');
  assert.equal(w.pickupWords(at(12, 7, 30), now), 'Tomorrow, 7:30 am');
  assert.equal(w.pickupWords(at(14, 18), now), 'Wednesday 14 Oct, 6:00 pm');
});

test('a past ride and the top of a receipt', () => {
  assert.equal(w.pastWords(at(11, 9, 5), now), 'Today, 9:05 am');
  assert.equal(w.pastWords(at(10, 18, 40), now), 'Yesterday, 6:40 pm');
  assert.equal(w.pastWords(at(8, 21, 5), now), '8 Oct, 9:05 pm');
  assert.equal(w.pastWords(new Date(2025, 11, 31, 8, 0), now), '31 Dec 2025, 8:00 am');
  assert.equal(w.receiptDateWords(at(10, 18, 40)), 'Saturday 10 October 2026 · 6:40 pm');
  assert.equal(w.parseDate(null), null);
  assert.equal(w.parseDate('not a date'), null);
  assert.equal(w.parseDate('2026-10-10T17:40:00.000Z').getTime(), Date.UTC(2026, 9, 10, 17, 40));
});

test('seven days to choose from, today first', () => {
  const days = w.scheduleDays(now);
  assert.equal(days.length, 7);
  assert.deepEqual(days.map((d) => d.top), ['Today', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
  assert.deepEqual(days.map((d) => d.num), [11, 12, 13, 14, 15, 16, 17]);
  assert.equal(days[0].start.getHours(), 0);
  // The month turns over.
  assert.deepEqual(w.scheduleDays(new Date(2026, 9, 29, 10)).map((d) => d.num), [29, 30, 31, 1, 2, 3, 4]);
});

test('a pickup must be at least 15 minutes away', () => {
  assert.equal(w.isPickupAllowed(at(11, 14, 20), now), true);
  assert.equal(w.isPickupAllowed(at(11, 14, 19), now), false);
  assert.equal(w.isPickupAllowed(at(11, 9), now), false);
  assert.equal(w.pickupAt(at(12, 0), 450).getTime(), at(12, 7, 30).getTime());
});

test('half-hour choices start at the next one far enough away', () => {
  const today = w.scheduleDays(now)[0].start;
  // 2:05 pm: 2:30 pm is 25 minutes away.
  assert.deepEqual(w.halfHourSlots(today, now).map(w.minutesWords), ['2:30 pm', '3:00 pm', '3:30 pm', '4:00 pm', '4:30 pm', '5:00 pm', '5:30 pm', '6:00 pm']);
  // 2:15 pm exactly: 2:30 pm is exactly 15 minutes away, still allowed.
  assert.equal(w.minutesWords(w.halfHourSlots(today, at(11, 14, 15))[0]), '2:30 pm');
  // 2:15 and a second: 2:30 pm is now too close.
  assert.equal(w.minutesWords(w.halfHourSlots(today, new Date(2026, 9, 11, 14, 15, 1))[0]), '3:00 pm');
  // 2:20 pm: 2:30 pm is too close.
  assert.equal(w.minutesWords(w.halfHourSlots(today, at(11, 14, 20))[0]), '3:00 pm');
  // Late evening: only what is left of the day.
  assert.deepEqual(w.halfHourSlots(today, at(11, 22, 40)).map(w.minutesWords), ['11:00 pm', '11:30 pm']);
  assert.deepEqual(w.halfHourSlots(today, at(11, 23, 20)), []);
  // A later day starts in the morning.
  const tomorrow = w.scheduleDays(now)[1].start;
  assert.deepEqual(w.halfHourSlots(tomorrow, now).map(w.minutesWords), ['6:00 am', '6:30 am', '7:00 am', '7:30 am', '8:00 am', '8:30 am', '9:00 am', '9:30 am']);
  for (const m of w.halfHourSlots(today, now)) assert.equal(w.isPickupAllowed(w.pickupAt(today, m), now), true);
});

test('a day with no time left cannot be chosen', () => {
  const today = w.scheduleDays(now)[0].start;
  assert.equal(w.dayHasTime(today, now), true);
  assert.equal(w.dayHasTime(today, at(11, 23, 44)), true);
  assert.equal(w.dayHasTime(today, at(11, 23, 45)), false);
});

test('a trip in words', () => {
  assert.equal(w.shortPlace('Yaba, Lagos, Nigeria'), 'Yaba');
  assert.equal(w.shortPlace('  Lekki Phase 1 '), 'Lekki Phase 1');
  assert.equal(w.shortPlace(null), '');
  assert.equal(w.routeWords('Yaba, Lagos', 'Victoria Island, Lagos'), 'Yaba to Victoria Island');
  assert.equal(w.tripLengthWords(15.53, 1560), '15.5 km · 26 min');
  assert.equal(w.tripLengthWords(15.5, null), '15.5 km');
  assert.equal(w.tripLengthWords(null, 3900), '1 hr 5 min');
  assert.equal(w.tripLengthWords(0, 0), null);
  assert.equal(w.durationWords(7200), '2 hr');
  assert.equal(w.durationWords(20), '1 min');
});

test('why a ride was cancelled, never as a raw code', () => {
  assert.equal(w.cancelWords('driver_cancelled'), 'Driver cancelled');
  assert.equal(w.cancelWords('rider_cancelled'), 'You cancelled');
  assert.equal(w.cancelWords('some_new_code'), 'Cancelled');
  assert.equal(w.cancelWords('NO_SHOW'), 'Cancelled');
  assert.equal(w.cancelWords(''), 'Cancelled');
  assert.equal(w.cancelWords(null), 'Cancelled');
  assert.equal(w.cancelWords('Changed my plans'), 'Changed my plans');
});
