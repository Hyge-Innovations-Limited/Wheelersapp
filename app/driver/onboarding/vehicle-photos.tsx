import { Alert, Image, Pressable, StyleSheet, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";

import { AppButton } from "@/components/app-button";
import { AppScreen } from "@/components/app-screen";
import { AppText } from "@/components/app-text";
import { FlowHeader } from "@/components/flow-header";
import { useResponsive } from "@/lib/responsive";
import { theme } from "@/theme";
import { useDriverOnboarding } from "@/lib/driver-onboarding";
import { useKycStep } from "@/lib/use-kyc-step";

const MIN_PHOTOS = 7;
const MAX_PHOTOS = 10;

const PHOTO_TIPS = [
  "Front of the car",
  "Back of the car",
  "Driver side",
  "Passenger side",
  "Dashboard / interior",
  "Back seat",
  "Boot / trunk",
];

export default function VehiclePhotosScreen() {
  const { data, addVehiclePhoto, removeVehiclePhoto } = useDriverOnboarding();
  const step = useKycStep("vehiclePhotos");
  const responsive = useResponsive();
  const photos = data.vehiclePhotos;
  const canAddMore = photos.length < MAX_PHOTOS;
  const isValid = photos.length >= MIN_PHOTOS;

  // The grid is measured, not guessed: a fixed "31%" left a ragged right edge
  // at some widths and gave tablets three enormous tiles. Derive the tile size
  // from the real content width so the columns always fill the row exactly.
  const GRID_GAP = theme.spacing.sm;
  const columns = responsive.isTablet ? 4 : 3;
  const contentWidth =
    (responsive.isTablet ? Math.min(responsive.width, theme.layout.maxWidth) : responsive.width) -
    responsive.gutter * 2;
  const photoSize = Math.floor((contentWidth - GRID_GAP * (columns - 1)) / columns);

  async function takePhoto() {
    if (!canAddMore) return;

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Camera access needed", "Please allow camera access to take vehicle photos.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets[0]) {
      addVehiclePhoto(result.assets[0].uri);
    }
  }

  async function pickFromGallery() {
    if (!canAddMore) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - photos.length,
    });

    if (!result.canceled && result.assets.length > 0) {
      for (const asset of result.assets) {
        if (photos.length + result.assets.indexOf(asset) < MAX_PHOTOS) {
          addVehiclePhoto(asset.uri);
        }
      }
    }
  }

  function handleRemove(index: number) {
    Alert.alert("Remove photo?", "Are you sure you want to remove this photo?", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => removeVehiclePhoto(index) },
    ]);
  }

  return (
    <AppScreen scroll contentStyle={styles.container}>
      <FlowHeader
        title="Vehicle Photos"
        subtitle={`Take ${MIN_PHOTOS}-${MAX_PHOTOS} clear photos of your vehicle`}
        showBack
        progress={step.progress}
      />

      <View style={styles.counterRow}>
        <AppText
          variant="bodyMedium"
          color={isValid ? theme.colors.green : theme.colors.orange}
          numberOfLines={1}
        >
          {photos.length} / {MAX_PHOTOS} photos
        </AppText>
        {!isValid && (
          <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>
            (minimum {MIN_PHOTOS})
          </AppText>
        )}
      </View>

      {photos.length === 0 && (
        <View
          style={[
            styles.tipsBox,
            {
              marginTop: responsive.isShort ? theme.spacing.lg : theme.spacing.xl,
              padding: responsive.scale(16),
            },
          ]}>
          <AppText variant="label" color={theme.colors.black} numberOfLines={1}>
            Suggested angles:
          </AppText>
          {PHOTO_TIPS.map((tip, i) => (
            <View key={tip} style={styles.tipRow}>
              <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>
                {i + 1}. {tip}
              </AppText>
            </View>
          ))}
        </View>
      )}

      {photos.length > 0 && (
        <View style={[styles.grid, { gap: GRID_GAP }]}>
          {photos.map((uri, index) => (
            <View key={`${uri}-${index}`} style={[styles.photoCard, { width: photoSize }]}>
              <Image source={{ uri }} style={styles.photoImage} resizeMode="cover" />
              <Pressable
                style={styles.removeButton}
                onPress={() => handleRemove(index)}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={responsive.scale(24)} color={theme.colors.danger} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {canAddMore && (
        <View
          style={[
            styles.addButtons,
            { marginTop: responsive.isShort ? theme.spacing.lg : theme.spacing.xl },
          ]}>
          <Pressable
            onPress={takePhoto}
            style={[styles.addButton, { paddingVertical: responsive.scale(16) }]}>
            <Ionicons name="camera" size={responsive.scale(24)} color={theme.colors.orange} />
            <AppText variant="label" color={theme.colors.orange} numberOfLines={1}>
              Take Photo
            </AppText>
          </Pressable>

          <Pressable
            onPress={pickFromGallery}
            style={[styles.addButton, { paddingVertical: responsive.scale(16) }]}>
            <Ionicons name="images-outline" size={responsive.scale(24)} color={theme.colors.orange} />
            <AppText variant="label" color={theme.colors.orange} numberOfLines={1}>
              Gallery
            </AppText>
          </Pressable>
        </View>
      )}

      <View style={styles.spacer} />

      <AppButton
        title={step.buttonTitle}
        onPress={() => void step.go()}
        disabled={!isValid}
        loading={step.submitting}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: theme.spacing.xxxl,
  },
  counterRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  tipsBox: {
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.orangeLight,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.borderLight,
    gap: theme.spacing.xs,
  },
  tipRow: {
    marginLeft: theme.spacing.sm,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: theme.spacing.lg,
  },
  photoCard: {
    aspectRatio: 1,
    borderRadius: theme.radius.sm,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    overflow: "hidden",
    ...theme.shadows.subtle,
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
  removeButton: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: theme.colors.white,
    borderRadius: 12,
  },
  addButtons: {
    flexDirection: "row",
    gap: theme.spacing.md,
    justifyContent: "center",
  },
  addButton: {
    // Share the row evenly instead of sizing to their labels — two fixed-width
    // buttons overflowed a 320pt screen.
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderWidth: theme.borders.thick,
    borderStyle: "dashed",
    borderColor: theme.colors.orange,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.orangeLight,
  },
  spacer: {
    // flexGrow, not flex: inside a ScrollView's content container `flex: 1`
    // collapses the spacer instead of pushing the button to the bottom.
    flexGrow: 1,
    minHeight: theme.spacing.xxl,
  },
});
