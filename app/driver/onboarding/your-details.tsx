import { useRef, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import { AppButton } from "@/components/app-button";
import { AppInput } from "@/components/app-input";
import { AppScreen } from "@/components/app-screen";
import { FlowHeader } from "@/components/flow-header";
import { getAccessTokenWithRetry } from "@/lib/access-token";
import { useAuth } from "@/lib/auth";
import { useDriverOnboarding } from "@/lib/driver-onboarding";
import { addReferralAtSignUp, tidyReferralCode } from "@/lib/referral-entry";
import { useResponsive } from "@/lib/responsive";
import { useKycStep } from "@/lib/use-kyc-step";
import { theme } from "@/theme";

/**
 * Right after the licence is photographed: the driver's name as it is on it.
 * A referral code from whoever brought them can go in too.
 */
export default function YourDetailsScreen() {
  const responsive = useResponsive();
  const { data, setLegalDetails } = useDriverOnboarding();
  const step = useKycStep("details");
  const { getAccessToken } = useAuth();
  const [name, setName] = useState(data.legalDetails?.legalName ?? "");
  const referralRef = useRef<TextInput>(null);
  const [referral, setReferral] = useState("");
  const [referralError, setReferralError] = useState<string | undefined>(undefined);
  const [addingReferral, setAddingReferral] = useState(false);

  const cleanName = name.replace(/\s+/g, " ").trim();

  const nameError = cleanName.length >= 3 && !cleanName.includes(" ") ? "Your full name: first name and surname." : undefined;
  const valid = cleanName.length >= 5 && cleanName.includes(" ") && /^[\p{L}][\p{L} .'’-]*$/u.test(cleanName);

  async function handleContinue() {
    if (!valid || addingReferral) return;
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
    const details = { legalName: cleanName };
    setLegalDetails(details);
    void step.go({ legalDetails: details });
  }

  return (
    <AppScreen scroll contentStyle={styles.container} keyboardOffset={theme.spacing.lg}>
      <FlowHeader
        title="Your details"
        subtitle="As on your licence"
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
          onSubmitEditing={() => referralRef.current?.focus()}
          submitBehavior="submit"
          error={nameError}
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
