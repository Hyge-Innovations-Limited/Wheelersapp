import { useRef, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import { AppButton } from "@/components/app-button";
import { AppInput } from "@/components/app-input";
import { AppScreen } from "@/components/app-screen";
import { FlowHeader } from "@/components/flow-header";
import { useResponsive } from "@/lib/responsive";
import { theme } from "@/theme";
import { useDriverOnboarding } from "@/lib/driver-onboarding";
import { useKycStep } from "@/lib/use-kyc-step";

export default function VehicleInfoScreen() {
  const responsive = useResponsive();
  const { data, setVehicleInfo } = useDriverOnboarding();
  const step = useKycStep("vehicle");
  // Fixing the car's details: start from what was sent, not a blank form.
  const start = data.vehicleInfo ?? data.vehicleDraft;
  const [make, setMake] = useState(start?.make ?? "");
  const [model, setModel] = useState(start?.model ?? "");
  const [plate, setPlate] = useState(start?.plate ?? "");
  const [year, setYear] = useState(start?.year ? String(start.year) : "");
  const [phone, setPhone] = useState(start?.phone ?? "");

  // Refs let the keyboard's "next" key walk down the form instead of the
  // driver having to tap each field behind the keyboard.
  const modelRef = useRef<TextInput>(null);
  const plateRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);

  // The phone is asked once, with the first application; a fix may leave it as it is.
  const phoneOk = step.fixing ? phone.trim().length === 0 || phone.trim().length >= 10 : phone.trim().length >= 10;
  const isValid = make.trim() && model.trim() && plate.trim() && year.trim().length === 4 && phoneOk;

  function handleContinue() {
    if (!isValid) return;
    const info = { make: make.trim(), model: model.trim(), plate: plate.trim(), year: parseInt(year, 10), phone: phone.trim() };
    setVehicleInfo(info);
    void step.go({ vehicleInfo: info });
  }

  return (
    <AppScreen scroll contentStyle={styles.container} keyboardOffset={theme.spacing.lg}>
      <FlowHeader
        title="Vehicle Details"
        subtitle="Tell us about the vehicle you'll be driving"
        showBack
        progress={step.progress}
      />

      <View style={[styles.form, { marginTop: responsive.scale(28), gap: responsive.scale(16) }]}>
        <AppInput
          label="Make"
          placeholder="e.g. Toyota"
          value={make}
          onChangeText={setMake}
          autoCapitalize="words"
          returnKeyType="next"
          onSubmitEditing={() => modelRef.current?.focus()}
          submitBehavior="submit"
        />

        <AppInput
          ref={modelRef}
          label="Model"
          placeholder="e.g. Camry"
          value={model}
          onChangeText={setModel}
          autoCapitalize="words"
          returnKeyType="next"
          onSubmitEditing={() => plateRef.current?.focus()}
          submitBehavior="submit"
        />

        <AppInput
          ref={plateRef}
          label="Plate Number"
          placeholder="e.g. LAG-123-XY"
          value={plate}
          onChangeText={setPlate}
          autoCapitalize="characters"
          returnKeyType="next"
          onSubmitEditing={() => yearRef.current?.focus()}
          submitBehavior="submit"
        />

        <AppInput
          ref={yearRef}
          label="Year"
          placeholder="e.g. 2019"
          value={year}
          onChangeText={setYear}
          keyboardType="number-pad"
          maxLength={4}
          returnKeyType="next"
          onSubmitEditing={() => phoneRef.current?.focus()}
          submitBehavior="submit"
        />

        <AppInput
          ref={phoneRef}
          label="Phone Number"
          hint="Riders will use this to reach you"
          placeholder="e.g. 08012345678"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          maxLength={15}
          returnKeyType="done"
          onSubmitEditing={handleContinue}
        />
      </View>

      <View style={styles.spacer} />

      <AppButton title={step.buttonTitle} onPress={handleContinue} disabled={!isValid} loading={step.submitting} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: theme.spacing.xxxl,
  },
  form: {
    width: "100%",
  },
  spacer: {
    flexGrow: 1,
    minHeight: theme.spacing.xxl,
  },
});
