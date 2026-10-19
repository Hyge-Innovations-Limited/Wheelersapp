import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, OnLight } from '@/components/app-text';
import { HelpTopic } from '@/data/mock';
import { StatusPill } from '@/components/StatusPill';
import { theme } from '@/theme';

type HelpTopicRowProps = {
  topic: HelpTopic;
  onPress?: () => void;
};

export function HelpTopicRow({ topic, onPress }: HelpTopicRowProps) {
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <View style={styles.iconBox}>
        <OnLight>
        <AppText variant="body">{topic.icon}</AppText>
        </OnLight>
      </View>
      <AppText variant="bodyMedium" style={styles.title}>
        {topic.title}
      </AppText>
      {topic.badge ? <StatusPill label={topic.badge} style={styles.badge} variant="orange" /> : null}
      {!topic.badge ? (
        <AppText variant="h3" color={theme.colors.mutedLight}>
          ›
        </AppText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EDE8',
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: theme.radii.sm,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.card,
  },
  title: {
    flex: 1,
  },
  badge: {
    shadowOpacity: 0,
    elevation: 0,
  },
});
