/**
 * A driver's verification kept on the phone while it is being filled in: it
 * comes back for the same person, drops photos the phone has thrown away,
 * and never comes back for someone else or after three days.
 *
 *   node --test __tests__/driver-onboarding-draft.test.mjs
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
const outFile = join(mkdtempSync(join(tmpdir(), 'wheelers-draft-')), 'bundle.cjs');
execFileSync('npx', ['esbuild', join(projectRoot, 'lib/driver-onboarding-draft.ts'), '--bundle', '--platform=node', '--format=cjs', `--outfile=${outFile}`], { cwd: projectRoot, stdio: 'pipe' });
const { draftFrom, restoreDraft, draftHasProgress, firstUnfinishedStep } = createRequire(import.meta.url)(outFile);

const STEPS = ['licence', 'details', 'selfie', 'vehicle', 'phone', 'vehiclePhotos'];
const NOW = Date.UTC(2026, 9, 14, 12);
const empty = { legalDetails: null, phoneVerified: false, licenceUri: null, licenceType: 'image', selfieUri: null, selfieCheck: null, vehiclePhotos: [], vehicleInfo: null };
const halfway = {
  ...empty,
  licenceUri: 'file:///licence.pdf',
  licenceType: 'pdf',
  legalDetails: { legalName: 'Ada Obi' },
  selfieUri: 'file:///selfie.jpg',
  selfieCheck: 'passed',
  vehicleInfo: { make: 'Toyota', model: 'Corolla', plate: 'LAG123XY', year: 2015, phone: '08030000000' },
  vehiclePhotos: ['file:///car1.jpg', 'file:///car2.jpg'],
};
const allThere = () => true;

test('what was filled in comes back for the same person, and Continue goes to the first step still to do', () => {
  const back = restoreDraft(draftFrom(halfway, 'driver-1', NOW), 'driver-1', NOW + 3600_000, allThere);
  assert.deepEqual(back, halfway);
  assert.equal(firstUnfinishedStep(back, STEPS), 'phone', 'the code was not typed yet');
  assert.equal(firstUnfinishedStep({ ...back, phoneVerified: true }, STEPS), 'vehiclePhotos', 'two car photos are not seven');
  assert.equal(firstUnfinishedStep(empty, STEPS), 'licence');
  assert.equal(draftHasProgress(empty), false);
  assert.equal(draftHasProgress(halfway), true);
});

test('a photo the phone has thrown away is asked for again; the rest stays', () => {
  const gone = new Set(['file:///selfie.jpg', 'file:///car2.jpg']);
  const back = restoreDraft(draftFrom(halfway, 'driver-1', NOW), 'driver-1', NOW, (uri) => !gone.has(uri));
  assert.equal(back.selfieUri, null);
  assert.equal(back.selfieCheck, null, 'how a photo was taken goes with the photo');
  assert.deepEqual(back.vehiclePhotos, ['file:///car1.jpg']);
  assert.equal(back.licenceUri, 'file:///licence.pdf');
  assert.equal(back.legalDetails.legalName, 'Ada Obi');
  assert.equal(firstUnfinishedStep(back, STEPS), 'selfie');
});

test('it never comes back for someone else, after three days, or from something unreadable', () => {
  const kept = draftFrom(halfway, 'driver-1', NOW);
  assert.equal(restoreDraft(kept, 'driver-2', NOW, allThere), null, 'another person on the same phone starts clean');
  assert.equal(restoreDraft(kept, 'driver-1', NOW + 4 * 86400_000, allThere), null);
  assert.equal(restoreDraft('not json', 'driver-1', NOW, allThere), null);
  assert.equal(restoreDraft(null, 'driver-1', NOW, allThere), null);
  const broken = restoreDraft(JSON.stringify({ owner: 'driver-1', savedAt: NOW, legalDetails: { legalName: '' }, vehicleInfo: { make: 'Toyota' }, vehiclePhotos: 'x' }), 'driver-1', NOW, allThere);
  assert.deepEqual(broken, empty, 'half a record is no record');
});
