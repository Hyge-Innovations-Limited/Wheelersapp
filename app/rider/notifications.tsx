import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { RefreshControl, StyleSheet, View } from "react-native";

import { RBack, RLink, RScreen, RText, rider } from "@/components/rider/kit";
import { useAppNotifications } from "@/lib/notifications";

const { colors } = rider;
type IconName = keyof typeof Ionicons.glyphMap;

/** "5 min ago", "3 hr ago", "2 days ago". */
function ago(value: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

function iconFor(category: string): IconName {
  if (category === "wallet" || category === "payment") return "wallet-outline";
  if (category === "ride") return "car-outline";
  return "notifications-outline";
}

/** What Wheelers has told this rider: unread first, pulled down to fetch again. */
export default function NotificationsScreen() {
  const { markAllRead, notifications, refreshNotifications } = useAppNotifications();
  const [refreshing, setRefreshing] = useState(false);
  const sorted = [...notifications].sort((a, b) => Number(a.read) - Number(b.read));
  const anyUnread = notifications.some((item) => !item.read);

  async function pull() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refreshNotifications();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <RScreen
      bounces
      contentStyle={styles.screen}
      refreshControl={
        <RefreshControl colors={[colors.orange]} onRefresh={() => void pull()} refreshing={refreshing} tintColor={colors.orange} />
      }
      scroll>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <RBack />
        <RText accessibilityRole="header" style={styles.flex} variant="title">
          Notifications
        </RText>
        {anyUnread ? <RLink color={colors.orangeText} onPress={() => void markAllRead()} title="Mark all read" /> : null}
      </View>

      {sorted.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons color={colors.muted} name="notifications-outline" size={32} />
          <RText color={colors.muted}>Nothing yet.</RText>
        </View>
      ) : (
        sorted.map((item) => (
          <View key={item.id} style={[styles.item, item.read ? null : styles.itemNew]}>
            <View style={[styles.dot, item.read ? null : styles.dotNew]}>
              <Ionicons color={item.read ? colors.ink : colors.cream} name={iconFor(item.category)} size={18} />
            </View>
            <View style={styles.flex}>
              <RText variant="bodyBold">{item.title}</RText>
              <RText color={colors.muted} variant="small">
                {item.body}
              </RText>
              <RText color={colors.muted} variant="caption">
                {ago(item.createdAt)}
              </RText>
            </View>
          </View>
        ))
      )}
    </RScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 12, gap: 10 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  flex: { flex: 1 },
  empty: { alignItems: "center", gap: 8, paddingTop: 80 },
  item: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  itemNew: { borderWidth: 2, borderColor: colors.ink },
  dot: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.cream },
  dotNew: { backgroundColor: colors.ink },
});
