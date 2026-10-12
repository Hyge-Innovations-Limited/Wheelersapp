import { Linking } from "react-native";
import * as WebBrowser from "expo-web-browser";

/** Where the Terms of Service and the Privacy Policy live: the Wheelers website. */
export const TERMS_URL = "https://www.wheelersng.com/terms";
export const PRIVACY_URL = "https://www.wheelersng.com/privacy";

/**
 * Open one of them over the app, so reading it does not take the person out
 * of signing in. If the in-app browser cannot open, the phone's own does.
 */
async function open(url: string): Promise<void> {
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch {
    await Linking.openURL(url).catch(() => undefined);
  }
}

export const openTerms = () => void open(TERMS_URL);
export const openPrivacy = () => void open(PRIVACY_URL);
