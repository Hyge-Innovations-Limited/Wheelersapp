import { openPrivacy, openTerms } from '@/lib/legal-links';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Href, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

import { AppScreen } from '@/components/app-screen';
import { AppText, OnLight } from '@/components/app-text';
import { useNearbyAlerts } from '@/components/nearby-alerts';
import { useRideBubbleSetting, useRideOverlaySetting } from '@/lib/ride-overlay';
import { useAuth } from '@/lib/auth';
import { getAccessTokenWithRetry } from '@/lib/access-token';
import { deleteAccount } from '@/lib/api';
import { isMockLocationAvailable, nextMockLocationPreset } from '@/lib/dev-mock-location';
import {
  MAX_PICKUP_STEPS,
  MIN_FARE_STEPS,
  getDriverFilters,
  loadDriverFilters,
  nextStep,
  setDriverFilters,
  subscribeDriverFilters,
} from '@/lib/driver-filters';
import { useDriverSession } from '@/lib/driver-session';
import { useAppLocation } from '@/lib/location';
import { useResponsive } from '@/lib/responsive';
import { useAppTheme } from '@/lib/theme-context';
import { theme } from '@/theme';
import { toUserMessage } from '@/lib/error-messages';

const APP_VERSION = '1.0.0';

// ── Icons ─────────────────────────────────────────────

function UserIcon({ size = 20, color = theme.colors.black }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <Circle cx="12" cy="7" r="4" />
    </Svg>
  );
}

function PapersIcon({ size = 20, color = theme.colors.black }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <Polyline points="14 3 14 8 19 8" />
      <Line x1="9" y1="13" x2="15" y2="13" />
      <Line x1="9" y1="17" x2="13" y2="17" />
    </Svg>
  );
}

function PaletteIcon({ size = 20, color = theme.colors.black }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="10" />
      <Circle cx="12" cy="8" r="1.5" fill={color} />
      <Circle cx="8.5" cy="13" r="1.5" fill={color} />
      <Circle cx="15.5" cy="13" r="1.5" fill={color} />
    </Svg>
  );
}

function HeadphonesIcon({ size = 20, color = theme.colors.black }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <Path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3v5z" />
      <Path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3v5z" />
    </Svg>
  );
}

function InfoIcon({ size = 20, color = theme.colors.black }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="10" />
      <Line x1="12" y1="16" x2="12" y2="12" />
      <Line x1="12" y1="8" x2="12.01" y2="8" />
    </Svg>
  );
}

function LogoutIcon({ size = 20, color = theme.colors.black }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <Polyline points="16 17 21 12 16 7" />
      <Line x1="21" y1="12" x2="9" y2="12" />
    </Svg>
  );
}

function TrashIcon({ size = 20, color = theme.colors.danger }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="3 6 5 6 21 6" />
      <Path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <Path d="M10 11v6" />
      <Path d="M14 11v6" />
      <Path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </Svg>
  );
}

function ChevronRightIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={theme.colors.mutedLight} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="9 18 15 12 9 6" />
    </Svg>
  );
}

// ── Component ─────────────────────────────────────────

