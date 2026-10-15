import { ActivityIndicator, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { AppText } from '@/components/app-text';
import { theme } from '@/theme';

type Variant = 'primary' | 'ghost' | 'inverse' | 'danger';

type AppButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

const variantStyles = {
  // As on the rider side: solid orange, dark words, no outline.
  primary: {
    backgroundColor: theme.colors.orange,
    borderColor: theme.colors.orange,
    textColor: theme.colors.black,
    shadowColor: theme.colors.black,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: theme.colors.black,
    textColor: theme.colors.black,
    shadowColor: theme.colors.black,
  },
  inverse: {
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.borderLight,
    textColor: theme.colors.orange,
    shadowColor: theme.colors.black,
  },
  danger: {
    backgroundColor: 'transparent',
    borderColor: theme.colors.danger,
    textColor: theme.colors.danger,
    shadowColor: theme.colors.danger,
  },
} as const;

export function AppButton({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: AppButtonProps) {
  const current = variantStyles[variant];
  const isDisabled = disabled || loading;
  // A transparent view casts its hard shadow from the content's alpha on iOS,
  // which stamps an offset copy of the label and border. Outline buttons get
  // no shadow instead.
  const isTransparent = current.backgroundColor === 'transparent';

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: current.backgroundColor,
          borderColor: current.borderColor,
          shadowColor: current.shadowColor,
        },
        isTransparent && styles.flat,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}>
      <View style={styles.content}>
        {loading && <ActivityIndicator size="small" color={current.textColor} />}
        <AppText variant="label" color={current.textColor} style={styles.label}>
          {loading ? 'Submitting…' : title}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 56,
    borderWidth: 2,
    borderRadius: theme.radius.md,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  label: {
    textAlign: 'center',
    fontFamily: 'HankenGrotesk_800ExtraBold',
    fontSize: 17,
    lineHeight: 22,
  },
  flat: {
    shadowOpacity: 0,
    elevation: 0,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.4,
  },
});
