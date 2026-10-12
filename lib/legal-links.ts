import { router } from "expo-router";

/** The website copies, linked from the in-app reader for anyone who wants the page. */
export const TERMS_URL = "https://www.wheelersng.com/terms";
export const PRIVACY_URL = "https://www.wheelersng.com/privacy";

/** Open the Terms of Service to read, inside the app. */
export const openTerms = () => router.push({ pathname: "/legal", params: { doc: "terms" } });

/** Open the privacy summary to read, inside the app. */
export const openPrivacy = () => router.push({ pathname: "/legal", params: { doc: "privacy" } });
