import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import {
  RBack,
  RButton,
  RIconDot,
  RInput,
  rider,
  RScreen,
  RText,
} from "@/components/rider/kit";
import { toUserMessage } from "@/lib/error-messages";
import {
  fetchGooglePlaceSuggestions,
  isGoogleMapsConfigured,
  type PlaceSuggestion,
} from "@/lib/google-places";
import {
  MAX_SAVED_PLACES,
  useSavedPlaces,
  type SavedPlace,
} from "@/lib/saved-places";

const { colors, fonts, radius } = rider;

const SEARCH_DEBOUNCE_MS = 280;

type NameChoice = "Home" | "Work" | "Other";

/** What is open in the editor: a new place, or a saved one getting a new address. */
type Editing = { place: SavedPlace | null };

function iconFor(label: string): keyof typeof Ionicons.glyphMap {
  const name = label.trim().toLowerCase();
  return name === "home" ? "home-outline" : name === "work" ? "briefcase-outline" : "location-outline";
}

function formatSuggestionValue(item: PlaceSuggestion) {
  return item.subtitle ? `${item.title}, ${item.subtitle}` : item.title;
}

/** Google's suggestions for what is typed, a moment after the typing stops. */
function usePlaceSuggestions(query: string): {
  suggestions: PlaceSuggestion[];
  isSearching: boolean;
  error: string | null;
  /** True once the list on screen answers the text as it is now. */
  settled: boolean;
} {
  const [debounced, setDebounced] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    if (!debounced || !isGoogleMapsConfigured()) {
      setSuggestions([]);
      setIsSearching(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsSearching(true);
    setError(null);

    void (async () => {
      try {
        const found = await fetchGooglePlaceSuggestions(debounced);
        if (!cancelled) setSuggestions(found);
      } catch (searchError) {
        if (!cancelled) {
          setSuggestions([]);
          setError(toUserMessage(searchError, "We could not search for places just now."));
        }
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debounced]);

  return { suggestions, isSearching, error, settled: debounced === query.trim() && !isSearching };
}

export default function SavedPlacesScreen() {
  const { places, save, remove } = useSavedPlaces();
  const [editing, setEditing] = useState<Editing | null>(null);

  if (editing) {
    return (
      <PlaceEditor
        onClose={() => setEditing(null)}
        onSave={save}
        place={editing.place}
        places={places}
      />
    );
  }

  const isFull = places.length >= MAX_SAVED_PLACES;

  const confirmRemove = (place: SavedPlace) => {
    Alert.alert(`Remove ${place.label}?`, place.address, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          void remove(place.id).catch(() => {
            Alert.alert("Could not remove this place", "Please try again.");
          });
        },
      },
    ]);
  };

  return (
    <RScreen contentStyle={styles.container} scroll>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <RBack />
        <RText accessibilityRole="header" style={styles.title} variant="heading">
          Saved places
        </RText>
      </View>

      <View style={styles.intro}>
        <RText color={colors.muted}>Book faster with saved places.</RText>
        <RText color={colors.muted} variant="small">
          Saved places are kept on this phone only.
        </RText>
      </View>

      {places.map((place) => (
        <View key={place.id} style={styles.place}>
          <View style={styles.placeTop}>
            <RIconDot name={iconFor(place.label)} />
            <View style={styles.flexText}>
              <RText numberOfLines={1} variant="bodyBold">
                {place.label}
              </RText>
              <RText color={colors.muted} numberOfLines={2} variant="small">
                {place.address}
              </RText>
            </View>
          </View>
          <View style={styles.placeActions}>
            <TextAction
              label={`Change ${place.label}`}
              onPress={() => setEditing({ place })}
              title="Change"
            />
            <TextAction
              color={colors.danger}
              label={`Remove ${place.label}`}
              onPress={() => confirmRemove(place)}
              title="Remove"
            />
          </View>
        </View>
      ))}

      {isFull ? (
        <RText color={colors.muted} variant="small">
          You can save up to {MAX_SAVED_PLACES} places. Remove one to add another.
        </RText>
      ) : (
        <RButton
          icon={<Ionicons color={colors.ink} name="add" size={20} />}
          onPress={() => setEditing({ place: null })}
          size="md"
          title="Add a place"
          variant="ghost"
        />
      )}
    </RScreen>
  );
}

