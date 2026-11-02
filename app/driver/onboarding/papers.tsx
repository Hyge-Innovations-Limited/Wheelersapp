import { Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { AppText } from '@/components/app-text';
import { NeedCard } from '@/components/driver-paper-need-card';
import { FlowHeader } from '@/components/flow-header';
import { getAccessTokenWithRetry } from '@/lib/access-token';
import { getDriverPapers, type DriverPaper, type DriverPapersResponse } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { papersError } from '@/lib/driver-papers';
import { papersStillToSend } from '@/lib/papers-gate';
import { useKycStep } from '@/lib/use-kyc-step';
import { theme } from '@/theme';

/**
 * The last sign-up step: the papers for the car. Each one is sent on its own
 * (the same screen as Your papers); the application cannot be sent until
 * every required paper is in.
 */
export default function SignUpPapersScreen() {
  const router = useRouter();
  const { getAccessToken } = useAuth();
  const step = useKycStep('papers');
  const [papers, setPapers] = useState<DriverPapersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const token = await getAccessTokenWithRetry(getAccessToken);
      if (!token) throw new Error('Please sign in again to see your papers.');
      setPapers(await getDriverPapers({ accessToken: token }));
      setError(null);
    } catch (e) {
      setError(papersError(e, 'Could not load your papers. Please try again.'));
    }
  }, [getAccessToken]);

  // Coming back from sending a paper shows it at once.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const open = (paper: DriverPaper) =>
    router.push(`/driver/doc-upload?type=${encodeURIComponent(paper.type)}&from=signup` as Href);

  const missing = papers ? papersStillToSend(papers) : null;
  const ready = missing !== null && missing.length === 0;

  return (
    <AppScreen scroll contentStyle={styles.container}>
      <FlowHeader title="Car papers" subtitle="A photo or PDF of each" showBack progress={step.progress} />

      {!papers && !error ? <ActivityIndicator color={theme.colors.orange} style={styles.loading} /> : null}
      {error && !papers ? (
        <View style={styles.errorBox}>
          <AppText variant="bodySmall" color={theme.colors.danger}>{error}</AppText>
          <AppButton title="Try again" variant="ghost" onPress={() => void load()} />
        </View>
      ) : null}

      {papers ? (
        <View style={styles.list}>
          {papers.needs.map((need) => <NeedCard key={need.key} need={need} onOpen={open} />)}
        </View>
      ) : null}

      <View style={styles.spacer} />

      {missing && missing.length > 0 ? (
        <AppText variant="bodySmall" color={theme.colors.muted} style={styles.reason}>
          Still to send: {missing.join(', ')}
        </AppText>
      ) : null}
      <AppButton title={step.buttonTitle} onPress={() => void step.go()} disabled={!ready} loading={step.submitting} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: theme.spacing.xxxl, gap: theme.spacing.md },
  loading: { marginTop: theme.spacing.xxl },
  errorBox: { gap: theme.spacing.sm, marginTop: theme.spacing.lg },
  list: { gap: theme.spacing.md, marginTop: theme.spacing.md },
  spacer: { flexGrow: 1, minHeight: theme.spacing.xl },
  reason: { textAlign: 'center' },
});
