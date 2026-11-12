import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';

import { AppText, OnLight } from '@/components/app-text';
import { theme } from '@/theme';

const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;

/**
 * The rider's wallet could not cover the waiting fee (the server said
 * WAITING_UNPAID when the driver started the trip). The meter has stopped.
 * Yes starts the trip anyway (they settle it in person); No closes this, and
 * the next Start goes through without asking again.
 */
export function WaitingUnpaidSheet({
  visible,
  minutes,
  amountNgn,
  starting,
  onYes,
  onNo,
}: {
  visible: boolean;
  minutes: number;
  amountNgn: number;
  starting: boolean;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onNo}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Close" style={styles.flex} onPress={onNo} />
        <View accessibilityViewIsModal style={styles.sheet}>
          <OnLight>
            <AppText variant="h2">Waiting time not paid</AppText>
            <View style={styles.owed}>
              <AppText variant="bodySmall" color={theme.colors.muted}>
                Rider owes you · {minutes} min
              </AppText>
              <AppText variant="h2" style={styles.amount}>
                {naira(amountNgn)}
              </AppText>
            </View>
            <AppText variant="body" color={theme.colors.muted}>
              We couldn&apos;t take it from their wallet. Settle it with them. Start the trip?
            </AppText>
            <Pressable
              accessibilityRole="button"
              disabled={starting}
              onPress={onYes}
              style={({ pressed }) => [styles.yes, (pressed || starting) && styles.dim]}>
              {starting ? <ActivityIndicator color={theme.colors.black} /> : <AppText variant="label">Yes, start trip</AppText>}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={starting}
              onPress={onNo}
              style={({ pressed }) => [styles.no, pressed && styles.dim]}>
              <AppText variant="label">No</AppText>
            </Pressable>
          </OnLight>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    gap: theme.spacing.md,
    padding: theme.spacing.gutter,
    paddingBottom: theme.spacing.xl,
    backgroundColor: theme.colors.offWhite,
    borderTopLeftRadius: theme.radii.lg,
    borderTopRightRadius: theme.radii.lg,
    borderTopWidth: theme.borders.thick,
    borderColor: theme.colors.borderLight,
  },
  owed: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.white,
  },
  amount: { fontVariant: ['tabular-nums'] },
  yes: {
    minHeight: 50,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  no: {
    minHeight: 50,
    borderRadius: theme.radii.sm,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: { opacity: 0.6 },
});
