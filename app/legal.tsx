import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RBack, RButton, RText, rider } from "@/components/rider/kit";
import {
  PRIVACY_SECTIONS,
  TERMS_SECTIONS,
  TERMS_UPDATED,
  type LegalSection,
} from "@/constants/legal-text";
import { getStoredLocalAccessToken } from "@/lib/access-token";
import { recordPrivacyConsent } from "@/lib/api";
import { PRIVACY_URL, TERMS_URL } from "@/lib/legal-links";
import { clearTermsToAnswer } from "@/lib/rider-sign-in-state";
import { acceptTerms, forgetAfterAccepting, takeAfterAccepting } from "@/lib/terms-acceptance";
import { useGoHome } from "@/hooks/use-go-home";

type Doc = "terms" | "privacy";

/** How close to the bottom counts as having reached the end. */
const END_SLACK = 96;

/**
 * The Terms of Service and the privacy summary, read inside the app.
 *
 *   /legal?doc=terms|privacy            to read: reached from links and menus
 *   /legal?mode=accept&who=<key>        to read and answer: Accept or Decline
 *   /legal?mode=answer&who=<key>&next=  the account's own answer, asked once
 *                                       after sign-in when it has not agreed
 *                                       here or on WhatsApp
 *
 * In accept mode both are on the one screen (two tabs) and Accept wakes up
 * once the terms have been scrolled to the end. Accepting is remembered for
 * `who` on this phone, the screen closes, and whatever the person had tapped
 * to get here carries on by itself. Declining just closes it.
 *
 * In answer mode the answer is the account's: it is saved on the server, so
 * WhatsApp and every other phone know it and never ask again. Either answer
 * lets the person on to `next`; there is no way out of the screen but to give
 * one. Someone who declines is asked again the next time they sign in.
 */
