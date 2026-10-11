import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TextInput, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppInput } from '@/components/app-input';
import { AppScreen } from '@/components/app-screen';
import { FlowHeader } from '@/components/flow-header';
import { getAccessTokenWithRetry } from '@/lib/access-token';
import { ApiError, getDriverPapers, saveDriverDetails } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dayToIso, isPast, isoToDay, maskDay } from '@/lib/day-input';
import { papersError } from '@/lib/driver-papers';
import { useResponsive } from '@/lib/responsive';
import { theme } from '@/theme';

/**
 * The driver's name as it is on their licence, the licence's number and the
 * day it expires. Typed once; the form starts from what was saved, and the
 * server's own words are shown under the box they are about.
 */
export default function DriverLegalDetailsScreen() {
  const router = useRouter();
  const responsive = useResponsive();
  const { getAccessToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [licence, setLicence] = useState('');
  const [expires, setExpires] = useState('');
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<{ field: 'name' | 'licence' | 'expires'; text: string } | null>(null);
  const licenceRef = useRef<TextInput>(null);
  const expiresRef = useRef<TextInput>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const token = await getAccessTokenWithRetry(getAccessToken);
        if (!token) return;
        const { details } = await getDriverPapers({ accessToken: token });
        if (!active) return;
        setName(details.legalName ?? '');
        setLicence(details.licenceNumber ?? '');
        // An expired licence starts from an empty date: the old one is no use.
        setExpires(details.licenceExpired ? '' : isoToDay(details.licenceExpiresOn));
      } catch {
        // A blank form is still a form that works.
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [getAccessToken]);

  const cleanName = name.replace(/\s+/g, ' ').trim();
  const cleanLicence = licence.replace(/\s+/g, '').toUpperCase();
  const expiresIso = dayToIso(expires);

  const nameError = cleanName.length > 0 && cleanName.length >= 3 && !cleanName.includes(' ')
    ? 'Your full name: first name and surname.'
    : serverError?.field === 'name' ? serverError.text : undefined;
  const licenceError = cleanLicence.length > 0 && !/^[A-Z0-9]*$/.test(cleanLicence)
    ? 'Letters and numbers only.'
    : serverError?.field === 'licence' ? serverError.text : undefined;
  const expiresError = expires.length < 10
    ? (serverError?.field === 'expires' ? serverError.text : undefined)
    : !expiresIso ? 'That is not a real date. Use day/month/year, e.g. 31/12/2027.'
      : isPast(expiresIso) ? 'That licence has expired. Renew it, then enter the new date.' : undefined;
  const valid = cleanName.length >= 5 && cleanName.includes(' ') && /^[A-Z0-9]{6,20}$/.test(cleanLicence) && expiresIso !== null && !isPast(expiresIso);

  async function save() {
    if (!valid || saving || !expiresIso) return;
    setSaving(true);
    setServerError(null);
    try {
      const token = await getAccessTokenWithRetry(getAccessToken);
      if (!token) throw new Error('Please sign in again to save this.');
      await saveDriverDetails({ accessToken: token, legalName: cleanName, licenceNumber: cleanLicence, licenceExpiresOn: expiresIso });
      router.back();
    } catch (e) {
      const text = papersError(e, 'Your details were not saved. Please try again.');
      const code = e instanceof ApiError ? e.code : undefined;
      if (code === 'BAD_NAME') setServerError({ field: 'name', text });
      else if (code === 'BAD_LICENCE_NUMBER') setServerError({ field: 'licence', text });
      else if (code === 'BAD_DATE' || code === 'EXPIRED') setServerError({ field: 'expires', text });
      else Alert.alert('Not saved', text);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppScreen scroll contentStyle={styles.container} keyboardOffset={theme.spacing.lg}>
      <FlowHeader title="Your details" subtitle="Exactly as they are on your driver's licence" showBack backHref="/driver/docs" />

      {loading ? <ActivityIndicator color={theme.colors.orange} style={styles.loading} /> : (
        <View style={[styles.form, { marginTop: responsive.scale(24), gap: responsive.scale(16) }]}>
          <AppInput
            label="Full name"
            hint="First name and surname, as on your licence"
            placeholder="e.g. Adebayo Tunde Okafor"
            value={name}
            onChangeText={(text) => { setName(text); setServerError(null); }}
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={80}
            returnKeyType="next"
            onSubmitEditing={() => licenceRef.current?.focus()}
            submitBehavior="submit"
            error={nameError}
          />
          <AppInput
            ref={licenceRef}
            label="Licence number"
            placeholder="e.g. ABC12345DE67"
            value={licence}
            onChangeText={(text) => { setLicence(text.toUpperCase()); setServerError(null); }}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={24}
            returnKeyType="next"
            onSubmitEditing={() => expiresRef.current?.focus()}
            submitBehavior="submit"
            error={licenceError}
          />
          <AppInput
            ref={expiresRef}
            label="Licence expiry date"
            hint="Day/month/year"
            placeholder="DD/MM/YYYY"
            value={expires}
            onChangeText={(text) => { setExpires(maskDay(text)); setServerError(null); }}
            keyboardType="number-pad"
            maxLength={10}
            returnKeyType="done"
            onSubmitEditing={() => void save()}
            error={expiresError}
          />
        </View>
      )}

      <View style={styles.spacer} />
      <AppButton title="Save" onPress={() => void save()} disabled={!valid || loading} loading={saving} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: theme.spacing.xxxl },
  loading: { marginTop: theme.spacing.xxl },
  form: { width: '100%' },
  spacer: { flexGrow: 1, minHeight: theme.spacing.xxl },
});
