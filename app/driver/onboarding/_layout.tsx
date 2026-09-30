import { Stack, useSegments } from "expo-router";
import { useEffect } from "react";
import { BackHandler } from "react-native";

import { DriverOnboardingProvider } from "@/lib/driver-onboarding";

/** The first step and "Under review" are the floor: nothing behind them to go back to. */
const NO_WAY_BACK = new Set(["welcome", "pending"]);

export default function OnboardingLayout() {
  const segments = useSegments() as string[];
  const screen = segments[2];

  // Android's back button cannot take an unverified driver out of verification.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => NO_WAY_BACK.has(screen ?? ""));
    return () => sub.remove();
  }, [screen]);

  return (
    <DriverOnboardingProvider>
      <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
        <Stack.Screen name="welcome" options={{ gestureEnabled: false }} />
        <Stack.Screen name="pending" options={{ gestureEnabled: false }} />
      </Stack>
    </DriverOnboardingProvider>
  );
}
