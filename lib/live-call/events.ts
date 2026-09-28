/**
 * Call messages from the server reach the call screen through here. The
 * driver and rider sessions own the socket; they hand over anything that is
 * about a call (call:*, and errors answering a call:* request) and nothing else.
 */

type Listener = (type: string, payload: Record<string, unknown>) => void;
const listeners = new Set<Listener>();

export function isCallMessage(type: string, payload: Record<string, unknown>): boolean {
  if (type.startsWith('call:')) return true;
  return type === 'error' && typeof payload.requestType === 'string' && payload.requestType.startsWith('call:');
}

export function emitCallEvent(type: string, payload: Record<string, unknown>): void {
  listeners.forEach((listener) => {
    try {
      listener(type, payload);
    } catch {
      /* one broken listener must not stop the rest */
    }
  });
}

export function onCallEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/* A tapped "is calling" push: the call screen asks the server for the call on that trip. */
let pendingCurrent: string | null = null;
const currentListeners = new Set<(rideId: string) => void>();

export function requestCurrentCall(rideId: string): void {
  pendingCurrent = rideId;
  currentListeners.forEach((listener) => listener(rideId));
}

export function onCurrentCallRequest(listener: (rideId: string) => void): () => void {
  currentListeners.add(listener);
  if (pendingCurrent) listener(pendingCurrent);
  return () => { currentListeners.delete(listener); };
}

export function clearCurrentCallRequest(): void {
  pendingCurrent = null;
}
