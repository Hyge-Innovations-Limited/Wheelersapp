import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { AppText } from '@/components/app-text';
import { theme } from '@/theme';

type WalletBalanceCardProps = {
  balance: string;
  subtitle?: string;
  onDeposit?: () => void;
  onWithdraw?: () => void;
  activeAction?: 'deposit' | 'withdraw';
};

export function WalletBalanceCard({
  balance,
  subtitle,
  onDeposit,
  onWithdraw,
  activeAction = 'deposit',
}: WalletBalanceCardProps) {
  const [balanceUnit, ...balanceValueParts] = balance.split(' ');
  const balanceValue = balanceValueParts.join(' ').trim() || balance;

  return (
    <View style={styles.card}>
      <Svg width={72} height={72} viewBox="0 0 84 84" style={styles.blob}>
        <Circle cx="42" cy="42" r="34" fill="rgba(240,145,63,0.32)" />
      </Svg>
      <Svg width={34} height={34} viewBox="0 0 42 42" style={styles.star}>
        <Path
          d="M21 3L23.5 15 33 7 25 17 38 20 25 24 33 35 23.5 27 21 39 18.5 27 9 35 17 24 4 20 17 17 9 7 18.5 15Z"
          fill="rgba(255,255,255,0.18)"
        />
      </Svg>
      <View style={styles.heroWrap}>
        <View style={styles.balanceHaloOuter}>
          <View style={styles.balanceHaloMiddle}>
            <View style={styles.balanceCircle}>
              <AppText
                variant="monoSmall"
                color={theme.colors.offWhite}
                style={styles.balanceUnit}
              >
                {balanceUnit}
              </AppText>
              <AppText
                variant="h2"
                color={theme.colors.offWhite}
                style={styles.balanceValue}
              >
                {balanceValue}
              </AppText>
            </View>
          </View>
        </View>
        {subtitle ? (
          <AppText variant="bodySmall" color={theme.colors.muted} style={styles.subtitle}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <View style={styles.actions}>
        <Pressable
          onPress={onDeposit}
          style={[
            styles.actionButton,
            activeAction === 'deposit' ? styles.actionButtonPrimary : styles.actionButtonSecondary,
          ]}>
          <AppText
            variant="label"
            color={activeAction === 'deposit' ? theme.colors.offWhite : theme.colors.black}>
            + Deposit
          </AppText>
        </Pressable>
        <Pressable
          onPress={onWithdraw}
          style={[
            styles.actionButton,
            activeAction === 'withdraw' ? styles.actionButtonDark : styles.actionButtonSecondary,
          ]}>
          <AppText
            variant="bodyMedium"
            color={activeAction === 'withdraw' ? theme.colors.offWhite : theme.colors.black}>
            Withdraw
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.orange,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.orangeLight,
    padding: theme.spacing.md,
    overflow: 'hidden',
    ...theme.shadows.card,
  },
  blob: {
    position: 'absolute',
    top: -12,
    right: -10,
  },
  star: {
    position: 'absolute',
    bottom: 8,
    left: 10,
  },
  heroWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  balanceHaloOuter: {
    width: 186,
    height: 186,
    borderRadius: 93,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: theme.borders.regular,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  balanceHaloMiddle: {
    width: 154,
    height: 154,
    borderRadius: 77,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.34)',
    borderWidth: theme.borders.regular,
    borderColor: 'rgba(0,0,0,0.12)',
  },
  balanceCircle: {
    width: 126,
    height: 126,
    borderRadius: 63,
    backgroundColor: theme.colors.orange,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
    ...theme.shadows.card,
  },
  balanceUnit: {
    opacity: 0.9,
    marginBottom: 2,
  },
  balanceValue: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  actionButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: theme.radii.sm,
    borderWidth: theme.borders.regular,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonPrimary: {
    backgroundColor: theme.colors.orange,
    borderColor: theme.colors.orange,
    ...theme.shadows.card,
  },
  actionButtonDark: {
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.black,
    ...theme.shadows.card,
  },
  actionButtonSecondary: {
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.white,
  },
});
