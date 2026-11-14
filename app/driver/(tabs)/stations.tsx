import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Linking, PanResponder, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { AppText, OnLight } from '@/components/app-text';
import { BackButton } from '@/components/back-button';
import { RequestBanner } from '@/components/feed/request-banner';
import { StationsSkeleton } from '@/components/feed/skeleton';
import { getAccessTokenWithRetry } from '@/lib/access-token';
import { useAuth } from '@/lib/auth';
import { toUserMessage } from '@/lib/error-messages';
import { directionsUrl, settleSheet, stationDistance, type CngStation, type StationsResponse } from '@/lib/feed';
import { getStations } from '@/lib/feed-api';
import { useAppLocation } from '@/lib/location';
import { useAppTheme } from '@/lib/theme-context';
import { theme } from '@/theme';

const LAGOS = { latitude: 6.5244, longitude: 3.3792, latitudeDelta: 0.35, longitudeDelta: 0.35 };
/** How much of the list shows when it is swiped down: the handle, the title and a little of the first row. */
const PEEK = 128;

function PumpIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M6.5 8h5" />
      <Path d="M14 10h2a2 2 0 0 1 2 2v4.5a1.5 1.5 0 0 0 3 0V8l-3-3" />
    </Svg>
  );
}

function GoIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={theme.colors.black} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 3l7 18-7-4-7 4z" />
    </Svg>
  );
}

/**
 * Stations (driver app, 14 Nov 2026): CNG stations in Lagos on a map and
 * nearest first, with Directions in Google or Apple Maps. Lagos only.
 */
