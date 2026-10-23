/**
 * The driver selfie's face check, on the phone (modules/face-check: Google ML
 * Kit on Android, Apple's Vision on iPhone). While the camera is open the
 * screen sends a small still frame a few times a second; each one says where
 * the face is, how the head is turned and how open the eyes are, and
 * `readFrame` moves the prompts on only when the driver really does each one:
 *
 *   look straight   one face, inside the oval, close enough, facing forward
 *   close your eyes then open them      (a held close, not a blink: a few frames a second can miss a blink)
 *   turn to one side, then the other    (either side first)
 *
 * Then the shutter lights up, and only while they look straight with their
 * eyes open. Nothing leaves the phone.
 *
 * Builds made before the module existed, and phones where it fails, have no
 * check: the screen falls back to taking and reviewing the photo by hand, and
 * the photo is sent marked "unavailable".
 */
import { requireOptionalNativeModule } from "expo";

export type FaceBox = {
  /** Fractions of the upright photo, from its top left. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees: how far the head is turned to a side, and tilted. */
  yaw: number;
  roll: number;
  /** How open the eyes are, in the unit `eyesKind` says; null when it cannot tell. */
  eyes?: number | null;
};

export type FaceFrame = {
  width: number;
  height: number;
  /** "probability": 0 shut to 1 open (Android). "ratio": the eyes' height for their width (iPhone). */
  eyesKind: "probability" | "ratio";
  faces: FaceBox[];
};

/** What the selfie was sent with: the check passed, the driver went on without it, or this phone could not run it. */
export type SelfieCheck = "passed" | "skipped" | "unavailable";

type NativeFaceCheck = {
  detect(uri: string, deleteAfter: boolean): Promise<FaceFrame>;
};

let native: NativeFaceCheck | null | undefined;

/** The face check, when this build has it. Never throws: a build without it gets null. */
export function faceCheck(): NativeFaceCheck | null {
  if (native === undefined) {
    try {
      native = requireOptionalNativeModule<NativeFaceCheck>("WheelersFaceCheck");
    } catch {
      native = null;
    }
  }
  return native ?? null;
}

export type Prompt = "straight" | "close_eyes" | "open_eyes" | "turn_one" | "turn_other" | "ready";

export const PROMPTS: Record<Prompt, string> = {
  straight: "Look straight at the camera",
  close_eyes: "Close your eyes for a second",
  open_eyes: "Now open your eyes",
  turn_one: "Slowly turn your head to one side",
  turn_other: "Now turn to the other side",
  ready: "Look straight and take the photo",
};

/** The prompts that count as steps done, in order, for the ticks on screen. */
export const STEPS: { key: Prompt; label: string }[] = [
  { key: "straight", label: "Look straight" },
  { key: "close_eyes", label: "Eyes" },
  { key: "turn_one", label: "One side" },
  { key: "turn_other", label: "Other side" },
];

export type CheckState = {
  prompt: Prompt;
  /** Good frames in a row on the current prompt. */
  held: number;
  /** This driver's eyes when open, from the first prompt: shut is judged against it. */
  openEyes: number | null;
  /** The side turned first: +1 or -1. */
  firstSide: 1 | -1 | null;
};

export const START: CheckState = { prompt: "straight", held: 0, openEyes: null, firstSide: null };

/** Frames in a row a pose must hold: one stray frame does not count. */
const HOLD = 2;
const STRAIGHT_YAW = 12;
const TURN_YAW = 18;

/** What to tell the driver about where their face is; null when it is fine. */
function placement(face: FaceBox, strict: boolean): string | null {
  const cx = face.x + face.w / 2;
  const cy = face.y + face.h / 2;
  if (face.w < 0.2) return "Move a little closer";
  if (face.w > 0.85) return "Move back a little";
  if (strict && (Math.abs(cx - 0.5) > 0.22 || Math.abs(cy - 0.5) > 0.25)) return "Put your face in the oval";
  return null;
}

