import { StyleSheet, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { AppText } from '@/components/app-text';
import { theme } from '@/theme';

/** Quests are not ready yet: the tab stays, the page says so. */
export default function DriverQuestsScreen() {
  return (
    <AppScreen safeAreaEdges={['top', 'left', 'right']} contentStyle={styles.container}>
      <AppText variant="h1" numberOfLines={1}>Quests</AppText>
      <View style={styles.center}>
        <AppText variant="h3" color={theme.colors.muted}>Coming soon</AppText>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: theme.spacing.lg,
    flexGrow: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