export default function StationsScreen() {
  const insets = useSafeAreaInsets();
  const { isDark } = useAppTheme();
  const { getAccessToken } = useAuth();
  const { currentLocation, permissionState, requestLocationAccess } = useAppLocation();
  const [data, setData] = useState<StationsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const mapRef = useRef<MapView>(null);
  const fetchedWithPosition = useRef(false);

  useEffect(() => {
    if (permissionState === 'idle') void requestLocationAccess();
  }, [permissionState, requestLocationAccess]);

  const at = currentLocation ? { lat: currentLocation.lat, lng: currentLocation.lng } : null;

  // Only the latest answer counts: a slow first load (no position) must not
  // land after the nearest-first one and undo it.
  const loadId = useRef(0);
  const load = useCallback(async (where: { lat: number; lng: number } | null, mode: 'first' | 'refresh') => {
    const id = ++loadId.current;
    if (mode === 'refresh') setRefreshing(true);
    try {
      const next = await getStations(await getAccessTokenWithRetry(getAccessToken), where);
      if (id !== loadId.current) return;
      setData(next);
      setError(null);
    } catch (failure) {
      if (id === loadId.current) setError(toUserMessage(failure, "Couldn't load stations."));
    } finally {
      if (id === loadId.current) setRefreshing(false);
    }
  }, [getAccessToken]);

  // Once without a position (the list straight away), again once the phone knows where it is.
  useEffect(() => {
    if (at && !fetchedWithPosition.current) {
      fetchedWithPosition.current = true;
      void load(at, 'first');
    } else if (!at && !data && !error) {
      void load(null, 'first');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at?.lat, at?.lng, load]);

  const stations = useMemo(() => data?.stations ?? [], [data]);
  const focus = (s: CngStation) => {
    setSelected(s.id);
    mapRef.current?.animateToRegion({ latitude: s.lat, longitude: s.lng, latitudeDelta: 0.04, longitudeDelta: 0.04 }, 350);
  };
  const go = (s: CngStation) => { void Linking.openURL(directionsUrl(s, Platform.OS)); };

  const cardBg = isDark ? theme.colors.darkSurface : theme.colors.white;
  const border = isDark ? theme.colors.darkBorder : theme.colors.borderLight;
  const initialRegion = at ? { latitude: at.lat, longitude: at.lng, latitudeDelta: 0.12, longitudeDelta: 0.12 } : LAGOS;

  // The list is a sheet over the map: swipe it up for the whole list, down to
  // see the map (only its top shows), or leave it halfway. Dragged by its top
  // (the handle and the title), so the list itself still scrolls.
  const [height, setHeight] = useState(0);
  const stops = useMemo(() => {
    const open = insets.top + 8;
    const half = Math.max(open, Math.round(height * 0.42));
    const peek = Math.max(half, height - PEEK);
    return { open, half, peek };
  }, [height, insets.top]);
  const sheetY = useRef(new Animated.Value(0)).current;
  const yNow = useRef(0);
  const [stop, setStop] = useState<'open' | 'half' | 'peek'>('half');
  useEffect(() => {
    const id = sheetY.addListener(({ value }) => { yNow.current = value; });
    return () => sheetY.removeListener(id);
  }, [sheetY]);
  const moveTo = useCallback((name: 'open' | 'half' | 'peek') => {
    setStop(name);
    Animated.spring(sheetY, { toValue: stops[name], useNativeDriver: true, bounciness: 3, speed: 16 }).start();
  }, [sheetY, stops]);
  useEffect(() => {
    if (height > 0) { sheetY.setValue(stops[stop]); yNow.current = stops[stop]; }
    // Only when the screen's size is first known (or changes): not on every stop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height, stops]);
  const dragFrom = useRef(0);
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderGrant: () => { dragFrom.current = yNow.current; },
    onPanResponderMove: (_e, g) => {
      sheetY.setValue(Math.min(stops.peek, Math.max(stops.open, dragFrom.current + g.dy)));
    },
    onPanResponderRelease: (_e, g) => {
      const y = settleSheet([stops.open, stops.half, stops.peek], Math.min(stops.peek, Math.max(stops.open, dragFrom.current + g.dy)), g.vy);
      moveTo(y === stops.open ? 'open' : y === stops.peek ? 'peek' : 'half');
    },
  }), [moveTo, sheetY, stops]);
  // A tapped station: the map has to show, so a sheet pulled all the way up comes halfway down.
  const pick = (s: CngStation) => {
    focus(s);
    if (stop === 'open') moveTo('half');
  };
  // The list's end must be reachable whatever height the sheet is left at.
  const bottomRoom = stop === 'open' ? 24 : stop === 'half' ? stops.half - stops.open + 24 : stops.peek - stops.open + 24;

  return (
    <View onLayout={(e: LayoutChangeEvent) => setHeight(e.nativeEvent.layout.height)} style={[styles.screen, { backgroundColor: isDark ? theme.colors.black : theme.colors.offWhite }]}>
      <MapView
        ref={mapRef}
        provider={Platform.OS === 'android' || Platform.OS === 'ios' ? PROVIDER_GOOGLE : undefined}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        mapPadding={{ top: insets.top, right: 0, left: 0, bottom: Math.max(0, height - stops.half) }}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}>
        {stations.map((s) => (
          <Marker key={`${s.id}-${selected === s.id ? 1 : 0}`} coordinate={{ latitude: s.lat, longitude: s.lng }} onPress={() => setSelected(s.id)} tracksViewChanges={false}>
            <View style={[styles.pin, selected === s.id && styles.pinOn]}>
              <View style={[styles.pinDot, !s.confirmed && styles.pinDotOff]} />
              <AppText style={[styles.pinText, { color: selected === s.id ? theme.colors.white : theme.colors.black }]}>
                {s.km === null ? s.area : `${s.km < 10 ? s.km.toFixed(1) : Math.round(s.km)} km`}
              </AppText>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Opened from Me: back to it, on the map's top-left. */}
      <View style={[styles.back, { top: insets.top + 8 }]}>
        <BackButton fallback="/driver/(tabs)/settings" />
      </View>

      {height > 0 ? (
        <Animated.View style={[styles.sheet, { height: height - stops.open, backgroundColor: cardBg, borderColor: border, transform: [{ translateY: sheetY }] }]}>
          <View
            {...pan.panHandlers}
            accessibilityActions={[{ name: 'increment', label: 'Show more stations' }, { name: 'decrement', label: 'Show the map' }]}
            accessibilityLabel="Nearest CNG. Swipe up for the list, down for the map"
            accessible
            onAccessibilityAction={(e) => moveTo(e.nativeEvent.actionName === 'increment' ? (stop === 'peek' ? 'half' : 'open') : (stop === 'open' ? 'half' : 'peek'))}
            style={styles.handleArea}>
            <Pressable hitSlop={10} onPress={() => moveTo(stop === 'peek' ? 'half' : stop === 'half' ? 'open' : 'half')} style={styles.grabTouch}>
              <View style={styles.grab} />
            </Pressable>
            <AppText variant="h2">Nearest CNG</AppText>
          </View>
          <ScrollView
            contentContainerStyle={[styles.sheetBody, { paddingBottom: bottomRoom }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(at, 'refresh')} tintColor={theme.colors.orange} colors={[theme.colors.orange]} />}
            showsVerticalScrollIndicator={false}>
            <RequestBanner />
            {data && !data.inLagos ? (
              <AppText variant="bodySmall" color={theme.colors.muted}>Stations is Lagos only.</AppText>
            ) : null}
            {!data && !error ? <StationsSkeleton /> : null}
            {error && !data ? (
              <Pressable accessibilityRole="button" onPress={() => void load(at, 'first')} style={styles.errorRow}>
                <AppText variant="bodySmall" color={theme.colors.muted}>{error} Tap to try again.</AppText>
              </Pressable>
            ) : null}
            {data ? (
              <View style={[styles.list, { borderColor: border }]}>
                {stations.map((s, i) => (
                  <Pressable
                    key={s.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${s.name}, ${stationDistance(s)}`}
                    onPress={() => pick(s)}
                    style={({ pressed }) => [styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: border }, (pressed || selected === s.id) && { backgroundColor: isDark ? theme.colors.darkSurfaceSoft : '#FBF7EF' }]}>
                    <View style={[styles.icon, !s.confirmed && styles.iconOff]}>
                      <PumpIcon color={s.confirmed ? '#00875F' : theme.colors.mutedLight} />
                    </View>
                    <View style={styles.text}>
                      <AppText variant="bodyMedium" numberOfLines={1}>{s.name}</AppText>
                      <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>
                        {stationDistance(s)}{s.hours ? ` · ${s.hours}` : ''}{!s.confirmed ? ' · Not confirmed' : ''}
                      </AppText>
                    </View>
                    <Pressable accessibilityLabel={`Directions to ${s.name}`} accessibilityRole="button" hitSlop={6} onPress={() => go(s)} style={({ pressed }) => [styles.go, pressed && { opacity: 0.75 }]}>
                      <OnLight><GoIcon /></OnLight>
                    </Pressable>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </ScrollView>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  back: { position: 'absolute', left: 16 },
  sheet: {
    position: 'absolute', left: 0, right: 0, top: 0,
    borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderBottomWidth: 0,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 8,
  },
  handleArea: { paddingHorizontal: 16, paddingBottom: 8, gap: 6 },
  grabTouch: { alignSelf: 'center', paddingTop: 10, paddingBottom: 6, paddingHorizontal: 24 },
  sheetBody: { paddingHorizontal: 16, paddingTop: 2, gap: 10 },
  grab: { width: 42, height: 5, borderRadius: 999, backgroundColor: '#CFC6B8' },
  list: { borderRadius: theme.radii.md, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#E8FFF7', alignItems: 'center', justifyContent: 'center' },
  iconOff: { backgroundColor: '#F5F2ED' },
  text: { flex: 1, minWidth: 0, gap: 2 },
  go: { width: 38, height: 38, borderRadius: 19, backgroundColor: theme.colors.orange, alignItems: 'center', justifyContent: 'center' },
  errorRow: { paddingVertical: 12 },
  pin: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 26, paddingHorizontal: 8, borderRadius: 13, borderWidth: 1.5, borderColor: theme.colors.black, backgroundColor: theme.colors.white },
  pinOn: { backgroundColor: theme.colors.black },
  pinDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.green },
  pinDotOff: { backgroundColor: theme.colors.mutedLight },
  pinText: { fontFamily: 'HankenGrotesk_700Bold', fontSize: 11, lineHeight: 14 },
});
