import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';
import { useDriverSession } from '@/lib/driver-session';
import { useQuestBadge } from '@/lib/quest-badge-context';
import { useResponsive } from '@/lib/responsive';
import { useAppTheme } from '@/lib/theme-context';
import { theme } from '@/theme';

function HomeIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <Polyline points="9 22 9 12 15 12 15 22" />
    </Svg>
  );
}

function HistoryIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="10" />
      <Polyline points="12 6 12 12 16 14" />
    </Svg>
  );
}

function ActiveIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </Svg>
  );
}

function ActiveIconWithBadge({
  color,
  size,
  count,
}: {
  color: string;
  size: number;
  count: number;
}) {
  return (
    <View>
      <ActiveIcon color={count > 0 ? theme.colors.orange : color} size={size} />
      {count > 0 ? (
        <View style={tabStyles.countBadge}>
          <Text style={tabStyles.countBadgeText}>{count > 9 ? '9+' : count}</Text>
        </View>
      ) : null}
    </View>
  );
}

function WalletIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <Line x1="1" y1="10" x2="23" y2="10" />
    </Svg>
  );
}

function QuestsIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <Path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <Path d="M4 22h16" />
      <Path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22" />
      <Path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22" />
      <Path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </Svg>
  );
}

function QuestsIconWithBadge({ color, size, showBadge }: { color: string; size: number; showBadge: boolean }) {
  return (
    <View>
      <QuestsIcon color={color} size={size} />
      {showBadge && <View style={tabStyles.badge} />}
    </View>
  );
}

/**
 * The Interstate icon with a live count of passenger requests.
 *
 * A number rather than the plain dot the Quests tab uses: one waiting request
 * and nine waiting requests are different decisions, and the driver should be
 * able to tell them apart without opening the tab.
 */
function SettingsIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="3" />
      <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Svg>
  );
}

const tabStyles = StyleSheet.create({
  countBadge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: theme.colors.red,
    borderWidth: 1.5,
    borderColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: {
    fontFamily: 'ClashDisplay_700Bold',
    fontSize: 9,
    lineHeight: 12,
    color: theme.colors.white,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: theme.colors.red,
    borderWidth: 1.5,
    borderColor: theme.colors.white,
  },
});

export default function DriverTabsLayout() {
  const { isDark } = useAppTheme();
  const { showBadge } = useQuestBadge();
  const { session } = useDriverSession();
  // The Active tab's number: requests on the table + live bids + the trip.
  const activeCount =
    session.offers.length +
    Object.values(session.pendingBids).filter((bid) => !bid.outcome).length +
    (session.currentRide ? 1 : 0);
  const insets = useSafeAreaInsets();
  const responsive = useResponsive();

  // Bar height follows the device: the row itself scales with screen width,
  // then the real bottom inset (home indicator / gesture pill / nothing on
  // older Androids) is added on top instead of a hard-coded 28 vs 10.
  const barRowHeight = responsive.scale(responsive.isShort ? 52 : 58);
  const bottomPadding = Math.max(insets.bottom, 8);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.orange,
        tabBarInactiveTintColor: isDark ? theme.colors.darkMuted : theme.colors.mutedLight,
        // Six tabs share the width where five used to, so the label drops a
        // point and gives up its letter-spacing rather than truncating.
        tabBarLabelStyle: {
          fontFamily: 'ClashDisplay_600Semibold',
          fontSize: responsive.font(10),
          letterSpacing: 0,
        },
        tabBarItemStyle: {
          paddingHorizontal: 0,
        },
        tabBarIconStyle: {
          marginTop: responsive.isShort ? 0 : 2,
        },
        tabBarStyle: {
          backgroundColor: isDark ? theme.colors.darkSurface : theme.colors.white,
          borderTopWidth: theme.borders.thick,
          borderTopColor: isDark ? theme.colors.darkBorder : theme.colors.black,
          height: barRowHeight + bottomPadding,
          paddingTop: 6,
          paddingBottom: bottomPadding,
          elevation: 0,
          shadowOpacity: 0,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <HomeIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="active"
        options={{
          title: 'Active',
          tabBarIcon: ({ color, size }) => (
            <ActiveIconWithBadge color={color} size={size} count={activeCount} />
          ),
        }}
      />
      {/* Interstate leaves the bar; the route stays reachable by link. */}
      <Tabs.Screen name="interstate" options={{ href: null }} />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color, size }) => <HistoryIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: 'Wallet',
          tabBarIcon: ({ color, size }) => <WalletIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="quests"
        options={{
          title: 'Quests',
          tabBarIcon: ({ color, size }) => <QuestsIconWithBadge color={color} size={size} showBadge={showBadge} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <SettingsIcon color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
