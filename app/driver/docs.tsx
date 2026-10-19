import { Ionicons } from '@expo/vector-icons';
import { Href, useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { AppText, OnLight } from '@/components/app-text';
import { BackArrow } from '@/components/back-arrow';
import { getAccessTokenWithRetry } from '@/lib/access-token';
import { getDriverPapers, getDriverPhone, type DriverPaper, type DriverPaperNeed, type DriverPapersResponse, type DriverPhoneStatus } from '@/lib/api';
import { localNumber } from '@/lib/countdown';
import { useAuth } from '@/lib/auth';
import { isoToWords } from '@/lib/day-input';
import { PAPER_STATE, needsAction, paperLine, papersError } from '@/lib/driver-papers';
import { theme } from '@/theme';

/**
 * Your papers: the driver's name as on the licence, and the papers for the
 * car. One row a paper, each saying where it stands; tap one to send it (or
 * send a new one). Where any one of a few papers will do (roadworthiness or
 * the VIO report; proof of ownership, the receipt or the owner's letter) the
 * card says so, and once one is in the others fold away.
 */
export default function DriverPapersScreen() {
  const router = useRouter();
  const { getAccessToken } = useAuth();
  const [papers, setPapers] = useState<DriverPapersResponse | null>(null);
  const [phone, setPhone] = useState<DriverPhoneStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await getAccessTokenWithRetry(getAccessToken);
      if (!token) throw new Error('Please sign in again to see your papers.');
      setPapers(await getDriverPapers({ accessToken: token }));
      setError(null);
      // The number's own row: when it cannot be read the row is simply left out.
      setPhone(await getDriverPhone({ accessToken: token }).catch(() => null));
    } catch (e) {
      setError(papersError(e, 'Could not load your papers. Please try again.'));
    }
  }, [getAccessToken]);

  // Coming back from sending a paper shows it at once.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const open = (paper: DriverPaper) => router.push(`/driver/doc-upload?type=${encodeURIComponent(paper.type)}` as Href);

  return (
    <AppScreen
      backgroundColor={theme.colors.offWhite}
      scroll
      contentStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={theme.colors.orange} />}>
      <StatusBar style="dark" backgroundColor={theme.colors.offWhite} />
      <View style={styles.headerRow}>
        <BackArrow />
        <View style={styles.headerCopy}>
          <AppText variant="screenTitle" numberOfLines={1}>Your papers</AppText>
          <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={2}>
            Your name as on your licence, and the papers for your car.
          </AppText>
        </View>
      </View>

      {!papers && !error ? <ActivityIndicator color={theme.colors.orange} style={styles.loading} /> : null}
      {error && !papers ? (
        <View style={styles.card}>
          <OnLight>
          <AppText variant="bodyMedium">We could not show your papers</AppText>
          <AppText variant="bodySmall" color={theme.colors.muted}>{error}</AppText>
          <AppButton title="Try again" variant="ghost" onPress={() => void load()} />
          </OnLight>
        </View>
      ) : null}

      {papers ? (
        <>
          {/* A refresh that failed keeps what was on screen and says so, instead of blanking the list. */}
          {error ? (
            <View style={[styles.summary, styles.summarySoon]}>
              <OnLight>
              <Ionicons name="cloud-offline-outline" size={22} color={theme.colors.danger} />
              <AppText variant="bodySmall" style={styles.flex}>{error} This may be out of date.</AppText>
              </OnLight>
            </View>
          ) : null}
          <View style={[styles.summary, papers.toDo === 0 ? styles.summaryDone : null]}>
            <OnLight>
            <Ionicons
              name={papers.toDo === 0 ? 'checkmark-circle' : 'document-text-outline'}
              size={22}
              color={papers.toDo === 0 ? theme.colors.green : theme.colors.orange}
            />
            <AppText variant="bodyMedium" style={styles.flex}>
              {papers.toDo === 0
                ? 'Everything we ask for is in.'
                : papers.toDo === 1 ? '1 thing still to send' : `${papers.toDo} things still to send`}
            </AppText>
            </OnLight>
          </View>
          {papers.blocked ? (
            <View style={[styles.summary, styles.summarySoon]}>
              <OnLight>
              <Ionicons name="lock-closed-outline" size={22} color={theme.colors.danger} />
              <AppText variant="bodySmall" style={styles.flex}>
                You cannot go online until what is marked Required below has been sent.
              </AppText>
              </OnLight>
            </View>
          ) : papers.requiredFrom && papers.toDo > 0 ? (
            <View style={styles.summary}>
              <OnLight>
              <Ionicons name="calendar-outline" size={22} color={theme.colors.orange} />
              <AppText variant="bodySmall" style={styles.flex}>
                From {isoToWords(papers.requiredFrom)} you will need these in to go online. Send them before then.
              </AppText>
              </OnLight>
            </View>
          ) : null}
          {papers.expiringSoon.length > 0 ? (
            <View style={[styles.summary, styles.summarySoon]}>
              <OnLight>
              <Ionicons name="calendar-outline" size={22} color={theme.colors.danger} />
              <AppText variant="bodySmall" style={styles.flex}>
                Expiring soon: {papers.expiringSoon.join(', ')}. Send the new one when you have it.
              </AppText>
              </OnLight>
            </View>
          ) : null}

          {/* ── the driver ── */}
          <AppText variant="label" color={theme.colors.muted} style={styles.sectionLabel}>ABOUT YOU</AppText>
          <Pressable
            onPress={() => router.push('/driver/legal-details' as Href)}
            style={({ pressed }) => [styles.card, styles.row, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Your name and licence details">
            <OnLight>
            <Ionicons
              name={papers.details.complete ? 'checkmark-circle' : 'person-circle-outline'}
              size={26}
              color={papers.details.complete ? theme.colors.green : papers.details.licenceExpired ? theme.colors.danger : theme.colors.muted}
            />
            <View style={styles.flex}>
              <AppText variant="bodyMedium" numberOfLines={1}>{papers.details.legalName ?? 'Your name and licence'}</AppText>
              <AppText variant="bodySmall" color={papers.details.licenceExpired ? theme.colors.danger : theme.colors.muted} numberOfLines={2}>
                {papers.details.licenceExpired
                  ? `Your licence expired ${isoToWords(papers.details.licenceExpiresOn)}. Enter the new date.`
                  : papers.details.complete
                    ? `Licence ${papers.details.licenceNumber} · valid to ${isoToWords(papers.details.licenceExpiresOn)}`
                    : 'Add your full name as on your licence, its number and expiry date'}
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.mutedLight} />
            </OnLight>
          </Pressable>

          {phone ? (
            <Pressable
              onPress={() => router.push('/driver/verify-phone' as Href)}
              style={({ pressed }) => [styles.card, styles.row, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={phone.verified ? 'Your phone number, verified' : 'Verify your phone number'}>
              <OnLight>
              <Ionicons name={phone.verified ? 'checkmark-circle' : 'call-outline'} size={26} color={phone.verified ? theme.colors.green : theme.colors.muted} />
              <View style={styles.flex}>
                <AppText variant="bodyMedium" numberOfLines={1}>{phone.verified ? localNumber(phone.phone) : 'Verify your phone number'}</AppText>
                <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={2}>
                  {phone.verified ? 'Verified. Riders reach you on this number.' : 'We text a code to your number to make sure it is yours'}
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.mutedLight} />
              </OnLight>
            </Pressable>
          ) : null}

          {/* ── the car ── */}
          <AppText variant="label" color={theme.colors.muted} style={styles.sectionLabel}>FOR YOUR CAR</AppText>
          {papers.needs.map((need) => <NeedCard key={need.key} need={need} onOpen={open} />)}

          <AppText variant="caption" color={theme.colors.muted} style={styles.footnote}>
            A photo or a PDF of each. We check them and tell you if one needs sending again.
          </AppText>
        </>
      ) : null}
    </AppScreen>
  );
}

