/* eslint-disable @typescript-eslint/no-require-imports */
import { requireOptionalNativeModule } from 'expo';

let Audio: any = null;
try {
  // Only load the package when this build has its native part (an OTA reaches older builds).
  if (requireOptionalNativeModule('ExponentAV')) Audio = require('expo-av').Audio;
} catch {
  // Native module not available (e.g. missing prebuild) — sound disabled
}

let rideRequestSound: any = null;

/**
 * Monotonic token deciding which play/stop "wins". Creating a sound is async,
 * so a stop that arrives while createAsync is still in flight used to hit
 * nothing — and the loop that finished loading a moment later played forever.
 * Every stop bumps the token; a play that comes back to a changed token
 * throws its freshly created sound away instead of starting it.
 */
let playToken = 0;

async function unloadCurrent(): Promise<void> {
  const sound = rideRequestSound;
  rideRequestSound = null;
  if (!sound) return;
  try {
    await sound.stopAsync();
    await sound.unloadAsync();
  } catch {
    // already unloaded
  }
}

/**
 * Play the ride request alert sound on loop until stopped.
 * Safe to call multiple times — will not stack sounds.
 */
export async function playRideRequestSound(): Promise<void> {
  if (!Audio) return;
  const token = ++playToken;
  try {
    await unloadCurrent();
    if (token !== playToken) return;

    // Silent switch wins: the ring pairs with haptics, so a muted phone
    // still buzzes instead of blaring through a meeting.
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: false,
      staysActiveInBackground: false,
      shouldDuckAndroid: false,
    });
    if (token !== playToken) return;

    const { sound } = await Audio.Sound.createAsync(
      require('@/assets/sounds/ride-request.wav'),
      {
        isLooping: true,
        volume: 1.0,
        shouldPlay: true,
      },
    );

    if (token !== playToken) {
      // A stop overtook us mid-load — this sound must never be heard.
      try {
        await sound.stopAsync();
        await sound.unloadAsync();
      } catch {
        // best effort
      }
      return;
    }
    rideRequestSound = sound;
  } catch {
    // Non-blocking — sound is a nice-to-have
  }
}

/**
 * Stop the ride request sound if it's playing — and invalidate any play that
 * is still loading, so it cannot start after this stop.
 */
export async function stopRideRequestSound(): Promise<void> {
  playToken += 1;
  await unloadCurrent();
}


/**
 * A short one-shot chirp for "something changed on a bid you already made"
 * (rider countered / re-priced). Never loops; hard-capped so a long asset
 * can't turn an alert into a ringtone.
 */
export async function playBidAlertChime(): Promise<void> {
  if (!Audio) return;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: false,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });
    const { sound } = await Audio.Sound.createAsync(
      require('@/assets/sounds/ride-request.wav'),
      { isLooping: false, volume: 0.7, shouldPlay: true },
    );
    const dispose = () => {
      void sound.stopAsync().then(() => sound.unloadAsync()).catch(() => {});
    };
    sound.setOnPlaybackStatusUpdate((status: any) => {
      if (status?.didJustFinish) dispose();
    });
    setTimeout(dispose, 2500);
  } catch {
    // sound is a nice-to-have
  }
}
