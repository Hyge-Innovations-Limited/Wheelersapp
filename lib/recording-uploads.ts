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

/**
 * A refusal OUR server will repeat forever (not mine, recording off, already
 * recorded or not allowed, too big, not audio): drop it. 425 (not arrived
 * yet), 401 and 5xx are tried again. A refusal from the storage itself (the
 * signed PUT to Cloudflare) is never final: a bucket or key set up wrong is
 * put right on the server, and the piece then goes up (it stays until it
 * expires with the rest of the queue).
 */
export function isPermanentFailure(status: number | null | undefined): boolean {
  return status === 403 || status === 404 || status === 409 || status === 413 || status === 415;
}

export type UploadEffects = {
  load(): Promise<QueuedSegment[]>;
  /**
   * Writes the queue from the latest one on the phone: a piece finished while
   * this run was uploading must not be lost. One update at a time.
   */
  update(change: (latest: QueuedSegment[]) => QueuedSegment[]): Promise<void>;
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

const keyOf = (item: Pick<QueuedSegment, 'rideId' | 'segmentIndex'>) => `${item.rideId}:${item.segmentIndex}`;

/** Uploads everything due, one at a time. Returns how many reached the server. */
export async function drainUploads(effects: UploadEffects): Promise<number> {
  const { due, expired, keep } = planQueue(await effects.load(), effects.now());
  for (const item of expired) await effects.deleteFile(item.uri).catch(() => undefined);
  let queue = keep;
  let uploaded = 0;
  for (const item of due) {
    // Which side refused: only our server's refusals can drop a piece.
    let atStorage = false;
    try {
      const bytes = await effects.fileSize(item.uri);
      if (!bytes) {
        // The file is gone (cleared storage): nothing to send.
        queue = afterSuccess(queue, item);
        continue;
      }
      const url = await effects.uploadUrl(item.rideId, item.segmentIndex, bytes);
      atStorage = true;
      await effects.put(url, item.uri);
      atStorage = false;
      await effects.complete(item.rideId, item.segmentIndex, item.durationSec);
      await effects.deleteFile(item.uri).catch(() => undefined);
      queue = afterSuccess(queue, item);
      uploaded += 1;
    } catch (error) {
      if (!atStorage && isPermanentFailure(statusOf(error))) {
        await effects.deleteFile(item.uri).catch(() => undefined);
        queue = afterSuccess(queue, item);
      } else {
        queue = afterFailure(queue, item, effects.now());
      }
    }
  }
  // Only what this run handled changes; anything queued meanwhile stays.
  const handled = new Set([...expired, ...due].map(keyOf));
  const after = new Map(queue.map((item) => [keyOf(item), item]));
  await effects.update((latest) =>
    latest.flatMap((item) => {
      const key = keyOf(item);
      if (!handled.has(key)) return [item];
      const next = after.get(key);
      return next ? [next] : [];
    }),
  );
  return uploaded;
}
