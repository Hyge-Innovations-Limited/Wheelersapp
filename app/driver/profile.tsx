import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

import { AppScreen } from '@/components/app-screen';
import { AppText } from '@/components/app-text';
import { getAccessTokenWithRetry } from '@/lib/access-token';
import { getCurrentProfile, getDriverStats } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useResponsive } from '@/lib/responsive';
import { useAppTheme } from '@/lib/theme-context';
import { theme } from '@/theme';

// ── Icons ─────────────────────────────────────────────

function BackIcon({ size = 22 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={theme.colors.black} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Line x1="19" y1="12" x2="5" y2="12" />
      <Polyline points="12 19 5 12 12 5" />
    </Svg>
  );
}

function AvatarIcon({ size = 48 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={theme.colors.muted} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <Circle cx="12" cy="7" r="4" />
    </Svg>
  );
}

function MailIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={theme.colors.orange} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="2" y="4" width="20" height="16" rx="2" />
      <Path d="M22 7l-10 7L2 7" />
    </Svg>
  );
}

function UserIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={theme.colors.orange} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <Circle cx="12" cy="7" r="4" />
    </Svg>
  );
}

function CarIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={theme.colors.orange} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5 17h14M5 17a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1l2-3h8l2 3h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2" />
      <Circle cx="7.5" cy="17" r="2" />
      <Circle cx="16.5" cy="17" r="2" />
    </Svg>
  );
}

function PlateIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={theme.colors.orange} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="2" y="6" width="20" height="12" rx="2" />
      <Line x1="6" y1="12" x2="18" y2="12" />
    </Svg>
  );
}

// ── Component ─────────────────────────────────────────

