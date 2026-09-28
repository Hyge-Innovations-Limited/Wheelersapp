import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Vibration } from 'react-native';

import { LiveCallScreen } from '@/components/LiveCallScreen';
import { clearCurrentCallRequest, onCallEvent, onCurrentCallRequest } from '@/lib/live-call/events';
import { inCallManager, liveCallSupported, webrtc } from '@/lib/live-call/native';

/**
 * Live call on the phone: one call at a time, with this trip's rider or
 * driver, voice only. The server rings, answers and hangs up, and passes the
 * connection details between the two phones; the sound goes phone to phone
 * (or through our TURN server when the networks will not let it).
 *
 * Caller:  call:start → (they answer) call:accepted → offer → answer ← candidates ↔
 * Callee:  call:incoming → Answer → call:accept → offer ← → answer → candidates ↔
 *
 * This build rings while the app is open. A closed app gets a push saying who
 * is calling; tapping it opens the app on the call (requestCurrentCall).
 */

type Role = 'RIDER' | 'DRIVER';
type Phase = 'starting' | 'ringing' | 'connecting' | 'active' | 'ended';
type IceServer = { urls: string[] | string; username?: string; credential?: string };

export type LiveCallView = {
  callId: string | null;
  rideId: string;
  direction: 'incoming' | 'outgoing';
  otherName: string;
  otherRole: Role;
  phase: Phase;
  /** The person rung is a WhatsApp rider: it "rings" as a WhatsApp message. */
  onWhatsapp: boolean;
  answeredAt: number | null;
  /** How it ended, shown for a moment. */
  endedWords: string | null;
  muted: boolean;
  speaker: boolean;
};

type LiveCallContextValue = {
  /** This build can make calls at all. */
  supported: boolean;
  call: LiveCallView | null;
  startCall: (input: { rideId: string; otherName?: string | null; otherRole: Role }) => Promise<void>;
  answer: () => Promise<void>;
  decline: () => void;
  hangUp: () => void;
  toggleMute: () => void;
  toggleSpeaker: () => void;
};

const noop = () => undefined;
const LiveCallContext = createContext<LiveCallContextValue>({
  supported: false,
  call: null,
  startCall: async () => undefined,
  answer: async () => undefined,
  decline: noop,
  hangUp: noop,
  toggleMute: noop,
  toggleSpeaker: noop,
});

export function useLiveCall(): LiveCallContextValue {
  return useContext(LiveCallContext);
}

const END_WORDS: Record<string, string> = {
  completed: 'Call ended',
  declined: 'Call declined',
  missed: 'No answer',
  cancelled: 'Call ended',
  failed: 'Could not connect',
};

function text(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value ? value : null;
}

type Props = {
  children: ReactNode;
  /** Sends one message on this app's socket (the driver or rider session). */
  send: (type: string, payload: Record<string, unknown>) => Promise<void>;
};

