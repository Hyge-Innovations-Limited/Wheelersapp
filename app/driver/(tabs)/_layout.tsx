import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { useDriverSession } from '@/lib/driver-session';
import { useResponsive } from '@/lib/responsive';
import { useAppTheme } from '@/lib/theme-context';
import { theme } from '@/theme';

function WalletIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <Line x1="1" y1="10" x2="23" y2="10" />
    </Svg>
  );
}

function FeedIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="4" y="4" width="16" height="16" rx="3" />
      <Path d="M8 9h8M8 13h8M8 17h5" />
    </Svg>
  );
}

function DriveIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5 16l1.5-5.5A2 2 0 0 1 8.4 9h7.2a2 2 0 0 1 1.9 1.5L19 16" />
      <Rect x="3.5" y="16" width="17" height="3.5" rx="1.5" />
      <Path d="M7 19.5V21M17 19.5V21" />
    </Svg>
  );
}

/** Drive carries the number the Active tab used to: requests on the table + live bids + the trip. */
function DriveIconWithBadge({ color, size, count }: { color: string; size: number; count: number }) {
  return (
    <View>
      <DriveIcon color={count > 0 ? theme.colors.orange : color} size={size} />
      {count > 0 ? (
        <View style={tabStyles.countBadge}>
          <Text style={tabStyles.countBadgeText}>{count > 9 ? '9+' : count}</Text>
        </View>
      ) : null}
    </View>
  );
}

function StationsIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M6.5 8h5" />
      <Path d="M14 10h2a2 2 0 0 1 2 2v4.5a1.5 1.5 0 0 0 3 0V8l-3-3" />
    </Svg>
  );
}

function MeIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="8.5" r="3.5" />
      <Path d="M5 20a7 7 0 0 1 14 0" />
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
    fontFamily: 'BricolageGrotesque_700Bold',
    fontSize: 9,
    lineHeight: 12,
    color: theme.colors.white,
  },
});

export default function DriverTabsLayout() {
  const { isDark } = useAppTheme();
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
      // Back goes to the tab you came from (Active from Drive, History from Wallet), not to Feed.
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.orange,
        tabBarInactiveTintColor: isDark ? theme.colors.darkMuted : theme.colors.mutedLight,
        // Six tabs share the width where five used to, so the label drops a
        // point and gives up its letter-spacing rather than truncating.
        tabBarLabelStyle: {
          fontFamily: 'HankenGrotesk_600SemiBold',
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
          borderTopWidth: 1,
          borderTopColor: isDark ? theme.colors.darkBorder : theme.colors.borderLight,
          height: barRowHeight + bottomPadding,
          paddingTop: 6,
          paddingBottom: bottomPadding,
          elevation: 0,
          shadowOpacity: 0,
        },
      }}
    >
      {/* Five tabs (14 Nov 2026): Feed opens first. Active, History, Quests and
          Interstate leave the bar but keep their screens: Active opens from
          Drive, History from Wallet, Quests and Interstate from Me. */}
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Feed',
          tabBarIcon: ({ color, size }) => <FeedIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="home"
        options={{
          title: 'Drive',
          tabBarIcon: ({ color, size }) => <DriveIconWithBadge color={color} size={size} count={activeCount} />,
        }}
      />
      <Tabs.Screen
        name="stations"
        options={{
          title: 'Stations',
          tabBarIcon: ({ color, size }) => <StationsIcon color={color} size={size} />,
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
        name="settings"
        options={{
          title: 'Me',
          tabBarIcon: ({ color, size }) => <MeIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen name="active" options={{ href: null }} />
      <Tabs.Screen name="history" options={{ href: null }} />
      <Tabs.Screen name="quests" options={{ href: null }} />
      <Tabs.Screen name="interstate" options={{ href: null }} />
    </Tabs>
  );
}