function NeedCard({ need, onOpen }: { need: DriverPaperNeed; onOpen: (paper: DriverPaper) => void }) {
  const [showOthers, setShowOthers] = useState(false);
  const several = need.papers.length > 1;
  // Once one of them is in, that is the row; the others stay a tap away.
  const sent = need.papers.filter((p) => p.document);
  const unsent = need.papers.filter((p) => !p.document);
  const shown = several && sent.length > 0 && !showOthers ? sent : need.papers;

  return (
    <View style={styles.card}>
      <OnLight>
      {several ? (
        <View style={styles.needHead}>
          <AppText variant="bodyMedium" style={styles.flex} numberOfLines={2}>{need.label}</AppText>
          <Tag need={need} />
        </View>
      ) : null}
      {several && sent.length === 0 ? (
        <AppText variant="caption" color={theme.colors.muted}>Any ONE of these will do.</AppText>
      ) : null}
      {shown.map((paper, index) => {
        const state = paper.document?.state ?? 'missing';
        const look = PAPER_STATE[state];
        return (
          <Pressable
            key={paper.type}
            onPress={() => onOpen(paper)}
            style={({ pressed }) => [styles.row, index > 0 || several ? styles.rowDivided : null, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`${paper.label}. ${paperLine(paper)}`}>
            <Ionicons name={look.icon} size={24} color={look.color} />
            <View style={styles.flex}>
              <View style={styles.titleLine}>
                <AppText variant="bodyMedium" style={styles.flexShrink} numberOfLines={2}>{paper.label}</AppText>
                {!several ? <Tag need={need} /> : null}
              </View>
              <AppText variant="bodySmall" color={state === 'rejected' || state === 'expired' || paper.document?.expiringSoon ? theme.colors.danger : theme.colors.muted} numberOfLines={3}>
                {paperLine(paper)}
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.mutedLight} />
          </Pressable>
        );
      })}
      {several && sent.length > 0 && unsent.length > 0 ? (
        <Pressable onPress={() => setShowOthers((was) => !was)} hitSlop={8} style={styles.others}>
          <AppText variant="caption" color={theme.colors.muted}>
            {showOthers ? 'Hide the others' : `Send a different one instead (${unsent.map((p) => p.label).join(', ')})`}
          </AppText>
        </Pressable>
      ) : null}
      </OnLight>
    </View>
  );
}

