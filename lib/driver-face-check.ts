/**
 * The driver's face check before every ride (server: face/face-check.ts). Booked: ride:matched carries faceCheck;
 * the scan screen takes three photos (look straight, turn the way it says, straight again) and sends them.
 * Passed: the trip goes on. Not the driver after 3 tries, or no scan in time: the ride goes to another driver.
 */
export type FaceTurn = 'left' | 'right';

export type DriverFaceCheck = {
  checkId: string;
  challenge: FaceTurn;
  /** When the scan must be in (ISO). */
  deadlineAt: string;
  triesLeft: number;
  /** shadow: checked and recorded only, the trip goes on whatever the answer. */
  mode: 'on' | 'shadow';
};

export type FaceScanAnswer =
  | { status: 'passed' }
  | { status: 'retry'; reason: string; challenge: FaceTurn; triesLeft: number }
  | { status: 'failed' | 'expired' | 'error' | 'none'; reason?: string };

export function parseFaceCheck(value: unknown): DriverFaceCheck | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  if (typeof v.checkId !== 'string' || typeof v.deadlineAt !== 'string') return undefined;
  return {
    checkId: v.checkId,
    challenge: v.challenge === 'right' ? 'right' : 'left',
    deadlineAt: v.deadlineAt,
    triesLeft: typeof v.triesLeft === 'number' ? v.triesLeft : 3,
    mode: v.mode === 'shadow' ? 'shadow' : 'on',
  };
}

export function parseFaceScanAnswer(value: unknown): FaceScanAnswer {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  if (v.status === 'passed') return { status: 'passed' };
  if (v.status === 'retry') {
    return {
      status: 'retry',
      reason: typeof v.reason === 'string' ? v.reason : 'Try again.',
      challenge: v.challenge === 'right' ? 'right' : 'left',
      triesLeft: typeof v.triesLeft === 'number' ? v.triesLeft : 1,
    };
  }
  const status = v.status === 'failed' || v.status === 'expired' || v.status === 'error' ? v.status : 'none';
  return { status, ...(typeof v.reason === 'string' ? { reason: v.reason } : {}) };
}

/** The three steps of one scan, in order: what the screen says, and the photo taken at its end. */
export type ScanStep = 'straight' | 'turn' | 'again';
export const SCAN_STEPS: ScanStep[] = ['straight', 'turn', 'again'];

export function stepWords(step: ScanStep, turn: FaceTurn): string {
  if (step === 'turn') return turn === 'left' ? 'Turn your head left' : 'Turn your head right';
  return step === 'straight' ? 'Look at the camera' : 'Look at the camera again';
}

/** Seconds left to scan, never below 0. */
export function secondsLeft(deadlineAt: string, now: number = Date.now()): number {
  const at = Date.parse(deadlineAt);
  return Number.isFinite(at) ? Math.max(0, Math.ceil((at - now) / 1000)) : 0;
}

/** The scan screen is due for this ride: a check still to pass (shadow too, so it is seen working). */
export function faceScanDue(ride: { faceCheck?: DriverFaceCheck; group?: unknown } | null | undefined): boolean {
  return Boolean(ride?.faceCheck && !ride.group);
}

/**
 * The camera's photo size for a scan: the smallest it offers with at least 700 pixels on the short side (a
 * 1280x720 photo), so three photos upload fast on mobile data and the server reads them quickly. Nothing suitable
 * (iPhone names like "Photo" only): undefined, the camera's own size.
 */
export function scanPictureSize(sizes: string[]): string | undefined {
  let best: { size: string; area: number } | undefined;
  for (const size of sizes) {
    const m = /^(\d+)x(\d+)$/.exec(size.trim());
    if (!m) continue;
    const w = Number(m[1]);
    const h = Number(m[2]);
    if (Math.min(w, h) < 700) continue;
    if (!best || w * h < best.area) best = { size, area: w * h };
  }
  return best?.size;
}

/** How long each step waits before its photo (the turn gets longer: people turn slowly). */
export function stepWaitMs(step: ScanStep): number {
  return step === 'turn' ? 2200 : 1500;
}
