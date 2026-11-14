import Ionicons from '@expo/vector-icons/Ionicons';
import { Image, StyleSheet } from 'react-native';

/**
 * The few security icons the apps use (Timi, 14 Nov 2026), one small icon
 * where it means something: a shield for "checked", a lock for money, codes
 * and PINs, a mic for recording, and the W for "by Wheelers". Ink or green,
 * never orange (orange is for actions). Icons from the font already in the
 * app, so they ship by OTA.
 */
const GREEN = '#00875F';

export function ShieldIcon({ size = 16, color = GREEN }: { size?: number; color?: string }) {
  return <Ionicons accessibilityElementsHidden importantForAccessibility="no" color={color} name="shield-checkmark" size={size} />;
}

export function LockIcon({ size = 14, color = '#0D0D0D' }: { size?: number; color?: string }) {
  return <Ionicons accessibilityElementsHidden importantForAccessibility="no" color={color} name="lock-closed" size={size} />;
}

export function MicIcon({ size = 14, color = '#C62828' }: { size?: number; color?: string }) {
  return <Ionicons accessibilityElementsHidden importantForAccessibility="no" color={color} name="mic" size={size} />;
}

/** The orange W, beside "Checked by Wheelers". */
export function WheelersMark({ size = 28 }: { size?: number }) {
  return (
    <Image
      accessibilityElementsHidden
      importantForAccessibility="no"
      source={require('@/assets/images/icon.png')}
      style={[styles.mark, { width: size, height: size, borderRadius: Math.round(size * 0.28) }]}
    />
  );
}

const styles = StyleSheet.create({
  mark: { flexShrink: 0 },
});
