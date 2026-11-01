/**
 * The trip recording's upload queue: each finished 5-minute segment waits
 * here (kept on the phone, so a restart or no signal loses nothing) until it
 * is uploaded and the server has it. Then the local file is deleted.
 *
 * Retries back off from 1 minute to 1 hour, on any network. A segment still
 * here after 30 days is deleted unsent (the server would refuse it anyway).
 * The logic is pure; the screen-less runner passes in the effects.
 */

export type QueuedSegment = {
  rideId: string;
  segmentIndex: number;
  uri: string;
  durationSec: number;
  createdAt: number;
  attempts: number;
  nextAt: number;
};

export const RECORDING_KEEP_MS = 30 * 24 * 60 * 60 * 1000;
const FIRST_RETRY_MS = 60_000;
const LAST_RETRY_MS = 60 * 60_000;

/** 1 min, 2, 4 … capped at 1 hour. */
export function nextRetryMs(attempts: number): number {
  return Math.min(LAST_RETRY_MS, FIRST_RETRY_MS * 2 ** Math.max(0, attempts - 1));
}

export function enqueueSegment(queue: QueuedSegment[], segment: Omit<QueuedSegment, 'attempts' | 'nextAt'>, now: number): QueuedSegment[] {
  if (queue.some((item) => item.rideId === segment.rideId && item.segmentIndex === segment.segmentIndex)) return queue;
  return [...queue, { ...segment, attempts: 0, nextAt: now }];
}

/** Segments due now, oldest first; and those too old to keep. */
export function planQueue(queue: QueuedSegment[], now: number): { due: QueuedSegment[]; expired: QueuedSegment[]; keep: QueuedSegment[] } {
  const expired = queue.filter((item) => now - item.createdAt > RECORDING_KEEP_MS);
  const keep = queue.filter((item) => now - item.createdAt <= RECORDING_KEEP_MS);
  const due = keep.filter((item) => item.nextAt <= now).sort((a, b) => a.createdAt - b.createdAt || a.segmentIndex - b.segmentIndex);
  return { due, expired, keep };
}

export function afterFailure(queue: QueuedSegment[], failed: QueuedSegment, now: number): QueuedSegment[] {
  return queue.map((item) =>
    item.rideId === failed.rideId && item.segmentIndex === failed.segmentIndex
      ? { ...item, attempts: item.attempts + 1, nextAt: now + nextRetryMs(item.attempts + 1) }
      : item,
  );
}

export function afterSuccess(queue: QueuedSegment[], done: QueuedSegment): QueuedSegment[] {
  return queue.filter((item) => !(item.rideId === done.rideId && item.segmentIndex === done.segmentIndex));
}

/** A refusal the server will repeat forever (not mine, too old, too big, recording off): drop it. */
export function isPermanentFailure(status: number | null | undefined): boolean {
  return status === 403 || status === 404 || status === 409 || status === 413;
}

export type UploadEffects = {
  load(): Promise<QueuedSegment[]>;
  save(queue: QueuedSegment[]): Promise<void>;
  fileSize(uri: string): Promise<number | null>;
  deleteFile(uri: string): Promise<void>;
  /** The signed PUT for this segment; throws { status } on a refusal. */
  uploadUrl(rideId: string, segmentIndex: number, bytes: number): Promise<string>;
  put(url: string, uri: string): Promise<void>;
  /** Tells the server the file arrived; throws { status } on a refusal. */
  complete(rideId: string, segmentIndex: number, durationSec: number): Promise<void>;
  now(): number;
};

const statusOf = (error: unknown): number | null =>
  error && typeof error === 'object' && typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : null;

/** Uploads everything due, one at a time. Returns how many reached the server. */
export async function drainUploads(effects: UploadEffects): Promise<number> {
  let queue = await effects.load();
  const { due, expired, keep } = planQueue(queue, effects.now());
  for (const item of expired) await effects.deleteFile(item.uri).catch(() => undefined);
  queue = keep;
  let uploaded = 0;
  for (const item of due) {
    try {
      const bytes = await effects.fileSize(item.uri);
      if (!bytes) {
        // The file is gone (cleared storage): nothing to send.
        queue = afterSuccess(queue, item);
        continue;
      }
      const url = await effects.uploadUrl(item.rideId, item.segmentIndex, bytes);
      await effects.put(url, item.uri);
      await effects.complete(item.rideId, item.segmentIndex, item.durationSec);
      await effects.deleteFile(item.uri).catch(() => undefined);
      queue = afterSuccess(queue, item);
      uploaded += 1;
    } catch (error) {
      if (isPermanentFailure(statusOf(error))) {
        await effects.deleteFile(item.uri).catch(() => undefined);
        queue = afterSuccess(queue, item);
      } else {
        queue = afterFailure(queue, item, effects.now());
      }
    }
  }
  await effects.save(queue);
  return uploaded;
}