/** "Required" until something good is in for it; optional papers say so. */
function Tag({ need }: { need: DriverPaperNeed }) {
  if (!need.required) return <View style={[styles.tag, styles.tagQuiet]}>
    <OnLight><AppText variant="caption" color={theme.colors.muted}>Optional</AppText>
    </OnLight>
  </View>;
  if (!needsAction(need)) return null;
  return <View style={styles.tag}>
    <OnLight><AppText variant="caption" color={theme.colors.orange}>Required</AppText>
    </OnLight>
  </View>;
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  loading: { marginTop: theme.spacing.xxl },
  flex: { flex: 1, minWidth: 0 },
  flexShrink: { flexShrink: 1 },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.orange,
    backgroundColor: theme.colors.orangeLight,
  },
  summaryDone: { borderColor: theme.colors.green, backgroundColor: theme.colors.white },
  summarySoon: { borderColor: theme.colors.danger, backgroundColor: theme.colors.dangerLight },
  sectionLabel: { marginTop: theme.spacing.sm },
  card: {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.white,
  },
  needHead: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, minHeight: 48 },
  rowDivided: { paddingTop: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.colors.borderLight },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  pressed: { opacity: 0.6 },
  tag: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.orangeLight,
  },
  tagQuiet: { backgroundColor: theme.colors.offWhite },
  others: { paddingTop: theme.spacing.xs },
  footnote: { textAlign: 'center', marginTop: theme.spacing.sm },
});
