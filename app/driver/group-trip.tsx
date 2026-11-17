import { Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppCard } from '@/components/app-card';
import { AppScreen } from '@/components/app-screen';
import { AppText } from '@/components/app-text';
import { DriverWaitingDeal } from '@/components/driver-waiting-deal';
import { EmergencyButton } from '@/components/emergency-button';
import { StatusPill } from '@/components/StatusPill';
import { TripCallButton } from '@/components/TripCallButton';
import { TripChatButton } from '@/components/TripChatButton';
import { TripCodeSheet } from '@/components/TripCodeSheet';
import { TripProgressBar } from '@/components/TripProgressBar';
import { WaitingUnpaidSheet } from '@/components/WaitingUnpaidSheet';
import { actionAt, canContinueWithout, groupEarnedNgn, groupEarnings, nextGroupStop, seatOf, shortPlace, stopDone, type DriverGroupSeat, type DriverGroupStop } from '@/lib/driver-group';
import { useDriverSession } from '@/lib/driver-session';
import { toUserMessage } from '@/lib/error-messages';
import { onStartResult } from '@/lib/trip-code';
import { directionsUrl } from '@/lib/feed';
import { haversineKm } from '@/lib/geo';
import { useAppLocation } from '@/lib/location';
import { minutesSeconds, waitingClock } from '@/lib/waiting';
import { theme } from '@/theme';

const formatNgn = (amount: number) => `₦${Math.round(amount).toLocaleString('en-NG')}`;
/** Inside this, the driver is at the drop-off and Drop off needs no question. */
const DROP_NEAR_KM = 0.3;

/**
 * A group ride, on the driver's side (Timi, 17 Nov 2026): one trip through every rider's stops in order. Each rider
 * is picked up with their own Arrived and code, and dropped on their own; the next stop is the one thing on screen.
 * The trip screens (navigation, arrived, active-trip) send a group ride here.
 */
