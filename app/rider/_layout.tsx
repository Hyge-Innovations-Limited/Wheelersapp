import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { StyleSheet, View } from "react-native";

import { HapticTab } from "@/components/haptic-tab";
import { rider } from "@/constants/rider-theme";

type IconName = keyof typeof Ionicons.glyphMap;

/** A tab's icon under the short orange bar that marks where you are. */
function TabIcon({ name, focused, color }: { name: IconName; focused: boolean; color: string }) {
  return (
    <View style={styles.icon}>
      <View style={[styles.bar, focused ? styles.barOn : null]} />
      <Ionicons color={color} name={name} size={23} />
    </View>
  );
}

const hidden = { href: null, tabBarStyle: { display: "none" } } as const;

export default function RiderLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: rider.colors.cream },
        tabBarActiveTintColor: rider.colors.ink,
        tabBarInactiveTintColor: rider.colors.muted,
        tabBarButton: HapticTab,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: styles.label,
        tabBarStyle: styles.tabBar,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Ride",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon color={color} focused={focused} name={focused ? "home" : "home-outline"} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "Trips",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon color={color} focused={focused} name={focused ? "time" : "time-outline"} />
          ),
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: "Wallet",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon color={color} focused={focused} name={focused ? "wallet" : "wallet-outline"} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "You",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon color={color} focused={focused} name={focused ? "person" : "person-outline"} />
          ),
        }}
      />
      {/* Reached from other screens, never from the bar. */}
      <Tabs.Screen name="interstate" options={hidden} />
      <Tabs.Screen name="transactions" options={hidden} />
      <Tabs.Screen name="active-trip" options={hidden} />
      <Tabs.Screen name="notifications" options={hidden} />
      <Tabs.Screen name="trip-rating" options={hidden} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: 78,
    paddingTop: 0,
    paddingBottom: 12,
    backgroundColor: rider.colors.cream,
    borderTopWidth: 1,
    borderTopColor: rider.colors.line,
  },
  label: { fontFamily: rider.fonts.bold, fontSize: 12, marginTop: 6 },
  icon: { alignItems: "center", gap: 6 },
  bar: { width: 24, height: 4, borderRadius: 2, backgroundColor: "transparent" },
  barOn: { backgroundColor: rider.colors.orange },
});
