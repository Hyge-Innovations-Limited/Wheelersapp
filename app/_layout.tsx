import "fast-text-encoding";
import "react-native-reanimated";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { Text, TextInput } from "react-native";

// Cap Dynamic Type scaling globally so layouts don't break on devices
// with large accessibility text (especially smaller screens like iPhone 14).
(Text as any).defaultProps = {
  ...(Text as any).defaultProps,
  maxFontSizeMultiplier: 1.2,
};
(TextInput as any).defaultProps = {
  ...(TextInput as any).defaultProps,
  maxFontSizeMultiplier: 1.2,
};

import { AppLockOverlay, AppLockProvider } from "@/lib/app-lock";
import { AuthProvider, useAuth } from "@/lib/auth";
import { LocationProvider } from "@/lib/location";
import { AppNotificationsProvider } from "@/lib/notifications";
import { InterstateRequestsProvider } from "@/lib/interstate-requests-context";
import { QuestBadgeProvider } from "@/lib/quest-badge-context";
import { RideSessionProvider } from "@/lib/ride-session";
import { ThemeProvider, useAppTheme } from "@/lib/theme-context";
import { useOtaUpdates } from "@/lib/ota-updates";
import { theme } from "@/theme";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded] = useFonts({
    ClashDisplay_400Regular: require("../assets/fonts/ClashDisplay-Regular.ttf"),
    ClashDisplay_500Medium: require("../assets/fonts/ClashDisplay-Medium.ttf"),
    ClashDisplay_600Semibold: require("../assets/fonts/ClashDisplay-Semibold.ttf"),
    ClashDisplay_700Bold: require("../assets/fonts/ClashDisplay-Bold.ttf"),
    Shrikhand_400Regular: require("../assets/fonts/Shrikhand-Regular.ttf"),
  });

  if (!loaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AuthProvider>
          <LocationProvider>
            <RideSessionProvider>
              <AppNotificationsProvider>
                <QuestBadgeProvider>
                  <InterstateRequestsProvider>
                  <AppLockProvider>
                    <ThemedLayout />
                    <AuthAppLockOverlay />
                  </AppLockProvider>
                  </InterstateRequestsProvider>
                </QuestBadgeProvider>
              </AppNotificationsProvider>
            </RideSessionProvider>
          </LocationProvider>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

function ThemedLayout() {
  const { isDark } = useAppTheme();
  useOtaUpdates();

  return (
    <>
      <StatusBar
        style={isDark ? "light" : "dark"}
        backgroundColor={isDark ? theme.colors.black : theme.colors.offWhite}
      />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: isDark
              ? theme.colors.black
              : theme.colors.offWhite,
          },
          animation: "slide_from_right",
        }}
      />
    </>
  );
}

function AuthAppLockOverlay() {
  const { logout } = useAuth();

  return <AppLockOverlay onForgotPin={logout} />;
}
