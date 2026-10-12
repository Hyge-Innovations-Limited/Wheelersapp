import { useRef, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import { AppButton } from "@/components/app-button";
import { AppInput } from "@/components/app-input";
import { AppScreen } from "@/components/app-screen";
import { FlowHeader } from "@/components/flow-header";
import { getAccessTokenWithRetry } from "@/lib/access-token";
import { useAuth } from "@/lib/auth";
import { dayToIso, isPast, isoToDay, maskDay } from "@/lib/day-input";
import { useDriverOnboarding } from "@/lib/driver-onboarding";
import { addReferralAtSignUp, tidyReferralCode } from "@/lib/referral-entry";
import { useResponsive } from "@/lib/responsive";
import { useKycStep } from "@/lib/use-kyc-step";
import { theme } from "@/theme";

/**
 * Right after the licence is photographed: the driver's name as it is on it,
 * its number, and the day it expires. Typed once here; changed later from
 * Your papers. A referral code from whoever brought them can go in too.
 */
export default function YourDetailsScreen() {
  const responsive = useResponsive();
  const { data, setLegalDetails } = useDriverOnboarding();
  const step = useKycStep("details");
  const { getAccessToken } = useAuth();
  const [name, setName] = useState(data.legalDetails?.legalName ?? "");
  const [licence, setLicence] = useState(data.legalDetails?.licenceNumber ?? "");
  const [expires, setExpires] = useState(isoToDay(data.legalDetails?.licenceExpiresOn));
  const licenceRef = useRef<TextInput>(null);
  const expiresRef = useRef<TextInput>(null);
  const referralRef = useRef<TextInput>(null);
  const [referral, setReferral] = useState("");
  const [referralError, setReferralError] = useState<string | undefined>(undefined);
  const [addingReferral, setAddingReferral] = useState(false);

  const cleanName = name.replace(/\s+/g, " ").trim();
  const cleanLicence = licence.replace(/\s+/g, "").toUpperCase();
  const expiresIso = dayToIso(expires);

  const nameError = cleanName.length >= 3 && !cleanName.includes(" ") ? "Your full name: first name and surname." : undefined;
  const licenceError = cleanLicence.length > 0 && !/^[A-Z0-9]*$/.test(cleanLicence) ? "Letters and numbers only." : undefined;
  const expiresError = expires.length < 10
    ? undefined
    : !expiresIso ? "That is not a real date. Use day/month/year, e.g. 31/12/2027."
      : isPast(expiresIso) ? "That licence has expired. Renew it before you apply." : undefined;
  const valid = cleanName.length >= 5 && cleanName.includes(" ") && /^[\p{L}][\p{L} .'’-]*$/u.test(cleanName)
    && /^[A-Z0-9]{6,20}$/.test(cleanLicence) && expiresIso !== null && !isPast(expiresIso);

  async function handleContinue() {
    if (!valid || !expiresIso || addingReferral) return;
    if (referral) {
      // A refused code is theirs to fix or clear; an empty box never holds them up.
      setAddingReferral(true);
      try {
        const accessToken = await getAccessTokenWithRetry(getAccessToken);
        const refused = accessToken
          ? await addReferralAtSignUp(accessToken, referral)
          : "Sign in again to add a referral code, or leave this empty.";
        if (refused) {
          setReferralError(refused);
          return;
        }
      } finally {
        setAddingReferral(false);
      }
    }
    const details = { legalName: cleanName, licenceNumber: cleanLicence, licenceExpiresOn: expiresIso };
    setLegalDetails(details);
    void step.go({ legalDetails: details });
  }

  return (
    <AppScreen scroll contentStyle={styles.container} keyboardOffset={theme.spacing.lg}>
      <FlowHeader
        title="Your details"
        subtitle="Exactly as they are on the licence you just added"
        showBack
        progress={step.progress}
      />

      <View style={[styles.form, { marginTop: responsive.scale(28), gap: responsive.scale(16) }]}>
        <AppInput
          label="Full name"
          hint="First name and surname, as on your licence"
          placeholder="e.g. Adebayo Tunde Okafor"
          value={name}
          onChangeText={setName}
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
          onChangeText={(text) => setLicence(text.toUpperCase())}
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
          onChangeText={(text) => setExpires(maskDay(text))}
          keyboardType="number-pad"
          maxLength={10}
          returnKeyType="done"
          error={expiresError}
        />
        <AppInput
          ref={referralRef}
          label="Referral code (optional)"
          hint="From whoever told you about Wheelers"
          value={referral}
          onChangeText={(text) => {
            setReferral(tidyReferralCode(text));
            setReferralError(undefined);
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={12}
          returnKeyType="done"
          onSubmitEditing={() => void handleContinue()}
          error={referralError}
        />
      </View>

      <View style={styles.spacer} />

      <AppButton
        title={step.buttonTitle}
        onPress={() => void handleContinue()}
        disabled={!valid}
        loading={step.submitting || addingReferral}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: theme.spacing.xxxl,
  },
  form: {
    width: "100%",
  },
  spacer: {
    flexGrow: 1,
    minHeight: theme.spacing.xxl,
  },
});
