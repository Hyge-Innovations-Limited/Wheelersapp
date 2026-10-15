import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { StatusPill } from '@/components/StatusPill';
import { DecorativeBackground } from '@/components/DecorativeBackground';
import { userProfile } from '@/data/mock';
import { theme } from '@/theme';

type ProfileHeaderCardProps = {
  profile?: typeof userProfile;
};

export function ProfileHeaderCard({ profile = userProfile }: ProfileHeaderCardProps) {
  return (
    <View style={styles.header}>
      <DecorativeBackground motif="profile" dark />
      <View style={styles.row}>
        <View style={styles.avatar}>
          <AppText variant="h2" color={theme.colors.white}>
            {profile.initials}
          </AppText>
        </View>
        <View style={styles.copy}>
          <AppText variant="h3" color={theme.colors.white}>
            {profile.name}
          </AppText>
          <AppText variant="bodySmall" color="rgba(255,255,255,0.72)">
            {profile.email}
          </AppText>
          <AppText variant="caption" color="rgba(255,255,255,0.58)">
            {profile.verificationState}
          </AppText>
          <View style={styles.badges}>
            {profile.badges.map((badge) => (
              <StatusPill
                key={badge.id}
                label={badge.label}
                style={styles.badge}
                variant={badge.variant === 'green' ? 'green' : 'orange'}
              />
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: theme.colors.black,
    borderBottomWidth: theme.borders.thick,
    borderBottomColor: theme.colors.black,
    paddingHorizontal: theme.spacing.gutter,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.xxl,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: theme.radii.pill,
    borderWidth: 1.5,
    borderColor: theme.colors.white,
    backgroundColor: theme.colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.orange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 5,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  badge: {
    shadowOpacity: 0,
    elevation: 0,
  },
});
