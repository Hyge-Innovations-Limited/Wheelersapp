import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { PromoOffer } from '@/data/mock';
import { theme } from '@/theme';

type PromoCardProps = {
  promo: PromoOffer;
};

export function PromoCard({ promo }: PromoCardProps) {
  const highlighted = Boolean(promo.highlighted);

  return (
    <View style={[styles.card, highlighted ? styles.highlightedCard : styles.neutralCard]}>
      <View style={styles.copy}>
        <AppText variant="monoLarge" color={highlighted ? theme.colors.white : theme.colors.black}>
          {promo.title}
        </AppText>
        <AppText
          variant="bodySmall"
          color={highlighted ? 'rgba(255,255,255,0.82)' : theme.colors.muted}>
          {promo.description} · Code: {promo.code}
        </AppText>
        <AppText
          variant="monoSmall"
          color={highlighted ? 'rgba(255,255,255,0.62)' : theme.colors.mutedLight}>
          {promo.expiry}
        </AppText>
      </View>
      <View style={[styles.ticketStripe, highlighted ? styles.highlightedStripe : styles.neutralStripe]} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: theme.borders.thick,
    borderRadius: theme.radii.md,
    padding: theme.spacing.lg,
    overflow: 'hidden',
    ...theme.shadows.card,
  },
  highlightedCard: {
    backgroundColor: theme.colors.orange,
    borderColor: theme.colors.orange,
  },
  neutralCard: {
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.borderLight,
  },
  copy: {
    paddingRight: 26,
    gap: 4,
  },
  ticketStripe: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 32,
  },
  highlightedStripe: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  neutralStripe: {
    backgroundColor: 'rgba(13,13,13,0.04)',
  },
});
