import { Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { AppButton } from '@/components/app-button';
import { AppCard } from '@/components/app-card';
import { AppScreen } from '@/components/app-screen';
import { AppText, OnLight } from '@/components/app-text';
import { StatusPill } from '@/components/StatusPill';
import { TripCallButton } from '@/components/TripCallButton';
import { TripCodeSheet } from '@/components/TripCodeSheet';
import { onStartResult } from '@/lib/trip-code';
import { TripChatButton } from '@/components/TripChatButton';
import { TripDetailsChips } from '@/components/TripDetailsChips';
import { TripProgressBar } from '@/components/TripProgressBar';
import { WaitingUnpaidSheet } from '@/components/WaitingUnpaidSheet';
import { useDriverSession } from '@/lib/driver-session';
import { DEFAULT_WAITING, minutesSeconds, waitingClock } from '@/lib/waiting';
import { useResponsive } from '@/lib/responsive';
import { theme } from '@/theme';
import { toUserMessage } from '@/lib/error-messages';


function formatNgn(amount: number): string {
  return `₦${Math.round(amount).toLocaleString('en-NG')}`;
}

export default function DriverArrivedScreen() {
  const router = useRouter();
  const { session, startTrip, cancelTrip, chatMessages, sendChatMessage } = useDriverSession();
  const responsive = useResponsive();
  const ride = session.currentRide;

  // Only until the server's arrival time comes with the ride (an older server, or the first seconds).
  const arrivedAtRef = useRef(Date.now());
  const [nowMs, setNowMs] = useState(Date.now());
  const [copied, setCopied] = useState(false);
  const [codeSheetOpen, setCodeSheetOpen] = useState(false);
  // The rider's wallet could not cover the waiting: the driver is asked before the trip starts.
  const [unpaid, setUnpaid] = useState<{ minutes: number; amountNgn: number } | null>(null);
  const [startingAnyway, setStartingAnyway] = useState(false);

  // The server asked for the code this app did not know was needed (a
  // resync, an older snapshot): open the keypad then.
  useEffect(() => onStartResult((result) => {
    if (result.kind === 'refused' && !codeSheetOpen) setCodeSheetOpen(true);
    if (result.kind === 'waiting') {
      setCodeSheetOpen(false);
      setStartingAnyway(false);
      setUnpaid({ minutes: result.minutes, amountNgn: result.amountNgn });
    }
    if (result.kind === 'started') setUnpaid(null);
  }), [codeSheetOpen]);

  useEffect(() => {
    if (!ride) {
      router.replace('/driver/(tabs)/home' as Href);
      return;
    }

    const tick = () => setNowMs(Date.now());
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [ride, router]);

  useEffect(() => {
    if (session.status === 'active') {
      router.replace('/driver/active-trip' as Href);
    }
  }, [session.status, router]);

  if (!ride) return null;

  const handleCallRider = () => {
    if (ride.riderPhone) {
      Linking.openURL(`tel:${ride.riderPhone}`);
    }
  };

  const handleCopyPhone = async () => {
    if (ride.riderPhone) {
      await Clipboard.setStringAsync(ride.riderPhone);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleStartTrip = async () => {
    // The rider's 4-digit trip code first, when this trip has one.
    if (ride.tripCodeRequired) {
      setCodeSheetOpen(true);
      return;
    }
    try {
      await startTrip(ride.rideId);
    } catch (err) {
      Alert.alert('Error', toUserMessage(err, 'Could not start trip. Please try again.'));
    }
  };

  // A rider who never shows is the one way a trip can end here. Without an
  // exit the driver is stuck on this screen — and the app now reopens an
  // assigned trip on every launch, so "stuck" would mean permanently.
  const handleNoShow = () => {
    Alert.alert(
      'Cancel this trip?',
      'The rider will be told.',
      [
        { text: 'Keep waiting', style: 'cancel' },
        {
          text: 'Cancel trip',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelTrip(ride.rideId, 'rider_no_show');
            } catch (err) {
              Alert.alert('Error', toUserMessage(err, 'Could not cancel the trip. Please try again.'));
            }
          },
        },
      ],
    );
  };

  const avatarSize = responsive.scale(44);
  const actionHeight = responsive.scale(42);

  // Time only, on the server's clock: the money is between the rider and Wheelers until the end of the trip.
  const waitInfo = ride.waiting ?? { ...DEFAULT_WAITING, arrivedAtMs: arrivedAtRef.current, stoppedAtMs: null, skewMs: 0 };
  const wait = waitingClock(waitInfo, nowMs);
  const waitOverdue = !wait.free;
  const waitProgress = waitInfo.freeSeconds > 0 ? Math.min(1, wait.waitedSeconds / waitInfo.freeSeconds) : 1;
  const waitLabel = wait.stopped
    ? `Waiting stopped · ${minutesSeconds(wait.waitedSeconds)}`
    : wait.free
      ? `Free wait: ${minutesSeconds(wait.freeLeftSeconds)} left`
      : `Waiting ${minutesSeconds(wait.waitedSeconds)}`;
  const waitColor = wait.stopped ? theme.colors.mutedLight : wait.free ? theme.colors.green : theme.colors.orange;

  const startAnyway = async () => {
    setStartingAnyway(true);
    try {
      await startTrip(ride.rideId, undefined, { startAnyway: true });
    } catch (err) {
      setStartingAnyway(false);
      Alert.alert('Error', toUserMessage(err, 'Could not start trip. Please try again.'));
    }
  };

  return (
    <AppScreen backgroundColor={theme.colors.offWhite} scroll contentStyle={styles.container}>
      <StatusBar style="dark" backgroundColor={theme.colors.offWhite} />

      <View style={styles.headerSection}>
        <StatusPill
          dotColor={theme.colors.orange}
          label="WAITING FOR RIDER"
          variant="dark"
        />
        <AppText variant="h1" style={styles.center}>
          You&apos;ve arrived
        </AppText>
      </View>

      {/* Rider card */}
      <AppCard style={styles.riderCard}>
        <View style={styles.riderInfo}>
          <View style={[styles.avatar, { width: avatarSize, height: avatarSize }]}>
            <OnLight>
            <AppText variant="h3" color={theme.colors.orange}>R</AppText>
            </OnLight>
          </View>
          <View style={styles.riderCopy}>
            <AppText variant="h3" numberOfLines={1}>Rider</AppText>
            <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>
              {ride.pickup.address}
            </AppText>
          </View>
          <View style={styles.fareTag}>
            <OnLight>
            <AppText variant="mono" color={theme.colors.green} numberOfLines={1}>
              {formatNgn(ride.fareNgn)}
            </AppText>
            </OnLight>
          </View>
        </View>

        {/* What the rider said: people, luggage, pet, a note. */}
        <TripDetailsChips details={ride.tripDetails} />

        <View style={styles.phoneRow}>
          <TripChatButton
            rideId={ride.rideId}
            role="DRIVER"
            messages={chatMessages}
            onSend={sendChatMessage}
            otherName={ride.riderName}
            style={{ minHeight: actionHeight }}
          />
          <TripCallButton rideId={ride.rideId} otherRole="RIDER" otherName={ride.riderName} style={{ minHeight: actionHeight }} />
        </View>
        {ride.riderPhone ? (
          <View style={styles.phoneRow}>
            <Pressable style={[styles.callButton, { minHeight: actionHeight }]} onPress={handleCallRider}>
              <OnLight>
              <AppText variant="label">Phone</AppText>
              </OnLight>
            </Pressable>
            <Pressable style={[styles.copyButton, { minHeight: actionHeight }]} onPress={handleCopyPhone}>
              <OnLight>
              <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>
                {copied ? 'Copied!' : ride.riderPhone}
              </AppText>
              </OnLight>
            </Pressable>
          </View>
        ) : null}
      </AppCard>

      {/* Wait timer */}
      <View style={styles.waitSection}>
        <TripProgressBar fillColor={waitColor} label={waitLabel} progress={waitProgress} />
      </View>

      <AppButton title="Start trip" onPress={handleStartTrip} />
      <TripCodeSheet
        visible={codeSheetOpen}
        rideId={ride.rideId}
        riderName={ride.riderName}
        onClose={() => setCodeSheetOpen(false)}
        onSubmit={(code) => startTrip(ride.rideId, code || undefined)}
        onStarted={() => setCodeSheetOpen(false)}
      />
      <WaitingUnpaidSheet
        visible={unpaid !== null}
        minutes={unpaid?.minutes ?? 0}
        amountNgn={unpaid?.amountNgn ?? 0}
        starting={startingAnyway}
        onYes={() => void startAnyway()}
        onNo={() => setUnpaid(null)}
      />
      {waitOverdue ? (
        <AppButton title="Rider didn't show — cancel trip" variant="danger" onPress={handleNoShow} />
      ) : (
        <Pressable onPress={handleNoShow} style={styles.cancelLink}>
          <AppText variant="bodySmall" color={theme.colors.muted}>
            Can&apos;t reach the rider? Cancel trip
          </AppText>
        </Pressable>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  cancelLink: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  container: {
    // flexGrow (not flex) keeps the centred layout on tall screens while
    // still allowing the content to scroll on short ones.
    flexGrow: 1,
    justifyContent: 'center',
    gap: theme.spacing.lg,
  },
  headerSection: {
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  center: {
    textAlign: 'center',
  },
  riderCard: {
    gap: theme.spacing.md,
  },
  riderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  avatar: {
    flexShrink: 0,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.orangeLight,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderCopy: {
    flex: 1,
    gap: 1,
  },
  fareTag: {
    flexShrink: 0,
    maxWidth: '45%',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.radii.sm,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.green,
    backgroundColor: theme.colors.successLight,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  callButton: {
    flex: 1,
    minWidth: 0,
    borderRadius: theme.radii.sm,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.green,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.subtle,
  },
  copyButton: {
    flexShrink: 1,
    borderRadius: theme.radii.sm,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  waitSection: {
    gap: theme.spacing.xs,
  },
});
