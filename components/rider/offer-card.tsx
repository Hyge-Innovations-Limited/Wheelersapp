import { Pressable, StyleSheet, Text, View } from "react-native";

import { RAvatar } from "@/components/rider/kit";
import { comparePrice } from "@/components/rider/price-card";
import { naira, rider } from "@/constants/rider-theme";
import type { RideOffer } from "@/lib/ride-offers";

const { colors, fonts } = rider;

/**
 * One driver's offer: who they are, what they drive, how far away they are,
 * their price, and how that price compares with the rider's own.
 */
export function OfferCard({
  offer,
  riderOfferNgn,
  featured,
  busy,
  onAccept,
  onDecline,
}: {
  offer: RideOffer;
  /** What the rider offered; the comparison line is left out without it. */
  riderOfferNgn?: number | null;
  /** The dark card: the cheapest offer on screen. */
  featured?: boolean;
  /** An accept is on its way to the server; nothing can be pressed. */
  busy?: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const name = offer.driverName || "Driver";
  const minutes = offer.etaSeconds > 0 ? Math.max(1, Math.ceil(offer.etaSeconds / 60)) : null;
  const details = [
    offer.driverRating > 0 ? `${offer.driverRating.toFixed(1)} rating` : null,
    offer.vehicleModel || null,
    minutes !== null ? `${minutes} min away` : null,
  ].filter(Boolean);
  const comparison =
    typeof riderOfferNgn === "number" && Math.round(offer.counterOfferNgn) === Math.round(riderOfferNgn)
      ? "Accepted your price"
      : comparePrice(offer.counterOfferNgn, riderOfferNgn, "your offer");
  const price = naira(offer.counterOfferNgn);
  const quiet = featured ? colors.onInkMuted : colors.muted;
  const strong = featured ? colors.cream : colors.ink;

  return (
    <View style={[styles.card, featured ? styles.cardInk : styles.cardPlain]}>
      <View style={styles.head}>
        <RAvatar name={name} size={52} />
        <View style={styles.who}>
          <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={[styles.name, { color: strong }]}>
            {name}
          </Text>
          {details.length > 0 ? (
            <Text maxFontSizeMultiplier={1.2} numberOfLines={2} style={[styles.details, { color: quiet }]}>
              {details.join(" · ")}
            </Text>
          ) : null}
        </View>
        <Text
          maxFontSizeMultiplier={1.1}
          numberOfLines={1}
          style={[styles.price, { color: featured ? colors.orange : colors.ink }]}>
          {price}
        </Text>
      </View>

      {comparison || offer.vehiclePlate ? (
        <View style={styles.meta}>
          {comparison ? (
            <Text maxFontSizeMultiplier={1.2} style={[styles.compare, { color: quiet }]}>
              {comparison}
            </Text>
          ) : (
            <View />
          )}
          {offer.vehiclePlate ? (
            <View style={[styles.plate, { borderColor: featured ? colors.inkLine : colors.ink }]}>
              <Text
                accessibilityLabel={`Plate number ${offer.vehiclePlate}`}
                maxFontSizeMultiplier={1.15}
                style={[styles.plateText, { color: strong }]}>
                {offer.vehiclePlate}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityLabel={`Decline the offer from ${name}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: !!busy }}
          disabled={busy}
          onPress={onDecline}
          style={({ pressed }) => [
            styles.button,
            styles.decline,
            { borderColor: featured ? colors.inkLine : colors.ink },
            busy ? styles.dimmed : null,
            pressed ? styles.pressed : null,
          ]}>
          <Text maxFontSizeMultiplier={1.15} style={[styles.declineText, { color: strong }]}>
            Decline
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel={`Accept ${price} from ${name}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: !!busy }}
          disabled={busy}
          onPress={onAccept}
          style={({ pressed }) => [
            styles.button,
            styles.accept,
            { backgroundColor: featured ? colors.orange : colors.ink },
            busy ? styles.dimmed : null,
            pressed ? styles.pressed : null,
          ]}>
          <Text
            maxFontSizeMultiplier={1.15}
            numberOfLines={1}
            style={[styles.acceptText, { color: featured ? colors.ink : colors.cream }]}>
            Accept {price}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, borderRadius: rider.radius.xl, gap: 10 },
  cardInk: { backgroundColor: colors.ink },
  cardPlain: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  who: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontFamily: fonts.bold, fontSize: 17 },
  details: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  price: { fontFamily: fonts.display, fontSize: 26, fontVariant: ["tabular-nums"] },
  meta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  compare: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: 13, fontVariant: ["tabular-nums"] },
  plate: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 2 },
  plateText: { fontFamily: fonts.displayBold, fontSize: 13, letterSpacing: 0.5 },
  actions: { flexDirection: "row", gap: 10 },
  button: { height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  decline: { flex: 1, borderWidth: 2 },
  declineText: { fontFamily: fonts.bold, fontSize: 15 },
  accept: { flex: 2 },
  acceptText: { fontFamily: fonts.heavy, fontSize: 16, fontVariant: ["tabular-nums"] },
  dimmed: { opacity: 0.45 },
  pressed: { opacity: 0.72 },
});