/* ── add or change a place ─────────────────────────────────────────────── */

function PlaceEditor({
  place,
  places,
  onClose,
  onSave,
}: {
  place: SavedPlace | null;
  places: SavedPlace[];
  onClose: () => void;
  onSave: (label: string, address: string) => Promise<void>;
}) {
  const taken = (name: string) =>
    places.some((saved) => saved.label.toLowerCase() === name.trim().toLowerCase());
  // Home and Work are offered until each is saved; after that, Change is how
  // their address moves.
  const choices: NameChoice[] = [
    ...(taken("Home") ? [] : (["Home"] as const)),
    ...(taken("Work") ? [] : (["Work"] as const)),
    "Other",
  ];

  const [choice, setChoice] = useState<NameChoice>(choices[0]!);
  const [customName, setCustomName] = useState("");
  const [address, setAddress] = useState("");
  const [query, setQuery] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const addressRef = useRef<TextInput>(null);
  const { suggestions, isSearching, error, settled } = usePlaceSuggestions(address ? "" : query);

  const name = place ? place.label : choice === "Other" ? customName.trim() : choice;
  const typed = query.trim();

  const handleSave = async () => {
    if (!place) {
      if (!name) {
        setNameError("Give this place a name.");
        return;
      }
      if (taken(name)) {
        setNameError(`You already have a place called ${name}. Use Change on it instead.`);
        return;
      }
    }
    if (!address) return;

    setIsSaving(true);
    try {
      await onSave(name, address);
      onClose();
    } catch {
      Alert.alert("Could not save this place", "Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const clearAddress = () => {
    setAddress("");
    setQuery("");
    setTimeout(() => addressRef.current?.focus(), 50);
  };

  return (
    <RScreen contentStyle={styles.container} scroll={false}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <RBack onPress={onClose} />
        <RText accessibilityRole="header" style={styles.title} variant="heading">
          {place ? `Change ${place.label}` : "Add a place"}
        </RText>
      </View>

      <ScrollView
        bounces={false}
        contentContainerStyle={styles.editor}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.flexText}>
        {place ? null : (
          <View style={styles.group}>
            <RText variant="label">NAME</RText>
            <View accessibilityRole="radiogroup" style={styles.choices}>
              {choices.map((option) => {
                const selected = option === choice;
                return (
                  <Pressable
                    accessibilityLabel={option}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    key={option}
                    onPress={() => {
                      setChoice(option);
                      setNameError(null);
                    }}
                    style={({ pressed }) => [
                      styles.choice,
                      selected ? styles.choiceOn : null,
                      pressed ? styles.pressed : null,
                    ]}>
                    <Ionicons
                      color={selected ? colors.orange : colors.ink}
                      name={iconFor(option)}
                      size={18}
                    />
                    <RText color={selected ? colors.cream : colors.ink} variant="smallBold">
                      {option}
                    </RText>
                  </Pressable>
                );
              })}
            </View>
            {choice === "Other" ? (
              <RInput
                autoCapitalize="words"
                error={nameError}
                label="Name of this place"
                maxLength={24}
                onChangeText={(value) => {
                  setCustomName(value);
                  setNameError(null);
                }}
                placeholder="Mum, Gym, School"
                returnKeyType="next"
                value={customName}
              />
            ) : null}
          </View>
        )}

        <View style={styles.group}>
          <RText variant="label">ADDRESS</RText>
          {address ? (
            <View style={styles.picked}>
              <RIconDot name={iconFor(name)} />
              <RText style={styles.flexText} variant="smallBold">
                {address}
              </RText>
              <Pressable
                accessibilityLabel="Clear address"
                accessibilityRole="button"
                onPress={clearAddress}
                style={({ pressed }) => [styles.clear, pressed ? styles.pressed : null]}>
                <Ionicons color={colors.muted} name="close-circle" size={21} />
              </Pressable>
            </View>
          ) : (
            <>
              <RInput
                accessibilityLabel="Search address"
                autoCorrect={false}
                autoFocus={!!place}
                onChangeText={setQuery}
                placeholder="Search address"
                ref={addressRef}
                returnKeyType="search"
                value={query}
              />
              {place ? (
                <RText color={colors.muted} variant="small">
                  Now: {place.address}
                </RText>
              ) : null}

              {error && !isSearching ? (
                <View accessibilityLiveRegion="polite" style={styles.searchError}>
                  <Ionicons color={colors.danger} name="alert-circle-outline" size={18} />
                  <RText color={colors.danger} style={styles.flexText} variant="small">
                    {error}
                  </RText>
                </View>
              ) : null}

              {isSearching && suggestions.length === 0 ? (
                <ActivityIndicator color={colors.orangeText} style={styles.spinner} />
              ) : null}

              <View>
                {typed
                  ? suggestions.map((item, index) => (
                      <Pressable
                        accessibilityLabel={formatSuggestionValue(item)}
                        accessibilityRole="button"
                        key={`${item.id}-${index}`}
                        onPress={() => setAddress(formatSuggestionValue(item))}
                        style={({ pressed }) => [styles.resultRow, pressed ? styles.pressed : null]}>
                        <RIconDot name="location-outline" />
                        <View style={styles.flexText}>
                          <RText numberOfLines={1} variant="bodyBold">
                            {item.title}
                          </RText>
                          {item.subtitle ? (
                            <RText color={colors.muted} numberOfLines={1} variant="small">
                              {item.subtitle}
                            </RText>
                          ) : null}
                        </View>
                      </Pressable>
                    ))
                  : null}
              </View>

              {typed && settled && !error && suggestions.length === 0 ? (
                <RText color={colors.muted} style={styles.nothing}>
                  No place found. Check the spelling.
                </RText>
              ) : null}
            </>
          )}
        </View>

        <RText color={colors.muted} variant="small">
          Saved places are kept on this phone only.
        </RText>
      </ScrollView>

      <View style={styles.footer}>
        <RButton
          disabled={!address || (!place && !name)}
          loading={isSaving}
          onPress={() => void handleSave()}
          title="Save place"
        />
      </View>
    </RScreen>
  );
}

function TextAction({
  title,
  label,
  color = colors.orangeText,
  onPress,
}: {
  title: string;
  label: string;
  color?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.textAction, pressed ? styles.pressed : null]}>
      <RText color={color} style={styles.textActionLabel}>
        {title}
      </RText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingTop: 12,
    paddingBottom: 24,
    paddingHorizontal: rider.gutter,
    gap: 14,
  },
  pressed: { opacity: 0.72 },
  flexText: { flex: 1, minWidth: 0 },

  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { flex: 1, fontSize: 26, lineHeight: 30 },
  intro: { gap: 4 },

  place: {
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 4,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  placeTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  placeActions: { flexDirection: "row", gap: 24, paddingLeft: 52 },
  textAction: { minHeight: 44, minWidth: 44, justifyContent: "center" },
  textActionLabel: {
    fontFamily: fonts.bold,
    fontSize: 15,
    lineHeight: 20,
    textDecorationLine: "underline",
  },

  editor: { gap: 18, paddingBottom: 16 },
  group: { gap: 10 },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.ink,
  },
  choiceOn: { backgroundColor: colors.ink },

  picked: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 4,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.ink,
  },
  clear: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },

  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  spinner: { alignSelf: "flex-start", marginVertical: 6 },
  nothing: { fontSize: 15, lineHeight: 22 },
  searchError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.dangerSoft,
  },

  footer: { paddingTop: 4, paddingBottom: 16 },
});