export function LiveCallProvider({ children, send }: Props) {
  const [call, setCall] = useState<LiveCallView | null>(null);
  const callRef = useRef<LiveCallView | null>(null);
  const iceRef = useRef<IceServer[]>([]);
  const pcRef = useRef<InstanceType<NonNullable<ReturnType<typeof webrtc>>['RTCPeerConnection']> | null>(null);
  const streamRef = useRef<{ getTracks(): { stop(): void; enabled: boolean; kind: string }[] } | null>(null);
  const queuedRef = useRef<Record<string, unknown>[]>([]);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = useCallback((next: LiveCallView | null | ((prev: LiveCallView | null) => LiveCallView | null)) => {
    setCall((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      callRef.current = value;
      return value;
    });
  }, []);

  const safeSend = useCallback((type: string, payload: Record<string, unknown>) => {
    void send(type, payload).catch(() => undefined);
  }, [send]);

  /* ── sound and hardware ───────────────────────────────────────────────── */

  const audioOn = useCallback(() => {
    const manager = inCallManager();
    manager?.start({ media: 'audio' });
    manager?.setKeepScreenOn(true);
  }, []);

  const quiet = useCallback(() => {
    const manager = inCallManager();
    manager?.stopRingtone();
    manager?.stopRingback();
    Vibration.cancel();
  }, []);

  /** Everything about the call stops: the connection, the microphone, the sounds. */
  const teardown = useCallback((words: string | null) => {
    quiet();
    const manager = inCallManager();
    manager?.stop();
    manager?.setKeepScreenOn(false);
    try { pcRef.current?.close(); } catch { /* already closed */ }
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    queuedRef.current = [];
    iceRef.current = [];
    if (clearTimer.current) clearTimeout(clearTimer.current);
    if (!callRef.current) return;
    update((prev) => (prev ? { ...prev, phase: 'ended', endedWords: words ?? 'Call ended' } : prev));
    clearTimer.current = setTimeout(() => update(null), 1600);
  }, [quiet, update]);

  const microphone = useCallback(async () => {
    const lib = webrtc();
    if (!lib) throw new Error('This version of the app cannot make calls. Update it from the store.');
    if (streamRef.current) return streamRef.current;
    const stream = await lib.mediaDevices.getUserMedia({ audio: true, video: false });
    streamRef.current = stream as unknown as typeof streamRef.current;
    return streamRef.current;
  }, []);

  /* ── the connection ───────────────────────────────────────────────────── */

  const handleSignal = useCallback(async (signal: Record<string, unknown>) => {
    const lib = webrtc();
    const pc = pcRef.current;
    const current = callRef.current;
    if (!lib || !current?.callId) return;
    if (!pc) { queuedRef.current.push(signal); return; }
    try {
      if (signal.type === 'offer' && typeof signal.sdp === 'string') {
        await pc.setRemoteDescription(new lib.RTCSessionDescription({ type: 'offer', sdp: signal.sdp }));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        safeSend('call:signal', { callId: current.callId, signal: { type: 'answer', sdp: pc.localDescription?.sdp } });
        const queued = queuedRef.current;
        queuedRef.current = [];
        for (const item of queued) await handleSignal(item);
      } else if (signal.type === 'answer' && typeof signal.sdp === 'string') {
        await pc.setRemoteDescription(new lib.RTCSessionDescription({ type: 'answer', sdp: signal.sdp }));
        const queued = queuedRef.current;
        queuedRef.current = [];
        for (const item of queued) await handleSignal(item);
      } else if (signal.type === 'candidate' || signal.type === 'candidates') {
        const list = signal.type === 'candidates' ? (Array.isArray(signal.candidates) ? signal.candidates : []) : [signal.candidate];
        if (!pc.remoteDescription) { list.forEach((candidate) => queuedRef.current.push({ type: 'candidate', candidate })); return; }
        for (const candidate of list) {
          if (candidate && typeof candidate === 'object') {
            await pc.addIceCandidate(new lib.RTCIceCandidate(candidate as { candidate: string })).catch(() => undefined);
          }
        }
      }
    } catch {
      safeSend('call:end', { callId: current.callId, failed: true });
      teardown(END_WORDS.failed);
    }
  }, [safeSend, teardown]);

  const makePeer = useCallback(() => {
    const lib = webrtc();
    const current = callRef.current;
    const stream = streamRef.current;
    if (!lib || !current?.callId || !stream) return null;
    const pc = new lib.RTCPeerConnection({ iceServers: iceRef.current });
    pcRef.current = pc;
    stream.getTracks().forEach((track) => pc.addTrack(track as never, stream as never));
    const callId = current.callId;
    pc.onicecandidate = (event: { candidate: { toJSON(): unknown } | null }) => {
      if (event.candidate) safeSend('call:signal', { callId, signal: { type: 'candidate', candidate: event.candidate.toJSON() } });
    };
    pc.onconnectionstatechange = () => {
      if (pcRef.current !== pc) return;
      if (pc.connectionState === 'connected') {
        quiet();
        update((prev) => (prev ? { ...prev, phase: 'active', answeredAt: prev.answeredAt ?? Date.now() } : prev));
      } else if (pc.connectionState === 'failed') {
        const answered = Boolean(callRef.current?.answeredAt);
        safeSend('call:end', { callId, failed: !answered });
        teardown(answered ? 'Call dropped' : END_WORDS.failed);
      }
    };
    return pc;
  }, [quiet, safeSend, teardown, update]);

  /* ── what the person does ─────────────────────────────────────────────── */

  const startCall = useCallback(async ({ rideId, otherName, otherRole }: { rideId: string; otherName?: string | null; otherRole: Role }) => {
    if (!liveCallSupported || callRef.current) return;
    update({
      callId: null, rideId, direction: 'outgoing', otherName: otherName?.trim().split(/\s+/)[0] || (otherRole === 'DRIVER' ? 'Your driver' : 'Your rider'),
      otherRole, phase: 'starting', onWhatsapp: false, answeredAt: null, endedWords: null, muted: false, speaker: false,
    });
    try {
      await microphone();
    } catch (error) {
      teardown(error instanceof Error && /permission|denied/i.test(error.message) ? 'Allow the microphone to make calls' : 'Could not start the call');
      return;
    }
    if (!callRef.current) return;
    try {
      await send('call:start', { rideId });
    } catch {
      teardown('No connection. Try again.');
    }
  }, [microphone, send, teardown, update]);

  const answer = useCallback(async () => {
    const current = callRef.current;
    if (!current?.callId || current.direction !== 'incoming' || current.phase !== 'ringing') return;
    quiet();
    update((prev) => (prev ? { ...prev, phase: 'connecting' } : prev));
    try {
      await microphone();
    } catch {
      safeSend('call:decline', { callId: current.callId });
      teardown('Allow the microphone to answer calls');
      return;
    }
    try {
      await send('call:accept', { callId: current.callId });
    } catch {
      teardown('No connection. Try again.');
    }
  }, [microphone, quiet, safeSend, send, teardown, update]);

  const decline = useCallback(() => {
    const current = callRef.current;
    if (!current) return;
    if (current.callId) safeSend('call:decline', { callId: current.callId });
    teardown(END_WORDS.declined);
  }, [safeSend, teardown]);

  const hangUp = useCallback(() => {
    const current = callRef.current;
    if (!current) return;
    if (current.callId) safeSend('call:end', { callId: current.callId });
    teardown(END_WORDS.completed);
  }, [safeSend, teardown]);

  const toggleMute = useCallback(() => {
    const track = streamRef.current?.getTracks().find((t) => t.kind === 'audio');
    if (!track) return;
    track.enabled = !track.enabled;
    update((prev) => (prev ? { ...prev, muted: !track.enabled } : prev));
  }, [update]);

  const toggleSpeaker = useCallback(() => {
    const next = !callRef.current?.speaker;
    inCallManager()?.setForceSpeakerphoneOn(next);
    update((prev) => (prev ? { ...prev, speaker: next } : prev));
  }, [update]);

  /* ── what the server says ─────────────────────────────────────────────── */

  const showIncoming = useCallback((payload: Record<string, unknown>) => {
    const callId = text(payload, 'callId');
    const rideId = text(payload, 'rideId');
    if (!callId || !rideId || callRef.current) return;
    if (text(payload, 'state') && text(payload, 'state') !== 'ringing') return;
    if (text(payload, 'direction') && text(payload, 'direction') !== 'incoming') return;
    const other = (payload.other ?? {}) as Record<string, unknown>;
    iceRef.current = Array.isArray(payload.iceServers) ? (payload.iceServers as IceServer[]) : [];
    update({
      callId, rideId, direction: 'incoming',
      otherName: text(other, 'name') ?? 'Wheelers',
      otherRole: text(other, 'role') === 'DRIVER' ? 'DRIVER' : 'RIDER',
      phase: 'ringing', onWhatsapp: false, answeredAt: null, endedWords: null, muted: false, speaker: false,
    });
    inCallManager()?.startRingtone('_DEFAULT_', [800, 1200], 'playback', 30);
    Vibration.vibrate([0, 800, 1200], true);
  }, [update]);

  useEffect(() => onCallEvent((type, payload) => {
    const current = callRef.current;
    const callId = text(payload, 'callId');
    switch (type) {
      case 'call:incoming':
        showIncoming(payload);
        return;
      case 'call:current': {
        clearCurrentCallRequest();
        const found = payload.call;
        if (found && typeof found === 'object') showIncoming(found as Record<string, unknown>);
        return;
      }
      case 'call:start:accepted':
        if (current?.direction === 'outgoing' && !current.callId && callId) {
          iceRef.current = Array.isArray(payload.iceServers) ? (payload.iceServers as IceServer[]) : [];
          const onWhatsapp = payload.calleeChannel === 'whatsapp';
          update((prev) => (prev ? { ...prev, callId, phase: 'ringing', onWhatsapp } : prev));
          audioOn();
          inCallManager()?.startRingback('_DTMF_');
        }
        return;
      case 'call:accepted':
        // They answered: the caller makes the offer.
        if (current?.direction === 'outgoing' && current.callId === callId) {
          inCallManager()?.stopRingback();
          update((prev) => (prev ? { ...prev, phase: 'connecting' } : prev));
          const pc = makePeer();
          if (!pc) return;
          void (async () => {
            try {
              const offer = await pc.createOffer({ offerToReceiveAudio: true });
              await pc.setLocalDescription(offer);
              safeSend('call:signal', { callId, signal: { type: 'offer', sdp: pc.localDescription?.sdp } });
            } catch {
              safeSend('call:end', { callId, failed: true });
              teardown(END_WORDS.failed);
            }
          })();
        }
        return;
      case 'call:accept:accepted':
        // Answered here: wait for their offer.
        if (current?.direction === 'incoming' && current.callId === callId) {
          iceRef.current = Array.isArray(payload.iceServers) ? (payload.iceServers as IceServer[]) : iceRef.current;
          audioOn();
          makePeer();
          const queued = queuedRef.current;
          queuedRef.current = [];
          queued.forEach((signal) => void handleSignal(signal));
        }
        return;
      case 'call:answered':
        // Answered on another of this person's phones: stop ringing here.
        if (current?.callId === callId && current.phase === 'ringing' && current.direction === 'incoming') {
          teardown('Answered on another device');
        }
        return;
      case 'call:signal':
        if (current?.callId && current.callId === callId && payload.signal && typeof payload.signal === 'object') {
          void handleSignal(payload.signal as Record<string, unknown>);
        }
        return;
      case 'call:ended':
        if (current?.callId && current.callId === callId) {
          teardown(END_WORDS[text(payload, 'reason') ?? ''] ?? 'Call ended');
        }
        return;
      case 'error': {
        const request = text(payload, 'requestType');
        if (!current || (request !== 'call:start' && request !== 'call:accept')) return;
        teardown(text(payload, 'message') ?? 'Could not start the call');
        return;
      }
      default:
    }
  }), [audioOn, handleSignal, makePeer, safeSend, showIncoming, teardown, update]);

  // A tapped "is calling" push: ask the server for the call on that trip.
  useEffect(() => onCurrentCallRequest((rideId) => {
    if (callRef.current) return;
    safeSend('call:current', { rideId });
  }), [safeSend]);

  // Back from the background while ringing: the server may have moved on.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const current = callRef.current;
      if (state === 'active' && current?.phase === 'ringing' && current.direction === 'incoming') {
        safeSend('call:current', { rideId: current.rideId });
      }
    });
    return () => subscription.remove();
  }, [safeSend]);

  useEffect(() => () => { if (clearTimer.current) clearTimeout(clearTimer.current); }, []);

  const value = useMemo<LiveCallContextValue>(() => ({
    supported: liveCallSupported,
    call,
    startCall,
    answer,
    decline,
    hangUp,
    toggleMute,
    toggleSpeaker,
  }), [answer, call, decline, hangUp, startCall, toggleMute, toggleSpeaker]);

  return (
    <LiveCallContext.Provider value={value}>
      {children}
      {liveCallSupported ? <LiveCallScreen /> : null}
    </LiveCallContext.Provider>
  );
}
