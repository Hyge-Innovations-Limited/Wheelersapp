/**
 * Withdraw: the popular banks first, then every bank A–Z under its letter; search finds every match;
 * every logo file is in the map and every map entry has a file.
 *
 *   node --test __tests__/bank-list.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-bank-list-')), 'bundle.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/bank-list.ts'), '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const { bankSections, searchBanks, bankInitials, POPULAR_BANK_CODES } = createRequire(import.meta.url)(outFile);

const list = [
  { code: '058', name: 'Guaranty Trust Bank' }, { code: '044', name: 'Access Bank' }, { code: '999992', name: 'OPay Digital Services Limited (OPay)' },
  { code: '50515', name: 'Moniepoint MFB' }, { code: '090', name: '9 Payment Service Bank' }, { code: '232', name: 'Sterling Bank' },
  { code: '12345', name: 'access microfinance' },
];

test('popular first, then A–Z under letters, digits under #', () => {
  const sections = bankSections(list);
  assert.deepEqual(sections.map((s) => s.title), ['Popular', '#', 'A', 'G', 'M', 'O', 'S']);
  assert.deepEqual(sections[0].data.map((b) => b.code), ['999992', '50515', '058', '044']);
  assert.deepEqual(sections[2].data.map((b) => b.name), ['Access Bank', 'access microfinance']);
  assert.equal(sections.slice(1).reduce((n, s) => n + s.data.length, 0), list.length, 'every bank under its letter');
  assert.equal(POPULAR_BANK_CODES[0], '999992');
});

test('search: every match, names starting with it first', () => {
  assert.deepEqual(searchBanks(list, 'acc').map((b) => b.code), ['044', '12345']);
  assert.deepEqual(searchBanks(list, 'bank').map((b) => b.code), ['090', '044', '058', '232']);
  assert.deepEqual(searchBanks(list, 'zzz'), []);
});

test('initials for a bank with no logo', () => {
  assert.equal(bankInitials('OPay Digital Services Limited (OPay)'), 'OD');
  assert.equal(bankInitials('Guaranty Trust Bank'), 'GT');
  assert.equal(bankInitials('Kuda Bank'), 'KU');
});

test('the logo map and assets/banks/ match, file for file', () => {
  const files = readdirSync(join(projectRoot, 'assets/banks')).filter((f) => f.endsWith('.png')).map((f) => f.replace(/\.png$/, '')).sort();
  const map = readFileSync(join(projectRoot, 'lib/bank-logos.ts'), 'utf8');
  const listed = [...map.matchAll(/"([^"]+)": require\("\.\.\/assets\/banks\/([^"]+)\.png"\)/g)].map((m) => { assert.equal(m[1], m[2]); return m[1]; }).sort();
  assert.deepEqual(listed, files);
  assert.ok(files.includes('058') && files.includes('50515'));
});

test('the Withdraw screen loads the whole list once and shows each bank\'s mark', () => {
  const screen = readFileSync(join(projectRoot, 'app/rider-withdraw.tsx'), 'utf8');
  assert.match(screen, /limit: 1000/);
  assert.doesNotMatch(screen, /limit: normalizedQuery \? 100 : 40/);
  assert.match(screen, /<BankMark code=\{bank\.code\} name=\{bank\.name\} \/>/);
  assert.match(screen, /<BankMark code=\{selectedWithdrawBank\.code\} name=\{selectedWithdrawBank\.name\} \/>/);
});
