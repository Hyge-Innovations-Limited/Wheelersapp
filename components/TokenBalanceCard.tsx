import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { AppText } from '@/components/app-text';
import { theme } from '@/theme';

type TokenBalanceCardProps = {
  balance: string;
  fiatApprox: string;
  onStake?: () => void;
  onSwap?: () => void;
};

export function TokenBalanceCard({
  balance,
  fiatApprox,
  onStake,
  onSwap,
}: TokenBalanceCardProps) {
  return (
    <View style={styles.card}>
      <Svg height={84} style={styles.blob} viewBox="0 0 80 80" width={84}>
        <Path
          d="M40 5C54 3,70 14,73 30C78 50,66 68,48 74C30 80,10 68,5 50C-1 30,12 8,40 5Z"
          fill="rgba(240,145,63,0.22)"
        />
      </Svg>
      <AppText variant="bodySmall" color={theme.colors.darkMuted}>
        WHE Token Balance
      </AppText>
      <AppText variant="metric" color={theme.colors.orange} style={styles.balance}>
        {balance}
      </AppText>
      <AppText variant="bodySmall" color={theme.colors.darkMuted}>
        {fiatApprox}
      </AppText>
      <View style={styles.actions}>
        <Pressable onPress={onStake} style={styles.primaryButton}>
          <AppText variant="label" color={theme.colors.white}>
            Stake
          </AppText>
        </Pressable>
        <Pressable onPress={onSwap} style={styles.secondaryButton}>
          <AppText variant="bodyMedium" color={theme.colors.mutedLight}>
            Swap
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.darkBorder,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.darkSurface,
    padding: theme.spacing.lg,
    overflow: 'hidden',
  },
  blob: {
    position: 'absolute',
    right: -6,
    top: -8,
  },
  balance: {
    marginTop: 2,
    marginBottom: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  primaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: theme.radii.sm,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.orange,
    backgroundColor: theme.colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF8533',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 4,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: theme.radii.sm,
    borderWidth: theme.borders.regular,
    borderColor: '#444',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
