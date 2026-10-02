import { useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";

import { AppButton } from "@/components/app-button";
import { AppScreen } from "@/components/app-screen";
import { AppText } from "@/components/app-text";
import { FlowHeader } from "@/components/flow-header";
import { useResponsive } from "@/lib/responsive";
import { theme } from "@/theme";
import { useDriverOnboarding } from "@/lib/driver-onboarding";
import { useKycStep } from "@/lib/use-kyc-step";

export default function LicenceUploadScreen() {
  const step = useKycStep("licence");
  const responsive = useResponsive();
  const { setLicenceUri, data } = useDriverOnboarding();
  const [imageUri, setImageUri] = useState<string | null>(data.licenceUri);
  const [fileType, setFileType] = useState<"image" | "pdf">(data.licenceType);

  const previewHeight = responsive.vh(28, 150, 320);

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsEditing: true,
    });

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setFileType("image");
      setLicenceUri(result.assets[0].uri, "image");
    }
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: true,
    });

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setFileType("image");
      setLicenceUri(result.assets[0].uri, "image");
    }
  }

  async function pickPdf() {
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
    });

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setFileType("pdf");
      setLicenceUri(result.assets[0].uri, "pdf");
    }
  }

  return (
    <AppScreen scroll contentStyle={styles.container}>
      <FlowHeader
        title="Driver's Licence"
        subtitle="Take a photo or upload a PDF of your driver's licence"
        showBack
        progress={step.progress}
      />

      <View
        style={[
          styles.uploadArea,
          { marginTop: responsive.isShort ? theme.spacing.lg : theme.spacing.xxl },
        ]}>
        {imageUri ? (
          <Pressable onPress={pickImage} style={styles.previewWrap}>
            {/* Preview scales with the viewport so the Continue button stays
                reachable on a short phone and the card fills a tablet. */}
            {fileType === "image" ? (
              <Image
                source={{ uri: imageUri }}
                style={[styles.preview, { height: previewHeight }]}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.pdfPreview, { height: previewHeight }]}>
                <Ionicons name="document-text" size={responsive.scale(48)} color={theme.colors.orange} />
                <AppText variant="bodyMedium" color={theme.colors.black} numberOfLines={1}>
                  PDF uploaded
                </AppText>
              </View>
            )}
            <View style={styles.changeOverlay}>
              <AppText variant="label" color={theme.colors.white} numberOfLines={1}>
                Tap to change
              </AppText>
            </View>
          </Pressable>
        ) : (
          <View
            style={[
              styles.placeholderArea,
              // Three choices stack here, so this box needs less padding than
              // the two-choice ones on the other upload screens.
              { paddingVertical: responsive.vh(4, 18, 32) },
            ]}>
            <Pressable
              onPress={takePhoto}
              style={[styles.captureButton, { minHeight: responsive.scale(44) }]}
              hitSlop={8}>
              <Ionicons name="camera" size={responsive.scale(28)} color={theme.colors.orange} />
              <AppText variant="label" color={theme.colors.orange} numberOfLines={1}>
                Take Photo
              </AppText>
            </Pressable>

            <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>
              or
            </AppText>

            <Pressable
              onPress={pickImage}
              style={[styles.galleryButton, { minHeight: responsive.scale(40) }]}
              hitSlop={8}>
              <Ionicons name="images-outline" size={responsive.scale(20)} color={theme.colors.muted} />
              <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>
                Choose from gallery
              </AppText>
            </Pressable>

            <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>
              or
            </AppText>

            <Pressable
              onPress={pickPdf}
              style={[styles.galleryButton, { minHeight: responsive.scale(40) }]}
              hitSlop={8}>
              <Ionicons name="document-text-outline" size={responsive.scale(20)} color={theme.colors.muted} />
              <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>
                Upload PDF
              </AppText>
            </Pressable>
          </View>
        )}
      </View>

      <View style={styles.spacer} />

      <AppButton
        title={step.buttonTitle}
        onPress={() => void step.go()}
        disabled={!imageUri}
        loading={step.submitting}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: theme.spacing.xxxl,
  },
  uploadArea: {
    width: "100%",
  },
  placeholderArea: {
    borderWidth: theme.borders.thick,
    borderStyle: "dashed",
    borderColor: theme.colors.orange,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.orangeLight,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.md,
  },
  captureButton: {
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
  },
  galleryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.xs,
  },
  previewWrap: {
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    overflow: "hidden",
    ...theme.shadows.card,
  },
  preview: {
    width: "100%",
  },
  pdfPreview: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.orangeLight,
    gap: theme.spacing.sm,
  },
  changeOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingVertical: theme.spacing.sm,
    alignItems: "center",
  },
  spacer: {
    // flexGrow, not flex: inside a ScrollView's content container `flex: 1`
    // collapses the spacer instead of pushing the button to the bottom.
    flexGrow: 1,
    minHeight: theme.spacing.xxl,
  },
});