export default function DriverGroupTripScreen() {
  const router = useRouter();
  const { session, groupSeat, answerWaiting, cancelTrip, clearCompleted, finishGroupTrip, syncActiveRide, sendGps, chatMessages, sendChatMessage } = useDriverSession();
  const { currentLocation } = useAppLocation();
  const ride = session.currentRide;
  const group = ride?.group;

  const [nowMs, setNowMs] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [codeFor, setCodeFor] = useState<DriverGroupSeat | null>(null);
  const [unpaid, setUnpaid] = useState<{ seat: DriverGroupSeat; minutes: number; amountNgn: number } | null>(null);
  // "Yes, start" sent and not answered yet (one tap, one start).
  const [startingAnyway, setStartingAnyway] = useState(false);
  // Every stop done since (ms): the server's "done" is expected; after a while the driver may finish it here.
  const [allDoneSince, setAllDoneSince] = useState<number | null>(null);
  const lastGpsSentRef = useRef(0);
  // The seat being started: a waiting its rider's wallet could not cover is asked about for that seat.
  const startingSeatRef = useRef<DriverGroupSeat | null>(null);

  useEffect(() => onStartResult((result) => {
    if (result.kind === 'waiting' && startingSeatRef.current) {
      setCodeFor(null);
      setStartingAnyway(false);
      setUnpaid({ seat: startingSeatRef.current, minutes: result.minutes, amountNgn: result.amountNgn });
    }
    // The server wants the rider's code this screen did not know was needed: the keypad, for that rider.
    if (result.kind === 'refused' && startingSeatRef.current) setCodeFor(startingSeatRef.current);
    if (result.kind === 'started') {
      setUnpaid(null);
      setStartingAnyway(false);
    }
  }), []);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Gone (cancelled, or not a group ride after all): back to the map.
  useEffect(() => {
    if (!ride) router.replace('/driver/(tabs)/home' as Href);
    else if (!group && session.status !== 'completed') router.replace('/driver/(tabs)/home' as Href);
  }, [ride, group, session.status, router]);

  // The trip's position, every 10 s at most (the provider already throttles).
  useEffect(() => {
    if (!currentLocation || !ride || session.status === 'completed') return;
    const now = Date.now();
    if (now - lastGpsSentRef.current < 10_000) return;
    lastGpsSentRef.current = now;
    sendGps(currentLocation.lat, currentLocation.lng);
  }, [currentLocation, ride, session.status, sendGps]);

  const allStopsDone = Boolean(group) && session.status !== 'completed' && nextGroupStop(group!) === null;
  useEffect(() => {
    if (!allStopsDone) {
      setAllDoneSince(null);
      return;
    }
    setAllDoneSince((since) => since ?? Date.now());
    // Ask the server once: it may have finished the trip while its message was lost.
    void syncActiveRide();
  }, [allStopsDone, syncActiveRide]);

  if (!ride || !group) return null;

  if (session.status === 'completed') {
    const { dropped } = groupEarnings(group);
    const earned = groupEarnedNgn(group, ride.groupEarnedNgn);
    return (
      <AppScreen backgroundColor={theme.colors.offWhite} scroll contentStyle={styles.container}>
        <StatusBar style="dark" backgroundColor={theme.colors.offWhite} />
        <AppText variant="h1" style={styles.center}>Group ride done</AppText>
        <AppCard style={styles.card}>
          {earned !== null ? (
            <>
              <AppText variant="bodySmall" color={theme.colors.muted}>YOU EARNED</AppText>
              <AppText variant="display" color={theme.colors.orange} numberOfLines={1} adjustsFontSizeToFit>
                {formatNgn(earned)}
              </AppText>
            </>
          ) : null}
          <AppText variant="bodySmall" color={theme.colors.muted}>
            {dropped} {dropped === 1 ? 'rider' : 'riders'} · Credited to wallet
          </AppText>
        </AppCard>
        <AppButton
          title="Next ride"
          onPress={() => {
            clearCompleted();
            router.replace('/driver/(tabs)/home' as Href);
          }}
        />
      </AppScreen>
    );
  }

  const next = nextGroupStop(group);
  const someoneAboard = group.seats.some((s) => s.status === 'IN_PROGRESS' || s.status === 'COMPLETED');

  const run = async (work: () => Promise<void>, fallback: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await work();
    } catch (err) {
      Alert.alert('Could not do that', toUserMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  const navigateTo = (stop: DriverGroupStop) =>
    void Linking.openURL(directionsUrl({ lat: stop.lat, lng: stop.lng, name: stop.address }, Platform.OS));

  const start = (seat: DriverGroupSeat, options?: { startAnyway?: boolean }) => {
    if (options?.startAnyway) {
      if (startingAnyway) return;
      setStartingAnyway(true);
    }
    startingSeatRef.current = seat;
    if (seat.tripCodeRequired && !options?.startAnyway) {
      setCodeFor(seat);
      return;
    }
    void run(async () => {
      try {
        await groupSeat('start', seat.rideId, undefined, options);
      } catch (err) {
        setStartingAnyway(false);
        throw err;
      }
    }, 'Could not start. Try again.');
  };

  const drop = (stop: DriverGroupStop, seat: DriverGroupSeat) => {
    const far = currentLocation ? haversineKm(currentLocation.lat, currentLocation.lng, stop.lat, stop.lng) > DROP_NEAR_KM : false;
    const go = () => void run(() => groupSeat('drop', seat.rideId), 'Could not drop off. Try again.');
    if (!far) return go();
    Alert.alert(`Drop off ${seat.riderName} here?`, `You are not at ${shortPlace(stop.address)} yet.`, [
      { text: 'Not yet', style: 'cancel' },
      { text: 'Drop off', onPress: go },
    ]);
  };

  const skip = (seat: DriverGroupSeat) =>
    Alert.alert(`Go on without ${seat.riderName}?`, 'Their seat is cancelled, free.', [
      { text: 'Keep waiting', style: 'cancel' },
      { text: 'Go on', style: 'destructive', onPress: () => void run(() => groupSeat('skip', seat.rideId), 'Could not do that. Try again.') },
    ]);

  const leave = () =>
    Alert.alert('Cancel this group ride?', 'Every rider will be told.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Cancel ride', style: 'destructive', onPress: () => void run(() => cancelTrip(ride.rideId), 'Could not cancel. Try again.') },
    ]);

  return (
    <AppScreen backgroundColor={theme.colors.offWhite} scroll contentStyle={styles.container}>
      <StatusBar style="dark" backgroundColor={theme.colors.offWhite} />
      <View style={styles.header}>
        <StatusPill dotColor={theme.colors.orange} label={`GROUP RIDE · ${group.seats.length} RIDERS`} variant="dark" />
        {someoneAboard ? <EmergencyButton role="DRIVER" rideId={ride.rideId} compact /> : null}
      </View>

      {next ? (
        <NextStop
          key={`${next.stop.rideId}:${next.stop.kind}`}
          stop={next.stop}
          seat={next.seat}
          nowMs={nowMs}
          busy={busy}
          chatMessages={chatMessages}
          sendChatMessage={sendChatMessage}
          onNavigate={() => navigateTo(next.stop)}
          onArrive={() => void run(() => groupSeat('arrive', next.seat.rideId), 'Could not mark arrived. Try again.')}
          onStart={() => start(next.seat)}
          onDrop={() => drop(next.stop, next.seat)}
          onSkip={() => skip(next.seat)}
          onAnswerWaiting={(action, ngn) => answerWaiting(action, ngn, next.seat.rideId)}
        />
      ) : (
        <AppCard style={styles.card}>
          {allDoneSince !== null && nowMs - allDoneSince > 8000 ? (
            <>
              <AppText variant="bodyMedium" color={theme.colors.muted}>Last drop done.</AppText>
              <AppButton title="Done" onPress={finishGroupTrip} />
            </>
          ) : (
            <AppText variant="bodyMedium" color={theme.colors.muted}>Closing the trip…</AppText>
          )}
        </AppCard>
      )}

      {/* Every stop in order: behind you, next, still to come. */}
      <AppCard style={styles.card}>
        {group.stops.map((stop, index) => {
          const seat = seatOf(group, stop.rideId);
          const done = stopDone(stop, seat);
          const isNext = next?.stop === stop;
          const verb = stop.kind === 'pickup' ? 'Pick up' : 'Drop off';
          const gone = seat?.status === 'CANCELLED';
          return (
            <View key={`${stop.rideId}:${stop.kind}:${index}`} style={styles.stopRow}>
              <View style={[styles.dot, isNext ? styles.dotNext : done ? styles.dotDone : null]} />
              <AppText
                variant={isNext ? 'bodyMedium' : 'bodySmall'}
                color={done ? theme.colors.muted : theme.colors.black}
                style={[styles.flex, done && styles.struck]}
                numberOfLines={1}>
                {verb} {seat?.riderName ?? 'Rider'} · {shortPlace(stop.address)}
              </AppText>
              {gone ? <AppText variant="bodySmall" color={theme.colors.muted}>Cancelled</AppText> : null}
            </View>
          );
        })}
      </AppCard>

      {!someoneAboard ? (
        <Pressable onPress={leave} style={styles.cancelLink} disabled={busy}>
          <AppText variant="bodySmall" color={theme.colors.muted}>Cancel group ride</AppText>
        </Pressable>
      ) : null}

      <TripCodeSheet
        visible={codeFor !== null}
        rideId={codeFor?.rideId ?? ''}
        riderName={codeFor?.riderName}
        onClose={() => setCodeFor(null)}
        onSubmit={(code) => (codeFor ? groupSeat('start', codeFor.rideId, code || undefined) : Promise.resolve())}
        onStarted={() => setCodeFor(null)}
      />
      <WaitingUnpaidSheet
        visible={unpaid !== null}
        minutes={unpaid?.minutes ?? 0}
        amountNgn={unpaid?.amountNgn ?? 0}
        starting={startingAnyway}
        onYes={() => {
          if (unpaid) start(unpaid.seat, { startAnyway: true });
        }}
        onNo={() => setUnpaid(null)}
      />
    </AppScreen>
  );
}

