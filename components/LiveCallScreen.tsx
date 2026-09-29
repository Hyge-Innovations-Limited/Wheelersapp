import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { isDriverApp } from '@/lib/app-variant';
import { useLiveCall } from '@/lib/live-call/call-session';
import { theme } from '@/theme';

function clock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

/** The call, over everything: who, how it is going, and the buttons. */
export function LiveCallScreen() {
  const { call, answer, decline, hangUp, toggleMute, toggleSpeaker } = useLiveCall();
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (call?.phase !== 'active') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [call?.phase]);

  if (!call) return null;

  const who = call.otherRole === 'DRIVER' ? 'Your driver' : 'Your rider';
  let status: string;
  switch (call.phase) {
    case 'starting': status = 'Starting…'; break;
    case 'ringing':
      status = call.direction === 'incoming'
        ? `${who} is calling`
        : call.onWhatsapp ? 'Ringing on WhatsApp…' : 'Ringing…';
      break;
    case 'connecting': status = 'Connecting…'; break;
    case 'active': status = clock(Math.max(0, Math.floor((now - (call.answeredAt ?? now)) / 1000))); break;
    default: status = call.endedWords ?? 'Call ended';
  }
  const incoming = call.direction === 'incoming' && call.phase === 'ringing';
  const ended = call.phase === 'ended';

  // Drivers are often driving: a stray tap must not end the call. Declining a ringing call does not ask.
  const confirmEnd = () => {
    if (!isDriverApp) {
      hangUp();
      return;
    }
    Alert.alert('End call?', `Your call with ${call.otherName} will end.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End call', style: 'destructive', onPress: hangUp },
    ]);
  };

  return (
    <Modal animationType="fade" visible transparent={false} onRequestClose={incoming ? decline : confirmEnd} statusBarTranslucent>
      <View style={[styles.screen, { paddingTop: insets.top + 56, paddingBottom: insets.bottom + 40 }]}>
        <View style={styles.who}>
          <View style={styles.avatar}>
            <AppText variant="h1" color={theme.colors.white}>{call.otherName.charAt(0).toUpperCase()}</AppText>
          </View>
          <AppText variant="h1" color={theme.colors.white} numberOfLines={1}>{call.otherName}</AppText>
          <AppText variant="body" color="#C7CBD1">{status}</AppText>
          <AppText variant="bodySmall" color="#8A9099">Live call · Wheelers</AppText>
        </View>

        {ended ? <View style={styles.actions} /> : incoming ? (
          <View style={styles.actions}>
            <RoundButton label="Decline" tone="bad" onPress={decline} glyph="✕" />
            <RoundButton label="Answer" tone="good" onPress={() => void answer()} glyph="✆" />
          </View>
        ) : (
          <View style={styles.actions}>
            <RoundButton label={call.muted ? 'Muted' : 'Mute'} tone={call.muted ? 'on' : 'quiet'} onPress={toggleMute} glyph="🎙" />
            <RoundButton label="End" tone="bad" onPress={confirmEnd} glyph="✕" />
            <RoundButton label="Speaker" tone={call.speaker ? 'on' : 'quiet'} onPress={toggleSpeaker} glyph="🔊" />
          </View>
        )}
      </View>
    </Modal>
  );
}

function RoundButton({ label, tone, onPress, glyph }: { label: string; tone: 'good' | 'bad' | 'quiet' | 'on'; onPress: () => void; glyph: string }) {
  return (
    <Pressable accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <View style={[styles.circle, styles[tone]]}>
        <AppText variant="h2" color={tone === 'on' ? '#111418' : theme.colors.white}>{glyph}</AppText>
      </View>
      <AppText variant="bodySmall" color={theme.colors.white}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#111418',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  who: {
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: theme.colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    minHeight: 96,
  },
  button: {
    alignItems: 'center',
    gap: 8,
  },
  pressed: {
    opacity: 0.75,
  },
  circle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  good: { backgroundColor: '#16A34A' },
  bad: { backgroundColor: '#DC2626' },
  quiet: { backgroundColor: 'rgba(255,255,255,0.14)' },
  on: { backgroundColor: '#FFFFFF' },
});
