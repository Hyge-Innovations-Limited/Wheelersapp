/**
 * The drivers' Feed and CNG Stations (Timi, 14 Nov 2026): the small rules the
 * screens share, and where a Feed push opens.
 *
 *   node --test __tests__/feed.test.mjs
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
  const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-feed-')), 'out.cjs');
  execFileSync('npx', ['esbuild', join(projectRoot, file), '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
  return req(outFile);
}

const F = build('lib/feed.ts');
const { routePush } = build('lib/push-routing.ts');

const post = (id, extra = {}) => ({ id, kind: 'driver', text: 't', photos: [], author: { name: 'Tunde A.', initials: 'TA', driverId: 'd1' }, mine: false, liked: false, likeCount: 0, status: 'live', rejectionReason: null, pinned: false, at: '2026-11-14T10:00:00Z', ...extra });

test('times read like X: now, minutes, hours, days, then the date', () => {
  const at = Date.parse('2026-11-14T10:00:00Z');
  const iso = (msAgo) => new Date(at - msAgo).toISOString();
  assert.equal(F.timeAgo(iso(20_000), at), 'now');
  assert.equal(F.timeAgo(iso(12 * 60_000), at), '12 min');
  assert.equal(F.timeAgo(iso(3 * 3600_000), at), '3 h');
  assert.equal(F.timeAgo(iso(2 * 86_400_000), at), '2 d');
  assert.match(F.timeAgo('2026-10-12T10:00:00Z', at), /^12 Oct$/);
  assert.equal(F.timeAgo(iso(-60_000), at), 'now', 'a phone clock behind the server never shows a negative time');
  assert.equal(F.timeAgo('garbage', at), '');
});

test('characters are counted as a person counts them', () => {
  assert.equal(F.charCount('🚗🚗'), 2);
  assert.equal(F.charCount('abc'), 3);
});

test('a next page never shows a post twice', () => {
  const shown = [post('a'), post('b')];
  assert.deepEqual(F.appendPage(shown, [post('b'), post('c')]).map((p) => p.id), ['a', 'b', 'c']);
});

test('a like shows at once, once; the server count wins after', () => {
  let posts = [post('a', { likeCount: 4 }), post('b')];
  posts = F.withLike(posts, 'a', true);
  assert.deepEqual([posts[0].liked, posts[0].likeCount], [true, 5]);
  posts = F.withLike(posts, 'a', true);
  assert.equal(posts[0].likeCount, 5, 'liking a liked post adds nothing');
  posts = F.withLikeCount(posts, 'a', true, 9);
  assert.equal(posts[0].likeCount, 9);
  posts = F.withLike([post('z', { liked: true, likeCount: 0 })], 'z', false);
  assert.equal(posts[0].likeCount, 0, 'never below zero');
  assert.equal(F.withLike([post('b')], 'a', true)[0].liked, false, 'other posts untouched');
});

test('stations: distance and time, or the area when the phone has no position; directions per phone', () => {
  assert.equal(F.stationDistance({ km: 1.24, minutes: 5, area: 'Ikeja' }), '1.2 km · 5 min');
  assert.equal(F.stationDistance({ km: 23.4, minutes: 70, area: 'Lekki' }), '23 km · 70 min');
  assert.equal(F.stationDistance({ km: null, minutes: null, area: 'Ikeja' }), 'Ikeja');
  const s = { lat: 6.62, lng: 3.35, name: 'Agidingbi CNG' };
  assert.match(F.directionsUrl(s, 'ios'), /^http:\/\/maps\.apple\.com\/\?daddr=6\.62,3\.35/);
  assert.match(F.directionsUrl(s, 'android'), /google\.com\/maps\/dir\/\?api=1&destination=6\.62,3\.35/);
});

test('photo heights stay sensible whatever the shape', () => {
  assert.equal(F.photoHeight({ width: 1280, height: 853 }, 300), 200);
  assert.equal(F.photoHeight({ width: 100, height: 1000 }, 300), 375, 'a very tall photo is cut at 1.25');
  assert.equal(F.photoHeight({ width: 1000, height: 100 }, 300), 150, 'a very wide one is kept at half');
  assert.equal(F.photoHeight({ width: 0, height: 0 }, 300), 180);
});

test('a Feed push (post live, or not approved) opens My posts in the driver app only', () => {
  const nav = [];
  const deps = { isDriverApp: true, navigate: (to) => nav.push(to), focusDriverOffer: () => {}, liveCallSupported: false };
  routePush({ type: 'feed_post_live' }, deps);
  routePush({ type: 'feed_post_rejected' }, deps);
  assert.deepEqual(nav, ['/driver/my-posts', '/driver/my-posts']);
});

test('the tab bar: Feed, Drive, Stations, Wallet, Me; Active, History, Quests, Interstate keep their screens off the bar', () => {
  const layout = readFileSync(join(projectRoot, 'app/driver/(tabs)/_layout.tsx'), 'utf8');
  const shown = [...layout.matchAll(/name="([a-z]+)"\s+options=\{\{\s+title: '([A-Za-z]+)'/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(shown, [['feed', 'Feed'], ['home', 'Drive'], ['stations', 'Stations'], ['wallet', 'Wallet'], ['settings', 'Me']]);
  for (const hidden of ['active', 'history', 'quests', 'interstate']) {
    assert.match(layout, new RegExp(`name="${hidden}" options=\\{\\{ href: null \\}\\}`));
  }
  const splash = readFileSync(join(projectRoot, 'app/splash.tsx'), 'utf8');
  assert.match(splash, /href === "\/driver\/\(tabs\)\/home" \? "\/driver\/\(tabs\)\/feed"/, 'the app opens on Feed');
});
