import { useRouter } from "expo-router";
import { StyleSheet } from "react-native";

import { AppScreen } from "@/components/app-screen";
import { FlowHeader } from "@/components/flow-header";
import { PhoneVerify } from "@/components/phone-verify";
import { theme } from "@/theme";

/** For a driver already signed up: prove (or change) their phone number, from Your papers. */
export default function VerifyPhoneScreen() {
  const router = useRouter();
  return (
    <AppScreen scroll contentStyle={styles.container} keyboardOffset={theme.spacing.lg}>
      <FlowHeader
        title="Your phone number"
        subtitle="Riders reach you on this number. We send a code to make sure it is yours."
        showBack
        backHref="/driver/docs"
      />
      <PhoneVerify onVerified={() => undefined} doneTitle="Done" onDone={() => router.back()} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: theme.spacing.xxxl, gap: theme.spacing.xl, flexGrow: 1 },
});