function NextStop({
  stop,
  seat,
  nowMs,
  busy,
  chatMessages,
  sendChatMessage,
  onNavigate,
  onArrive,
  onStart,
  onDrop,
  onSkip,
  onAnswerWaiting,
}: {
  stop: DriverGroupStop;
  seat: DriverGroupSeat;
  nowMs: number;
  busy: boolean;
  chatMessages: ReturnType<typeof useDriverSession>['chatMessages'];
  sendChatMessage: ReturnType<typeof useDriverSession>['sendChatMessage'];
  onNavigate: () => void;
  onArrive: () => void;
  onStart: () => void;
  onDrop: () => void;
  onSkip: () => void;
  onAnswerWaiting: (action: 'offer' | 'accept', ngn: number) => Promise<void>;
}) {
  const action = actionAt(stop, seat);
  const verb = stop.kind === 'pickup' ? 'Pick up' : 'Drop off';
  const wait = action === 'code' && seat.waiting ? waitingClock(seat.waiting, nowMs) : null;

  return (
    <AppCard style={styles.card}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <AppText variant="h2" numberOfLines={1}>{verb} {seat.riderName}</AppText>
          <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={2}>{stop.address}</AppText>
        </View>
        <AppText variant="mono" color={theme.colors.green}>{formatNgn(seat.seatPriceNgn)}</AppText>
      </View>

      {action !== 'drop' ? (
        <View style={styles.row}>
          <TripChatButton rideId={seat.rideId} role="DRIVER" messages={chatMessages} onSend={sendChatMessage} otherName={seat.riderName} style={styles.flex} />
          <TripCallButton rideId={seat.rideId} otherRole="RIDER" otherName={seat.riderName} style={styles.flex} />
        </View>
      ) : null}

      {wait && seat.waiting ? (
        <>
          <TripProgressBar
            fillColor={wait.stopped ? theme.colors.mutedLight : wait.free ? theme.colors.green : theme.colors.orange}
            label={wait.stopped ? `Waiting stopped · ${minutesSeconds(wait.waitedSeconds)}` : wait.free ? `Free wait: ${minutesSeconds(wait.freeLeftSeconds)} left` : `Waiting ${minutesSeconds(wait.waitedSeconds)}`}
            progress={seat.waiting.freeSeconds > 0 ? Math.min(1, wait.waitedSeconds / seat.waiting.freeSeconds) : 1}
          />
          <DriverWaitingDeal nowMs={nowMs} onAnswer={onAnswerWaiting} waiting={seat.waiting} />
        </>
      ) : null}

      {action === 'arrive' ? (
        <View style={styles.row}>
          <AppButton title="Navigate" variant="ghost" onPress={onNavigate} style={styles.flex} />
          <AppButton title="Arrived" onPress={onArrive} loading={busy} style={styles.flex} />
        </View>
      ) : action === 'code' ? (
        <>
          <AppButton title={`Start · ${seat.riderName}`} onPress={onStart} loading={busy} />
          {canContinueWithout(seat, nowMs) ? (
            <AppButton title={`Go on without ${seat.riderName}`} variant="danger" onPress={onSkip} disabled={busy} />
          ) : null}
        </>
      ) : action === 'drop' ? (
        <View style={styles.row}>
          <AppButton title="Navigate" variant="ghost" onPress={onNavigate} style={styles.flex} />
          <AppButton title="Drop off" onPress={onDrop} loading={busy} style={styles.flex} />
        </View>
      ) : null}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, gap: theme.spacing.lg, paddingTop: theme.spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  center: { textAlign: 'center' },
  card: { gap: theme.spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  flex: { flex: 1, minWidth: 0 },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: theme.colors.borderLight },
  dotNext: { borderColor: theme.colors.orange, backgroundColor: theme.colors.orange },
  dotDone: { borderColor: theme.colors.green, backgroundColor: theme.colors.green },
  struck: { textDecorationLine: 'line-through' },
  cancelLink: { alignItems: 'center', paddingVertical: 12 },
});
