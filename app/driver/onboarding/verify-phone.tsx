import { StyleSheet } from "react-native";

import { AppScreen } from "@/components/app-screen";
import { FlowHeader } from "@/components/flow-header";
import { PhoneVerify } from "@/components/phone-verify";
import { useDriverOnboarding } from "@/lib/driver-onboarding";
import { useKycStep } from "@/lib/use-kyc-step";
import { theme } from "@/theme";

/**
 * Sign-up, after the car's details: the driver's phone number, proved with a
 * code sent to it. They cannot go on to the next step until the code is in.
 */
export default function VerifyPhoneStep() {
  const step = useKycStep("phone");
  const { setPhoneVerified } = useDriverOnboarding();

  return (
    <AppScreen scroll contentStyle={styles.container} keyboardOffset={theme.spacing.lg}>
      <FlowHeader
        title="Your phone number"
        subtitle="Riders will reach you on this number. We send a code to make sure it is yours."
        showBack
        progress={step.progress}
      />
      <PhoneVerify
        onVerified={() => setPhoneVerified(true)}
        doneTitle={step.buttonTitle}
        onDone={() => void step.go({ phoneVerified: true })}
        doneLoading={step.submitting}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: theme.spacing.xxxl, gap: theme.spacing.xl, flexGrow: 1 },
});
