/**
 * Asked before a driver switches "Record trips" off (Settings). Turning it
 * back on asks nothing.
 */
export const RECORDING_OFF_TITLE = 'Turn off recording?';
export const RECORDING_OFF_BODY =
  'Recording is there to watch over your trips and to settle any dispute later. With it off, there is nothing to check if a rider complains.';

type AlertButton = { text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void };
type ShowAlert = (
  title: string,
  message: string,
  buttons: AlertButton[],
  options: { cancelable: boolean; onDismiss: () => void },
) => void;

/** True only when the driver taps Turn off; Keep it on, or closing the box, keeps it on. */
export function confirmRecordingOff(show: ShowAlert): Promise<boolean> {
  return new Promise((resolve) => {
    show(
      RECORDING_OFF_TITLE,
      RECORDING_OFF_BODY,
      [
        { text: 'Keep it on', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Turn off', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