export default function DriverProfileScreen() {
  const router = useRouter();
  const { isDark } = useAppTheme();
  const { getAccessToken } = useAuth();
  const responsive = useResponsive();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [vehicleMake, setVehicleMake] = useState<string | null>(null);
  const [vehicleModel, setVehicleModel] = useState<string | null>(null);
  const [vehiclePlate, setVehiclePlate] = useState<string | null>(null);
  const [vehicleYear, setVehicleYear] = useState<number | null>(null);

  const fetchProfile = useCallback(async () => {
    const accessToken = await getAccessTokenWithRetry(getAccessToken);
    if (!accessToken) return;

    const [profileRes, statsRes] = await Promise.allSettled([
      getCurrentProfile({ accessToken }),
      getDriverStats({ accessToken }),
    ]);

    if (profileRes.status === 'fulfilled') {
      setName(profileRes.value.user.name);
      setEmail(profileRes.value.user.email);
    }
    if (statsRes.status === 'fulfilled') {
      setVehicleMake(statsRes.value.vehicleMake);
      setVehicleModel(statsRes.value.vehicleModel);
      setVehiclePlate(statsRes.value.vehiclePlate);
      setVehicleYear(statsRes.value.vehicleYear);
    }
    setLoading(false);
  }, [getAccessToken]);

  useEffect(() => {
    void fetchProfile();
  }, [fetchProfile]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchProfile();
    setRefreshing(false);
  }, [fetchProfile]);

  const cardBg = isDark ? theme.colors.darkSurface : theme.colors.white;
  const displayName = name || 'Driver';
  const displayEmail = email || '—';
  const hasVehicle = vehicleMake || vehicleModel || vehiclePlate;

  // Row metrics scale together so the divider stays aligned to the text column
  // instead of the old hard-coded 66pt inset.
  const iconSize = responsive.scale(36);
  const rowGap = responsive.scale(14);
  const rowPaddingH = responsive.scale(16);
  const backSize = responsive.scale(40);
  const infoIconStyle = { width: iconSize, height: iconSize };
  const infoRowStyle = {
    gap: rowGap,
    paddingHorizontal: rowPaddingH,
    paddingVertical: responsive.scale(16),
  };
  const dividerInset = { marginLeft: rowPaddingH + iconSize + rowGap };
  const backBtnStyle = { width: backSize, height: backSize };
  const avatarSize = responsive.scale(80);

  const header = (
    <View style={[styles.header, { gap: rowGap }]}>
      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        style={[styles.backBtn, backBtnStyle, isDark && { backgroundColor: theme.colors.darkSurface }]}>
        <BackIcon size={responsive.scale(22)} />
      </Pressable>
      <AppText variant="h1" numberOfLines={1}>Profile</AppText>
    </View>
  );

  if (loading) {
    return (
      <AppScreen contentStyle={[styles.container, styles.centered]}>
        {header}
        <ActivityIndicator
          size="large"
          color={theme.colors.orange}
          style={{ marginTop: responsive.vh(8, 32, 60) }}
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen scroll contentStyle={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.orange} colors={[theme.colors.orange]} />}>
      {/* Header */}
      {header}

      {/* Avatar + name */}
      <View style={styles.avatarSection}>
        <View
          style={[
            styles.avatarCircle,
            { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 },
            isDark && { backgroundColor: theme.colors.darkSurfaceSoft },
          ]}>
          <AvatarIcon size={responsive.scale(48)} />
        </View>
        <AppText variant="h2" numberOfLines={1}>{displayName}</AppText>
        <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>
          {displayEmail}
        </AppText>
      </View>

      {/* Personal info */}
      <View style={styles.section}>
        <AppText
          variant="label"
          color={theme.colors.muted}
          style={[styles.sectionLabel, { fontSize: responsive.font(10) }]}
          numberOfLines={1}>
          PERSONAL INFO
        </AppText>
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <View style={[styles.infoRow, infoRowStyle]}>
            <View style={[styles.infoIcon, infoIconStyle, { backgroundColor: theme.colors.orangeLight }]}>
              <UserIcon />
            </View>
            <View style={styles.infoContent}>
              <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>Full name</AppText>
              <AppText variant="bodyMedium" numberOfLines={2}>{displayName}</AppText>
            </View>
          </View>

          <View style={[styles.divider, dividerInset, isDark && { backgroundColor: theme.colors.darkBorder }]} />

          <View style={[styles.infoRow, infoRowStyle]}>
            <View style={[styles.infoIcon, infoIconStyle, { backgroundColor: theme.colors.orangeLight }]}>
              <MailIcon />
            </View>
            <View style={styles.infoContent}>
              <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>Email</AppText>
              {/* Long addresses shrink rather than push the row wider. */}
              <AppText variant="bodyMedium" adjustsFontSizeToFit minimumFontScale={0.8} numberOfLines={1}>
                {displayEmail}
              </AppText>
            </View>
          </View>
        </View>
      </View>

      {/* Vehicle info */}
      {hasVehicle && (
        <View style={styles.section}>
          <AppText
          variant="label"
          color={theme.colors.muted}
          style={[styles.sectionLabel, { fontSize: responsive.font(10) }]}
          numberOfLines={1}>
            VEHICLE INFO
          </AppText>
          <View style={[styles.card, { backgroundColor: cardBg }]}>
            <View style={[styles.infoRow, infoRowStyle]}>
              <View style={[styles.infoIcon, infoIconStyle, { backgroundColor: theme.colors.orangeLight }]}>
                <CarIcon />
              </View>
              <View style={styles.infoContent}>
                <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>Vehicle</AppText>
                <AppText variant="bodyMedium" numberOfLines={2}>
                  {[vehicleYear, vehicleMake, vehicleModel].filter(Boolean).join(' ') || '—'}
                </AppText>
              </View>
            </View>

            {vehiclePlate && (
              <>
                <View style={[styles.divider, dividerInset, isDark && { backgroundColor: theme.colors.darkBorder }]} />
                <View style={[styles.infoRow, infoRowStyle]}>
                  <View style={[styles.infoIcon, infoIconStyle, { backgroundColor: theme.colors.orangeLight }]}>
                    <PlateIcon />
                  </View>
                  <View style={styles.infoContent}>
                    <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>Plate number</AppText>
                    <AppText variant="bodyMedium" numberOfLines={1}>{vehiclePlate}</AppText>
                  </View>
                </View>
              </>
            )}
          </View>
        </View>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xxxl,
  },
  centered: {
    flexGrow: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    flexShrink: 0,
    borderRadius: theme.radii.xs,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.subtle,
  },

  // Avatar
  avatarSection: {
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    marginBottom: 8,
  },
  avatarCircle: {
    backgroundColor: theme.colors.orangeLight,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    ...theme.shadows.card,
  },

  // Sections
  section: {
    gap: 8,
    marginTop: 20,
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

  // Info row
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoIcon: {
    flexShrink: 0,
    borderRadius: theme.radii.xs,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoContent: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.borderLight,
  },
});