function shut(eyes: number, open: number, kind: FaceFrame["eyesKind"]): boolean {
  return kind === "probability" ? eyes < Math.min(0.35, open * 0.5) : eyes < open * 0.6;
}

// Judged against this driver's own open eyes: glasses or narrow eyes read low
// (0.3 to 0.6) and must still pass. Never above 0.6, never below the shut line.
function opened(eyes: number, open: number, kind: FaceFrame["eyesKind"]): boolean {
  return kind === "probability" ? eyes > Math.min(0.6, open * 0.8) : eyes > open * 0.8;
}

/**
 * One frame: the next state, a hint when something is off, and whether the
 * shutter may be pressed now (all prompts done, looking straight, eyes open).
 */
export function readFrame(state: CheckState, frame: FaceFrame): { state: CheckState; hint: string | null; canShoot: boolean } {
  const still = (hint: string | null) => ({ state: { ...state, held: 0 }, hint, canShoot: false });
  if (frame.faces.length === 0) return still("We can't see your face");
  if (frame.faces.length > 1) return still("Only your face, please");
  const face = frame.faces[0]!;
  const eyes = typeof face.eyes === "number" && Number.isFinite(face.eyes) ? face.eyes : null;
  const turning = state.prompt === "turn_one" || state.prompt === "turn_other";
  const where = placement(face, !turning);
  if (where) return still(where);

  const hold = (next: Partial<CheckState> & { prompt: Prompt }, frames = HOLD) =>
    state.held + 1 >= frames
      ? { state: { ...state, ...next, held: 0 }, hint: null, canShoot: false }
      : { state: { ...state, held: state.held + 1 }, hint: null, canShoot: false };

  switch (state.prompt) {
    case "straight": {
      if (Math.abs(face.yaw) > STRAIGHT_YAW) return still("Look straight at the camera");
      // No eyes to read (some faces, some light): the eye prompts are left out, not failed.
      if (eyes === null) return hold({ prompt: "turn_one" });
      return hold({ prompt: "close_eyes", openEyes: state.openEyes === null ? eyes : Math.max(state.openEyes, eyes) });
    }
    case "close_eyes":
      if (eyes === null || state.openEyes === null) return { state: { ...state, prompt: "turn_one", held: 0 }, hint: null, canShoot: false };
      // One shut frame is enough: shutting the eyes is deliberate, and a cheap phone may read only a frame or two a second.
      return shut(eyes, state.openEyes, frame.eyesKind) ? hold({ prompt: "open_eyes" }, 1) : still(null);
    case "open_eyes":
      if (eyes === null || state.openEyes === null) return { state: { ...state, prompt: "turn_one", held: 0 }, hint: null, canShoot: false };
      return opened(eyes, state.openEyes, frame.eyesKind) ? hold({ prompt: "turn_one" }) : still(null);
    case "turn_one":
      if (Math.abs(face.yaw) < TURN_YAW) return still(null);
      return hold({ prompt: "turn_other", firstSide: face.yaw > 0 ? 1 : -1 });
    case "turn_other":
      if (state.firstSide === null || face.yaw * state.firstSide > -TURN_YAW) return still(null);
      return hold({ prompt: "ready" });
    case "ready": {
      const looking = Math.abs(face.yaw) <= STRAIGHT_YAW;
      const eyesOk = eyes === null || state.openEyes === null || opened(eyes, state.openEyes, frame.eyesKind);
      return {
        state,
        hint: !looking ? "Look straight at the camera" : !eyesOk ? "Open your eyes" : null,
        canShoot: looking && eyesOk,
      };
    }
  }
}

/** How many of STEPS are done at this prompt, for the ticks. */
export function stepsDone(prompt: Prompt): number {
  return { straight: 0, close_eyes: 1, open_eyes: 1, turn_one: 2, turn_other: 3, ready: 4 }[prompt];
}