export default function DriverSettingsScreen() {
  const router = useRouter();
  const { mockLocation, setMockLocation } = useAppLocation();
  const [filters, setFilters] = useState(getDriverFilters());
  useEffect(() => {
    void loadDriverFilters().then(setFilters);
    return subscribeDriverFilters(setFilters);
  }, []);
  const { getAccessToken, logout } = useAuth();
  const { isDark, toggleTheme } = useAppTheme();
  const { session } = useDriverSession();
  const nearbyAlerts = useNearbyAlerts(getAccessToken, session.status !== 'offline');
  const overlaySetting = useRideOverlaySetting();
  const bubbleSetting = useRideBubbleSetting();
  const responsive = useResponsive();

  const handleLogout = () => {
    Alert.alert(
      'Log out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log out',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/driver-auth' as Href);
          },
        },
      ],
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete account',
      'This will permanently delete your account and all your data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const accessToken = await getAccessTokenWithRetry(getAccessToken);
              if (!accessToken) throw new Error('Not authenticated');
              await deleteAccount({ accessToken });
              await logout();
              router.replace('/driver-auth' as Href);
            } catch (err) {
              Alert.alert(
                'Error',
                toUserMessage(err, 'Could not delete account. Please try again.'),
              );
            }
          },
        },
      ],
    );
  };

  // Our own support, in the app, as riders have it: the team sees the
  // conversation in admin with the driver's account beside it.
  const handleContactSupport = () => {
    router.push({ pathname: '/support/help-center', params: { who: 'driver' } } as Href);
  };

  const cardBg = isDark ? theme.colors.darkSurface : theme.colors.white;
  const subtleBg = isDark ? theme.colors.darkSurfaceSoft : '#F0EDE8';
  const pressedBg = isDark ? theme.colors.darkSurfaceSoft : theme.colors.offWhite;
  const dividerColor = isDark ? theme.colors.darkBorder : theme.colors.borderLight;

  // Row metrics scale together so the divider stays aligned to the text column
  // instead of the old hard-coded 66pt inset.
  const iconSize = responsive.scale(36);
  const rowGap = responsive.scale(14);
  const rowPaddingH = responsive.scale(16);
  const glyphSize = responsive.scale(18);
  const menuIconStyle = { width: iconSize, height: iconSize };
  const menuItemStyle = {
    gap: rowGap,
    paddingHorizontal: rowPaddingH,
    paddingVertical: responsive.scale(14),
  };
  const dividerInset = { marginLeft: rowPaddingH + iconSize + rowGap };

  return (
    <AppScreen
      scroll
      // The tab bar owns the bottom inset; claiming it again would leave a gap.
      safeAreaEdges={['top', 'left', 'right']}
      contentStyle={styles.container}>
      <AppText variant="h1" numberOfLines={1}>Settings</AppText>

      {/* ── Account section ── */}
      <View style={styles.section}>
        <AppText
          variant="label"
          color={theme.colors.muted}
          style={[styles.sectionLabel, { fontSize: responsive.font(10) }]}
          numberOfLines={1}>
          ACCOUNT
        </AppText>
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <Pressable
            onPress={() => router.push('/driver/profile' as Href)}
            style={({ pressed }) => [styles.menuItem, menuItemStyle, pressed && { backgroundColor: pressedBg }]}
          >
            <View style={[styles.menuIcon, menuIconStyle, { backgroundColor: theme.colors.orangeLight }]}>
              <OnLight>
              <UserIcon color={theme.colors.orange} size={glyphSize} />
              </OnLight>
            </View>
            <View style={styles.menuInfo}>
              <AppText variant="bodyMedium">Profile</AppText>
              <AppText variant="bodySmall" color={theme.colors.muted}>Manage your personal info</AppText>
            </View>
            <ChevronRightIcon size={responsive.scale(18)} />
          </Pressable>
          <View style={[styles.menuDivider, dividerInset, { borderBottomColor: dividerColor }]} />
          <Pressable
            onPress={() => router.push('/driver/docs' as Href)}
            style={({ pressed }) => [styles.menuItem, menuItemStyle, pressed && { backgroundColor: pressedBg }]}
          >
            <View style={[styles.menuIcon, menuIconStyle, { backgroundColor: theme.colors.orangeLight }]}>
              <OnLight>
              <PapersIcon color={theme.colors.orange} size={glyphSize} />
              </OnLight>
            </View>
            <View style={styles.menuInfo}>
              <AppText variant="bodyMedium">Your papers</AppText>
              <AppText variant="bodySmall" color={theme.colors.muted}>Licence details and your car&apos;s papers</AppText>
            </View>
            <ChevronRightIcon size={responsive.scale(18)} />
          </Pressable>
          <View style={[styles.menuDivider, dividerInset, { borderBottomColor: dividerColor }]} />
          <Pressable
            onPress={() => router.push('/growth/referral' as Href)}
            style={({ pressed }) => [styles.menuItem, menuItemStyle, pressed && { backgroundColor: pressedBg }]}
          >
            <View style={[styles.menuIcon, menuIconStyle, { backgroundColor: theme.colors.orangeLight }]}>
              <OnLight>
              <MaterialIcons color={theme.colors.orange} name="qr-code-2" size={glyphSize} />
              </OnLight>
            </View>
            <View style={styles.menuInfo}>
              <AppText variant="bodyMedium">Refer drivers and riders</AppText>
              <AppText variant="bodySmall" color={theme.colors.muted}>Your QR code, link and referral code</AppText>
            </View>
            <ChevronRightIcon size={responsive.scale(18)} />
          </Pressable>
          <View style={[styles.menuDivider, dividerInset, { borderBottomColor: dividerColor }]} />
          <Pressable
            accessibilityRole="link"
            onPress={openTerms}
            style={({ pressed }) => [styles.menuItem, menuItemStyle, pressed && { backgroundColor: pressedBg }]}
          >
            <View style={[styles.menuIcon, menuIconStyle, { backgroundColor: theme.colors.orangeLight }]}>
              <OnLight>
              <MaterialIcons color={theme.colors.orange} name="description" size={glyphSize} />
              </OnLight>
            </View>
            <View style={styles.menuInfo}>
              <AppText variant="bodyMedium">Terms of Service</AppText>
              <AppText variant="bodySmall" color={theme.colors.muted}>The terms for driving with Wheelers</AppText>
            </View>
            <ChevronRightIcon size={responsive.scale(18)} />
          </Pressable>
          <View style={[styles.menuDivider, dividerInset, { borderBottomColor: dividerColor }]} />
          <Pressable
            accessibilityRole="link"
            onPress={openPrivacy}
            style={({ pressed }) => [styles.menuItem, menuItemStyle, pressed && { backgroundColor: pressedBg }]}
          >
            <View style={[styles.menuIcon, menuIconStyle, { backgroundColor: theme.colors.orangeLight }]}>
              <OnLight>
              <MaterialIcons color={theme.colors.orange} name="lock-outline" size={glyphSize} />
              </OnLight>
            </View>
            <View style={styles.menuInfo}>
              <AppText variant="bodyMedium">Privacy Policy</AppText>
              <AppText variant="bodySmall" color={theme.colors.muted}>How Wheelers handles your data</AppText>
            </View>
            <ChevronRightIcon size={responsive.scale(18)} />
          </Pressable>
        </View>
      </View>

      {/* ── Appearance section ── */}
      <View style={styles.section}>
        <AppText
          variant="label"
          color={theme.colors.muted}
          style={[styles.sectionLabel, { fontSize: responsive.font(10) }]}
          numberOfLines={1}>
          APPEARANCE
        </AppText>
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <View style={[styles.menuItem, menuItemStyle]}>
            <View style={[styles.menuIcon, menuIconStyle, { backgroundColor: subtleBg }]}>
              <PaletteIcon color={theme.colors.muted} size={glyphSize} />
            </View>
            <View style={styles.menuInfo}>
              <AppText variant="bodyMedium">Dark mode</AppText>
              <AppText variant="bodySmall" color={theme.colors.muted}>
                {isDark ? 'On' : 'Off'}
              </AppText>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: theme.colors.borderLight, true: theme.colors.orange }}
              thumbColor={theme.colors.white}
            />
          </View>
        </View>
      </View>

      {/* ── Support section ── */}
      <View style={styles.section}>
        <AppText
          variant="label"
          color={theme.colors.muted}
          style={[styles.sectionLabel, { fontSize: responsive.font(10) }]}
          numberOfLines={1}>
          SUPPORT
        </AppText>
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <Pressable
            onPress={handleContactSupport}
            style={({ pressed }) => [styles.menuItem, menuItemStyle, pressed && { backgroundColor: pressedBg }]}
          >
            <View style={[styles.menuIcon, menuIconStyle, { backgroundColor: theme.colors.orangeLight }]}>
              <OnLight>
              <HeadphonesIcon color={theme.colors.orange} size={glyphSize} />
              </OnLight>
            </View>
            <View style={styles.menuInfo}>
              <AppText variant="bodyMedium">Customer support</AppText>
              <AppText variant="bodySmall" color={theme.colors.muted}>Chat with the Wheelers team in the app</AppText>
            </View>
            <ChevronRightIcon size={responsive.scale(18)} />
          </Pressable>
        </View>
      </View>

      {/* ── Requests section: the driver's bar for what rings the phone ── */}
      <View style={styles.section}>
        <AppText
          variant="label"
          color={theme.colors.muted}
          style={[styles.sectionLabel, { fontSize: responsive.font(10) }]}
          numberOfLines={1}>
          RIDE REQUESTS
        </AppText>
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <Pressable
            onPress={() => setDriverFilters({ minFareNgn: nextStep(MIN_FARE_STEPS, filters.minFareNgn) })}
            style={({ pressed }) => [styles.menuItem, menuItemStyle, pressed && { backgroundColor: pressedBg }]}
          >
            <View style={[styles.menuIcon, menuIconStyle, { backgroundColor: filters.minFareNgn ? theme.colors.orangeLight : subtleBg }]}>
              <AppText variant="label" color={filters.minFareNgn ? theme.colors.orange : theme.colors.muted}>₦</AppText>
            </View>
            <View style={styles.menuInfo}>
              <AppText variant="bodyMedium">Minimum fare</AppText>
              <AppText variant="bodySmall" color={theme.colors.muted}>
                {filters.minFareNgn
                  ? `Hide requests under ₦${filters.minFareNgn.toLocaleString()} — tap to change`
                  : 'Off — showing every fare. Tap to set a floor'}
              </AppText>
            </View>
            <ChevronRightIcon size={responsive.scale(18)} />
          </Pressable>
          <Pressable
            onPress={() => setDriverFilters({ maxPickupKm: nextStep(MAX_PICKUP_STEPS, filters.maxPickupKm) })}
            style={({ pressed }) => [styles.menuItem, menuItemStyle, pressed && { backgroundColor: pressedBg }]}
          >
            <View style={[styles.menuIcon, menuIconStyle, { backgroundColor: filters.maxPickupKm ? theme.colors.orangeLight : subtleBg }]}>
              <AppText variant="label" color={filters.maxPickupKm ? theme.colors.orange : theme.colors.muted}>◎</AppText>
            </View>
            <View style={styles.menuInfo}>
              <AppText variant="bodyMedium">Pickup distance</AppText>
              <AppText variant="bodySmall" color={theme.colors.muted}>
                {filters.maxPickupKm
                  ? `Only pickups within ${filters.maxPickupKm} km — tap to change`
                  : 'Off — any distance. Tap to set a limit'}
              </AppText>
            </View>
            <ChevronRightIcon size={responsive.scale(18)} />
          </Pressable>
        </View>
      </View>

      {/* ── Nearby ride alerts: off-shift location, strictly opt-in ── */}
      {nearbyAlerts.supported ? (
        <View style={styles.section}>
          <AppText
            variant="label"
            color={theme.colors.muted}
            style={[styles.sectionLabel, { fontSize: responsive.font(10) }]}
            numberOfLines={1}>
            LOCATION
          </AppText>
          <View style={[styles.card, { backgroundColor: cardBg }]}>
            <View style={[styles.menuItem, menuItemStyle]}>
              <View style={[styles.menuIcon, menuIconStyle, { backgroundColor: nearbyAlerts.enabled ? theme.colors.orangeLight : subtleBg }]}>
                <AppText variant="label" color={nearbyAlerts.enabled ? theme.colors.orange : theme.colors.muted}>◎</AppText>
              </View>
              <View style={styles.menuInfo}>
                <AppText variant="bodyMedium">Nearby ride alerts</AppText>
                <AppText variant="bodySmall" color={theme.colors.muted}>
                  {nearbyAlerts.enabled
                    ? "On — we see your rough location while you're offline so we can tell you about riders close by"
                    : "Off — we only see your location while you're online"}
                </AppText>
              </View>
              <Switch
                value={nearbyAlerts.enabled}
                onValueChange={nearbyAlerts.toggle}
                disabled={nearbyAlerts.busy}
                trackColor={{ false: theme.colors.borderLight, true: theme.colors.orange }}
                thumbColor={theme.colors.white}
              />
            </View>
          </View>
        </View>
      ) : null}

      {/* ── Requests over other apps: Android's own switch, opened from here ── */}
      {overlaySetting.supported ? (
        <View style={styles.section}>
          <AppText
            variant="label"
            color={theme.colors.muted}
            style={[styles.sectionLabel, { fontSize: responsive.font(10) }]}
            numberOfLines={1}>
            RIDE REQUESTS
          </AppText>
          <View style={[styles.card, { backgroundColor: cardBg }]}>
            <View style={[styles.menuItem, menuItemStyle]}>
              <View style={[styles.menuIcon, menuIconStyle, { backgroundColor: overlaySetting.allowed ? theme.colors.orangeLight : subtleBg }]}>
                <AppText variant="label" color={overlaySetting.allowed ? theme.colors.orange : theme.colors.muted}>▣</AppText>
              </View>
              <View style={styles.menuInfo}>
                <AppText variant="bodyMedium">Show requests over other apps</AppText>
                <AppText variant="bodySmall" color={theme.colors.muted}>
                  {overlaySetting.allowed
                    ? 'On — a new request pops up with Accept while you are in WhatsApp, Maps or any app'
                    : 'Off — you only see requests inside Wheelers'}
                </AppText>
              </View>
              <Switch
                value={overlaySetting.allowed}
                onValueChange={overlaySetting.change}
                trackColor={{ false: theme.colors.borderLight, true: theme.colors.orange }}
                thumbColor={theme.colors.white}
              />
            </View>
            {/* The Wheelers bubble: needs the same permission; off here hides it everywhere. */}
            {bubbleSetting.supported ? (
              <View style={[styles.menuItem, menuItemStyle]}>
                <View style={[styles.menuIcon, menuIconStyle, { backgroundColor: bubbleSetting.on && overlaySetting.allowed ? theme.colors.orangeLight : subtleBg }]}>
                  <AppText variant="label" color={bubbleSetting.on && overlaySetting.allowed ? theme.colors.orange : theme.colors.muted}>●</AppText>
                </View>
                <View style={styles.menuInfo}>
                  <AppText variant="bodyMedium">Wheelers bubble</AppText>
                  <AppText variant="bodySmall" color={theme.colors.muted}>
                    {!overlaySetting.allowed
                      ? 'Needs "Show requests over other apps" on first'
                      : bubbleSetting.on
                        ? 'On — while you are online in another app, tap the Wheelers logo on the side to come back'
                        : 'Off'}
                  </AppText>
                </View>
                <Switch
                  value={bubbleSetting.on && overlaySetting.allowed}
                  disabled={!overlaySetting.allowed}
                  onValueChange={bubbleSetting.set}
                  trackColor={{ false: theme.colors.borderLight, true: theme.colors.orange }}
                  thumbColor={theme.colors.white}
                />
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* ── Developer section (dev builds only) ── */}
      {isMockLocationAvailable() ? (
        <View style={styles.section}>
          <AppText
            variant="label"
            color={theme.colors.muted}
            style={[styles.sectionLabel, { fontSize: responsive.font(10) }]}
            numberOfLines={1}>
            DEVELOPER
          </AppText>
          <View style={[styles.card, { backgroundColor: cardBg }]}>
            <Pressable
              onPress={() => void setMockLocation(nextMockLocationPreset(mockLocation))}
              onLongPress={() => void setMockLocation(null)}
              style={({ pressed }) => [styles.menuItem, menuItemStyle, pressed && { backgroundColor: pressedBg }]}
            >
              <View style={[styles.menuIcon, menuIconStyle, { backgroundColor: mockLocation ? theme.colors.orangeLight : subtleBg }]}>
                <AppText variant="label" color={mockLocation ? theme.colors.orange : theme.colors.muted}>◎</AppText>
              </View>
              <View style={styles.menuInfo}>
                <AppText variant="bodyMedium">Mock location</AppText>
                <AppText variant="bodySmall" color={theme.colors.muted}>
                  {mockLocation
                    ? `${mockLocation.label} — tap to cycle, hold to turn off`
                    : 'Off — simulators sit in Cupertino; tap to pin to Lagos'}
                </AppText>
              </View>
              <ChevronRightIcon size={responsive.scale(18)} />
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* ── About section ── */}
      <View style={styles.section}>
        <AppText
          variant="label"
          color={theme.colors.muted}
          style={[styles.sectionLabel, { fontSize: responsive.font(10) }]}
          numberOfLines={1}>
          ABOUT
        </AppText>
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <View style={[styles.menuItem, menuItemStyle]}>
            <View style={[styles.menuIcon, menuIconStyle, { backgroundColor: subtleBg }]}>
              <InfoIcon color={theme.colors.muted} size={glyphSize} />
            </View>
            <View style={styles.menuInfo}>
              <AppText variant="bodyMedium" numberOfLines={1}>App version</AppText>
            </View>
            <AppText variant="mono" color={theme.colors.muted} numberOfLines={1}>{APP_VERSION}</AppText>
          </View>
        </View>
      </View>

      {/* ── Danger zone ── */}
      <View style={styles.section}>
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <Pressable
            onPress={handleLogout}
            style={({ pressed }) => [styles.menuItem, menuItemStyle, pressed && { backgroundColor: pressedBg }]}
          >
            <View style={[styles.menuIcon, menuIconStyle, { backgroundColor: subtleBg }]}>
              <LogoutIcon color={isDark ? theme.colors.offWhite : theme.colors.black} size={glyphSize} />
            </View>
            <View style={styles.menuInfo}>
              <AppText variant="bodyMedium">Log out</AppText>
            </View>
            <ChevronRightIcon size={responsive.scale(18)} />
          </Pressable>

          <View style={[styles.menuDivider, dividerInset, { borderBottomColor: dividerColor }]} />

          <Pressable
            onPress={handleDeleteAccount}
            style={({ pressed }) => [styles.menuItem, menuItemStyle, pressed && { backgroundColor: pressedBg }]}
          >
            <View style={[styles.menuIcon, menuIconStyle, { backgroundColor: theme.colors.dangerLight }]}>
              <OnLight>
              <TrashIcon size={glyphSize} />
              </OnLight>
            </View>
            <View style={styles.menuInfo}>
              <AppText variant="bodyMedium" color={theme.colors.danger}>Delete account</AppText>
              <AppText variant="bodySmall" color={theme.colors.muted}>Permanently remove your data</AppText>
            </View>
            <ChevronRightIcon size={responsive.scale(18)} />
          </Pressable>
        </View>
      </View>

      <View style={styles.footer}>
        <AppText variant="bodySmall" color={theme.colors.mutedLight}>
          Wheelers v{APP_VERSION}
        </AppText>
      </View>
      {nearbyAlerts.sheet}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xxxl,
  },

  // Sections
  section: {
    gap: 8,
    marginTop: 16,
  },
  sectionLabel: {
    letterSpacing: 0.5,
    paddingHorizontal: 4,
  },

  // Card
  card: {
    borderRadius: theme.radii.md,
    overflow: 'hidden',
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.card,
  },

  // Menu item
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuIcon: {
    flexShrink: 0,
    borderRadius: theme.radii.xs,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  menuDivider: {
    height: 1,
    borderBottomWidth: 1,
  },

  // Footer
  footer: {
    alignItems: 'center',
    paddingTop: 24,
  },
});
