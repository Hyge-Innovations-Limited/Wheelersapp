import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
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
import { PRIVACY_URL, TERMS_URL } from "@/lib/legal-links";
import { acceptTerms } from "@/lib/terms-acceptance";

type Doc = "terms" | "privacy";

/** How close to the bottom counts as having reached the end. */
const END_SLACK = 32;

/**
 * The Terms of Service and the privacy summary, read inside the app.
 *
 *   /legal?doc=terms|privacy            to read: reached from links and menus
 *   /legal?mode=accept&who=<key>        to read and answer: Accept or Decline
 *
 * In accept mode both are on the one screen (two tabs) and Accept wakes up
 * once the terms have been scrolled to the end. Accepting is remembered for
 * `who` on this phone and the screen closes; the screen that opened it carries
 * on. Declining just closes it.
 */
export default function LegalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ doc?: string; mode?: string; who?: string }>();
  const accepting = params.mode === "accept" && typeof params.who === "string" && params.who.length > 0;
  const who = accepting ? (params.who as string) : "";

  const scrollRef = useRef<ScrollView>(null);
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

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace("/welcome");
  }

  function show(next: Doc) {
    setDoc(next);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (doc !== "terms" || readTerms) return;
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - END_SLACK) setReadTerms(true);
  }

  async function accept() {
    if (saving || !readTerms) return;
    setSaving(true);
    await acceptTerms(who);
    close();
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <RBack icon={accepting ? "close" : "chevron-back"} label={accepting ? "Close" : "Back"} onPress={close} />
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
        contentContainerStyle={styles.body}
        onContentSizeChange={(_, height) => {
          // Short enough to fit without scrolling: there is no end to scroll to.
          if (doc === "terms" && height > 0 && height < 400) setReadTerms(true);
        }}
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
              Scroll to the end to accept.
            </Text>
          )}
          <RButton disabled={!readTerms} loading={saving} onPress={() => void accept()} title="Accept" />
          <RButton onPress={close} size="md" title="Decline" variant="ghost" />
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
  hint: { fontFamily: rider.fonts.medium, fontSize: 14, lineHeight: 19, color: rider.colors.muted, textAlign: "center" },
});