export default function LegalScreen() {
  const router = useRouter();
  const goHome = useGoHome();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ doc?: string; mode?: string; who?: string; next?: string }>();
  /** The account's own answer, asked after sign-in. */
  const answering = params.mode === "answer";
  const accepting =
    (params.mode === "accept" || answering) && typeof params.who === "string" && params.who.length > 0;
  const who = accepting ? (params.who as string) : "";

  const scrollRef = useRef<ScrollView>(null);
  // The text's height and the window it is read through: text that fits has no end to reach.
  const contentHeight = useRef(0);
  const viewHeight = useRef(0);
  // Where the last line of the text ends. Reaching it is reaching the end,
  // whatever numbers a phone's scroll events carry: on some Androids they
  // arrived late or as zero, so Accept never woke up.
  const endOfText = useRef(0);
  const [doc, setDoc] = useState<Doc>(params.doc === "privacy" ? "privacy" : "terms");
  const [readTerms, setReadTerms] = useState(false);
  const [saving, setSaving] = useState(false);

  // The same screen can be opened again with other params (a link, then the
  // accept step): start on what was asked for, and the accept step on the terms.
  useEffect(() => {
    setDoc(!accepting && params.doc === "privacy" ? "privacy" : "terms");
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [accepting, params.doc, who]);

  const sections: LegalSection[] = doc === "terms" ? TERMS_SECTIONS : PRIVACY_SECTIONS;

  function leave() {
    if (router.canGoBack()) router.back();
    else router.replace("/welcome");
  }

  /** Closed or declined: nothing they were doing carries on. */
  function close() {
    forgetAfterAccepting();
    leave();
  }

  function show(next: Doc) {
    setDoc(next);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (doc !== "terms" || readTerms) return;
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const seen = (contentOffset?.y ?? 0) + (layoutMeasurement?.height || viewHeight.current);
    const ends = [contentSize?.height || contentHeight.current, endOfText.current].filter((value) => value > 0);
    if (ends.length > 0 && seen >= Math.min(...ends) - END_SLACK) setReadTerms(true);
  }

  /**
   * Accept tapped before the end: take them there rather than do nothing.
   * Once the text has rolled to its end, Accept is live.
   */
  function toTheEnd() {
    scrollRef.current?.scrollToEnd({ animated: true });
    setTimeout(() => setReadTerms(true), 650);
  }

  // Answering for the account: there is no way out but an answer.
  useEffect(() => {
    if (!answering) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => subscription.remove();
  }, [answering]);

  /** Where an answer leads: the route this screen was handed, or Home. */
  function onward() {
    try {
      const next = JSON.parse(typeof params.next === "string" ? params.next : "") as { pathname?: unknown; params?: unknown };
      if (typeof next.pathname === "string" && next.pathname.startsWith("/")) {
        router.replace({ pathname: next.pathname, params: (next.params ?? {}) as Record<string, string> } as never);
        return;
      }
    } catch {
      // Nothing usable handed in: Home.
    }
    goHome();
  }

  /** The account's answer, saved on the server (so WhatsApp knows it) and then on. A save that fails is sent again when the app next opens. */
  async function answer(consent: "AGREED" | "DECLINED") {
    if (saving || (consent === "AGREED" && !readTerms)) return;
    setSaving(true);
    try {
      if (consent === "AGREED") await acceptTerms(who);
      const token = await getStoredLocalAccessToken();
      if (token) await recordPrivacyConsent(token, consent).catch(() => undefined);
      await clearTermsToAnswer();
    } finally {
      onward();
    }
  }

  async function accept() {
    if (!readTerms) return toTheEnd();
    if (answering) return answer("AGREED");
    if (saving || !readTerms) return;
    setSaving(true);
    await acceptTerms(who);
    // Back to where they were, then straight on with what they had tapped
    // (Google, Apple, email, sending the code), once that screen is in front.
    const carryOn = takeAfterAccepting();
    leave();
    if (carryOn) setTimeout(carryOn, 420);
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        {answering ? null : (
          <RBack icon={accepting ? "close" : "chevron-back"} label={accepting ? "Close" : "Back"} onPress={close} />
        )}
        <View style={styles.headerText}>
          <RText variant="heading">{doc === "terms" ? "Terms of Service" : "Privacy"}</RText>
          <RText variant="caption">Last updated {TERMS_UPDATED}</RText>
        </View>
      </View>

      <View accessibilityRole="tablist" style={styles.tabs}>
        {(["terms", "privacy"] as const).map((tab) => (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: doc === tab }}
            key={tab}
            onPress={() => show(tab)}
            style={[styles.tab, doc === tab ? styles.tabOn : null]}>
            <Text style={[styles.tabText, doc === tab ? styles.tabTextOn : null]}>
              {tab === "terms" ? "Terms of Service" : "Privacy"}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        onContentSizeChange={(_, height) => {
          // Short enough to fit without scrolling: there is no end to scroll to.
          contentHeight.current = height;
          if (doc === "terms" && height > 0 && viewHeight.current > 0 && height <= viewHeight.current + END_SLACK) setReadTerms(true);
        }}
        onLayout={(event) => {
          viewHeight.current = event.nativeEvent.layout.height;
          if (doc === "terms" && contentHeight.current > 0 && contentHeight.current <= viewHeight.current + END_SLACK) setReadTerms(true);
        }}
        onMomentumScrollEnd={onScroll}
        onScrollEndDrag={onScroll}
        onScroll={onScroll}
        ref={scrollRef}
        scrollEventThrottle={64}
        showsVerticalScrollIndicator>
        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <RText variant="bodyBold" style={styles.sectionTitle}>
              {section.title}
            </RText>
            {section.body.map((paragraph) => (
              <RText key={paragraph} style={styles.paragraph}>
                {paragraph}
              </RText>
            ))}
          </View>
        ))}

        <Pressable
          accessibilityRole="link"
          hitSlop={8}
          onLayout={(event) => {
            endOfText.current = event.nativeEvent.layout.y + event.nativeEvent.layout.height;
          }}
          onPress={() => void WebBrowser.openBrowserAsync(doc === "terms" ? TERMS_URL : PRIVACY_URL).catch(() => undefined)}
          style={styles.web}>
          <Text style={styles.webText}>
            {doc === "terms" ? "Open on our website" : "Full Privacy Policy on our website"}
          </Text>
        </Pressable>
      </ScrollView>

      {accepting ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
          {readTerms ? null : (
            <Text accessibilityLiveRegion="polite" style={styles.hint}>
              Scroll to the end to accept, or tap Accept to go there.
            </Text>
          )}
          {/* Never disabled: tapped early it scrolls to the end, so nobody is stuck behind it. */}
          <RButton
            accessibilityHint={readTerms ? undefined : "Scrolls to the end of the terms first"}
            loading={saving}
            onPress={() => void accept()}
            style={readTerms ? null : styles.notYet}
            title="Accept"
          />
          <RButton
            disabled={saving}
            onPress={answering ? () => void answer("DECLINED") : close}
            size="md"
            title="Decline"
            variant="ghost"
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: rider.colors.cream },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingBottom: 12 },
  headerText: { flex: 1, minWidth: 0 },
  tabs: { flexDirection: "row", marginHorizontal: 20, padding: 4, borderRadius: 16, backgroundColor: rider.colors.tint },
  tab: { flex: 1, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  tabOn: { backgroundColor: rider.colors.ink },
  tabText: { fontFamily: rider.fonts.bold, fontSize: 15, color: rider.colors.ink },
  tabTextOn: { color: rider.colors.cream },
  // Only the room above the buttons: the text never pushes Accept off the screen.
  scroll: { flex: 1 },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28, gap: 18 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 17 },
  paragraph: { color: rider.colors.ink },
  web: { minHeight: 44, justifyContent: "center" },
  webText: { fontFamily: rider.fonts.bold, fontSize: 15, color: rider.colors.orangeText, textDecorationLine: "underline" },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: rider.colors.line,
    backgroundColor: rider.colors.card,
  },
  notYet: { opacity: 0.55 },
  hint: { fontFamily: rider.fonts.medium, fontSize: 14, lineHeight: 19, color: rider.colors.muted, textAlign: "center" },
});
