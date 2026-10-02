import { useRouter, type Href } from "expo-router";
import { Alert } from "react-native";

import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDriverOnboarding, type OnboardingData } from "@/lib/driver-onboarding";
import { KYC_STEP_ROUTES, kycProgress, nextKycStep, type KycStep } from "@/lib/kyc-steps";

/**
 * Where a verification step's button goes: the next step to walk, or, on the
 * last one, sending (the whole application, or only the fixes). In fix mode
 * a driver sent back for their licence sees one step and "Send for review".
 */
export function useKycStep(step: KycStep) {
  const router = useRouter();
  const { getAccessToken } = useAuth();
  const { data, submit, submitting } = useDriverOnboarding();
  const fixing = data.fixSteps !== null;
  const next = nextKycStep(step, data.fixSteps);

  async function go(latest?: Partial<OnboardingData>) {
    if (next) {
      router.push(KYC_STEP_ROUTES[next] as Href);
      return;
    }
    try {
      await submit(getAccessToken, latest);
      router.replace("/driver/onboarding/pending" as Href);
    } catch (error) {
      // Approved, or already under review, meanwhile: that screen says which.
      if (error instanceof ApiError && (error.code === "ALREADY_APPROVED" || error.code === "NOT_REJECTED")) {
        router.replace("/driver/onboarding/pending" as Href);
        return;
      }
      Alert.alert(
        "Could not send",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  }

  return {
    go,
    fixing,
    submitting,
    isLast: next === null,
    progress: kycProgress(step, data.fixSteps),
    buttonTitle: next ? "Continue" : fixing ? "Send for review" : "Submit for review",
  };
}
