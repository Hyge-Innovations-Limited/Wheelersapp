import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { File } from "expo-file-system";
import { resubmitDriverKyc, submitDriverKyc } from "@/lib/api";
import { getAccessTokenWithRetry, type AccessTokenGetter } from "@/lib/access-token";
import { KYC_STEP_LABELS, stepsToWalk, type KycStep } from "@/lib/kyc-steps";

export interface VehicleInfo {
  make: string;
  model: string;
  plate: string;
  year: number;
  phone: string;
}

export interface OnboardingData {
  ninUri: string | null;
  licenceUri: string | null;
  licenceType: 'image' | 'pdf';
  selfieUri: string | null;
  vehiclePhotos: string[];
  vehicleInfo: VehicleInfo | null;
  /** Fix mode: only these steps, sent back by the reviewer. Null: the whole application. */
  fixSteps: KycStep[] | null;
  /** What the car was last sent as, to start the vehicle form from in fix mode. */
  vehicleDraft: Partial<VehicleInfo> | null;
}

interface DriverOnboardingContextValue {
  data: OnboardingData;
  setNinUri: (uri: string) => void;
  setLicenceUri: (uri: string, type?: 'image' | 'pdf') => void;
  setSelfieUri: (uri: string) => void;
  setVehiclePhotos: (uris: string[]) => void;
  addVehiclePhoto: (uri: string) => void;
  removeVehiclePhoto: (index: number) => void;
  setVehicleInfo: (info: VehicleInfo) => void;
  /** Walk only these steps; the last one sends just them. */
  startFix: (steps: KycStep[], vehicleDraft?: Partial<VehicleInfo> | null) => void;
  /** Walk every step (a new application). */
  startFull: () => void;
  /**
   * Sends what this walk collected: the whole application, or only the fixes.
   * `latest` is what the current screen has just set (state updates land
   * after this call, so the last screen hands its own value in).
   */
  submit: (getAccessToken: AccessTokenGetter, latest?: Partial<OnboardingData>) => Promise<void>;
  submitting: boolean;
}

const DriverOnboardingContext = createContext<DriverOnboardingContextValue | null>(null);

export function useDriverOnboarding() {
  const ctx = useContext(DriverOnboardingContext);
  if (!ctx) throw new Error("useDriverOnboarding must be inside DriverOnboardingProvider");
  return ctx;
}

async function uriToBase64(uri: string): Promise<string> {
  const file = new File(uri);
  return file.base64();
}

/** The first step of these still missing what it needs, if any. */
function firstMissing(data: OnboardingData, steps: readonly KycStep[]): KycStep | null {
  for (const step of steps) {
    if (step === 'nin' && !data.ninUri) return step;
    if (step === 'licence' && !data.licenceUri) return step;
    if (step === 'selfie' && !data.selfieUri) return step;
    if (step === 'vehicle' && !data.vehicleInfo) return step;
    if (step === 'vehiclePhotos' && data.vehiclePhotos.length < 7) return step;
  }
  return null;
}

export function DriverOnboardingProvider({ children }: { children: ReactNode }) {
  const [current, setData] = useState<OnboardingData>({
    ninUri: null,
    licenceUri: null,
    licenceType: 'image',
    selfieUri: null,
    vehiclePhotos: [],
    vehicleInfo: null,
    fixSteps: null,
    vehicleDraft: null,
  });
  const [submitting, setSubmitting] = useState(false);

  const setNinUri = useCallback((uri: string) => {
    setData((prev) => ({ ...prev, ninUri: uri }));
  }, []);

  const setLicenceUri = useCallback((uri: string, type: 'image' | 'pdf' = 'image') => {
    setData((prev) => ({ ...prev, licenceUri: uri, licenceType: type }));
  }, []);

  const setSelfieUri = useCallback((uri: string) => {
    setData((prev) => ({ ...prev, selfieUri: uri }));
  }, []);

  const setVehiclePhotos = useCallback((uris: string[]) => {
    setData((prev) => ({ ...prev, vehiclePhotos: uris }));
  }, []);

  const addVehiclePhoto = useCallback((uri: string) => {
    setData((prev) => ({
      ...prev,
      vehiclePhotos: prev.vehiclePhotos.length < 10 ? [...prev.vehiclePhotos, uri] : prev.vehiclePhotos,
    }));
  }, []);

  const removeVehiclePhoto = useCallback((index: number) => {
    setData((prev) => ({
      ...prev,
      vehiclePhotos: prev.vehiclePhotos.filter((_, i) => i !== index),
    }));
  }, []);

  const setVehicleInfo = useCallback((info: VehicleInfo) => {
    setData((prev) => ({ ...prev, vehicleInfo: info }));
  }, []);

  const startFix = useCallback((steps: KycStep[], vehicleDraft: Partial<VehicleInfo> | null = null) => {
    setData((prev) => ({ ...prev, fixSteps: steps, vehicleDraft }));
  }, []);

  const startFull = useCallback(() => {
    setData((prev) => ({ ...prev, fixSteps: null, vehicleDraft: null }));
  }, []);

  const submit = useCallback(async (
    getAccessToken: AccessTokenGetter,
    latest?: Partial<OnboardingData>,
  ) => {
    const data = { ...current, ...latest };
    const steps = stepsToWalk(data.fixSteps);
    const missing = firstMissing(data, steps);
    if (missing) {
      throw new Error(`${KYC_STEP_LABELS[missing]} is still missing. Go back and add it.`);
    }

    setSubmitting(true);
    try {
      const accessToken = await getAccessTokenWithRetry(getAccessToken);
      if (!accessToken) throw new Error("Not authenticated.");

      const has = (step: KycStep) => steps.includes(step);
      const [ninImage, licenceImage, selfieImage, vehicleImages] = await Promise.all([
        has('nin') ? uriToBase64(data.ninUri!) : undefined,
        has('licence') ? uriToBase64(data.licenceUri!) : undefined,
        has('selfie') ? uriToBase64(data.selfieUri!) : undefined,
        has('vehiclePhotos') ? Promise.all(data.vehiclePhotos.map(uriToBase64)) : undefined,
      ]);
      const vehicle = has('vehicle') && data.vehicleInfo
        ? {
          vehicleMake: data.vehicleInfo.make,
          vehicleModel: data.vehicleInfo.model,
          vehiclePlate: data.vehicleInfo.plate,
          vehicleYear: data.vehicleInfo.year,
          phone: data.vehicleInfo.phone || undefined,
        }
        : {};

      if (data.fixSteps) {
        await resubmitDriverKyc({ accessToken, ninImage, licenceImage, selfieImage, vehicleImages, ...vehicle });
      } else {
        await submitDriverKyc({
          accessToken,
          ninImage: ninImage!,
          licenceImage: licenceImage!,
          selfieImage: selfieImage!,
          vehicleImages: vehicleImages!,
          vehicleMake: data.vehicleInfo!.make,
          vehicleModel: data.vehicleInfo!.model,
          vehiclePlate: data.vehicleInfo!.plate,
          vehicleYear: data.vehicleInfo!.year,
          phone: data.vehicleInfo!.phone || undefined,
        });
      }
    } finally {
      setSubmitting(false);
    }
  }, [current]);

  const data = current;

  return (
    <DriverOnboardingContext.Provider value={{ data, setNinUri, setLicenceUri, setSelfieUri, setVehiclePhotos, addVehiclePhoto, removeVehiclePhoto, setVehicleInfo, startFix, startFull, submit, submitting }}>
      {children}
    </DriverOnboardingContext.Provider>
  );
}
