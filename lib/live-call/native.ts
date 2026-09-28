import { NativeModules } from 'react-native';

/**
 * Live call needs native code (WebRTC, and the in-call audio manager) that
 * only builds made after it was added contain. The same JavaScript reaches
 * older builds by over-the-air update, where these modules are missing, and
 * merely loading WebRTC there throws. So nothing here is loaded until the
 * native side is known to exist, and a build without it simply has no Call
 * button.
 */

type WebRTC = typeof import('react-native-webrtc');
type InCall = typeof import('react-native-incall-manager').default;

export const liveCallSupported = Boolean(NativeModules.WebRTCModule);

let webrtcModule: WebRTC | null | undefined;
export function webrtc(): WebRTC | null {
  if (webrtcModule !== undefined) return webrtcModule;
  if (!liveCallSupported) return (webrtcModule = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    webrtcModule = require('react-native-webrtc') as WebRTC;
  } catch {
    webrtcModule = null;
  }
  return webrtcModule;
}

let inCallModule: InCall | null | undefined;
/** Speaker, earpiece, ringtone and the screen going dark at the ear. Null on builds without it. */
export function inCallManager(): InCall | null {
  if (inCallModule !== undefined) return inCallModule;
  if (!NativeModules.InCallManager) return (inCallModule = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    inCallModule = (require('react-native-incall-manager') as { default: InCall }).default;
  } catch {
    inCallModule = null;
  }
  return inCallModule;
}
