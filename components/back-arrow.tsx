import { useRouter } from 'expo-router';
import { Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';

import { AppText } from '@/components/app-text';
import { theme } from '@/theme';

type BackArrowProps = {
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  light?: boolean;
};

export function BackArrow({ style, onPress, light }: BackArrowProps) {
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      // With nothing behind this screen, back goes to the start, which sends a signed-in person home.
      onPress={onPress ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
      style={[
        styles.button,
        {
          backgroundColor: light ? 'rgba(255,255,255,0.18)' : theme.colors.white,
          // A translucent background would let the hard shadow stamp an offset
          // copy of the icon, so the shadow is dropped in the light variant.
          ...(light ? { shadowOpacity: 0, elevation: 0 } : null),
          borderColor: light ? theme.colors.white : theme.colors.black,
        },
        style,
      ]}>
      <AppText variant="h3" color={light ? theme.colors.white : theme.colors.black}>
        ←
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.thick,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.card,
  },
});
