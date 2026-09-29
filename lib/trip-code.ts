/**
 * What the server said about a Start trip: started, or why not (no code, wrong
 * code, locked), or that support unlocked it. The trip code keypad listens;
 * the driver session reports. Errors about the code are shown in the keypad,
 * not as an alert over it.
 */

export type StartResult =
  | { kind: 'started'; rideId?: string }
  | { kind: 'refused'; code: string; message: string }
  | { kind: 'unlocked'; rideId: string };

type Listener = (result: StartResult) => void;
const listeners = new Set<Listener>();

export function emitStartResult(result: StartResult): void {
  listeners.forEach((listener) => listener(result));
}

export function onStartResult(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function isTripCodeError(code: unknown): code is string {
  return typeof code === 'string' && code.startsWith('TRIP_CODE_');
}
