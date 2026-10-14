import { PropsWithChildren, useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Marker, Polyline, type EdgePadding, type LatLng } from "react-native-maps";

import { GoogleMapView } from "@/components/GoogleMapView";
import { useAppLocation } from "@/lib/location";
import type {
  RideEstimateWaypoint,
  RideMapCoordinate,
  RideRouteGeometry,
} from "@/lib/api";
import { theme } from "@/theme";

type LiveMapProps = PropsWithChildren<{
  height?: number;
  roundedTop?: boolean;
  route?: RideRouteGeometry | null;
  pickup?: RideEstimateWaypoint | null;
  destination?: RideEstimateWaypoint | null;
  stops?: RideEstimateWaypoint[];
  driverLocation?: RideMapCoordinate | null;
  initialCenter?: RideMapCoordinate | null;
  initialDelta?: {
    latitudeDelta: number;
    longitudeDelta: number;
  };
  fitPadding?: Partial<EdgePadding>;
  /** Tapping the blue dot of where the phone is. Without it the dot is just shown. */
  onMyLocationPress?: () => void;
}>;

const defaultInitialDelta = {
  latitudeDelta: 0.045,
  longitudeDelta: 0.035,
};

export function LiveMap({
  children,
  height = 280,
  roundedTop,
  route,
  pickup,
  destination,
  stops = [],
  driverLocation,
  initialCenter,
  initialDelta = defaultInitialDelta,
  fitPadding,
  onMyLocationPress,
}: LiveMapProps) {
  const mapRef = useRef<import("react-native-maps").default | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const lastFitSignatureRef = useRef<string | null>(null);
  const hasFittedOnceRef = useRef(false);
  const { currentLocation } = useAppLocation();

  const routePolyline = useMemo(
    () => (route?.coordinates ?? []).map(toLatLng),
    [route?.coordinates],
  );
  const fitCoordinates = useMemo(() => {
    if (routePolyline.length >= 2) {
      return routePolyline;
    }

    return [pickup, ...stops, destination]
      .filter((point): point is RideEstimateWaypoint => point != null)
      .map(toLatLng);
  }, [destination, pickup, routePolyline, stops]);
  const resolvedPadding = useMemo<EdgePadding>(
    () => ({
      top: fitPadding?.top ?? 56,
      right: fitPadding?.right ?? 40,
      bottom: fitPadding?.bottom ?? 56,
      left: fitPadding?.left ?? 40,
    }),
    [fitPadding],
  );
  const initialRegion = useMemo(() => {
    if (route?.bounds) {
      const centerLatitude =
        (route.bounds.northEast.lat + route.bounds.southWest.lat) / 2;
      const centerLongitude =
        (route.bounds.northEast.lng + route.bounds.southWest.lng) / 2;

      return {
        latitude: centerLatitude,
        longitude: centerLongitude,
        latitudeDelta: Math.max(
          Math.abs(route.bounds.northEast.lat - route.bounds.southWest.lat) * 1.35,
          0.012,
        ),
        longitudeDelta: Math.max(
          Math.abs(route.bounds.northEast.lng - route.bounds.southWest.lng) * 1.35,
          0.012,
        ),
      };
    }

    // Where to look before a route exists. The device's own position comes
    // before any fallback: this used to open on hardcoded Lagos coordinates, so
    // a rider anywhere else watched the map sit over Lagos and then jump to
    // their route the moment it resolved.
    const center =
      initialCenter ?? pickup ?? destination ?? driverLocation ?? stops[0] ?? currentLocation;

    if (!center) {
      return undefined;
    }

    return {
      latitude: center.lat,
      longitude: center.lng,
      latitudeDelta: initialDelta.latitudeDelta,
      longitudeDelta: initialDelta.longitudeDelta,
    };
  }, [
    currentLocation,
    destination,
    driverLocation,
    initialCenter,
    initialDelta,
    pickup,
    route?.bounds,
    stops,
  ]);
  const fitSignature = useMemo(
    () =>
      fitCoordinates
        .map((coordinate) => `${coordinate.latitude.toFixed(5)}:${coordinate.longitude.toFixed(5)}`)
        .join("|"),
    [fitCoordinates],
  );

  useEffect(() => {
    if (!mapReady || !mapRef.current || fitCoordinates.length < 2 || !fitSignature) {
      return;
    }

    if (lastFitSignatureRef.current === fitSignature) {
      return;
    }

    const isFirstFit = !hasFittedOnceRef.current;
    lastFitSignatureRef.current = fitSignature;
    hasFittedOnceRef.current = true;

    mapRef.current.fitToCoordinates(fitCoordinates, {
      edgePadding: resolvedPadding,
      // The first frame lands instantly — there is nothing to animate from.
      // Every later re-frame glides, because a route that resolves in stages
      // (pickup, then destination, then geometry) snapped the camera three
      // times and read as the map jumping around on its own.
      animated: !isFirstFit,
    });
  }, [fitCoordinates, fitSignature, mapReady, resolvedPadding]);

  /**
   * Catch the case where the device fix arrives after the map has mounted.
   *
   * `initialRegion` is only read on the first render, so a rider who opened the
   * screen before their GPS settled would otherwise be left looking at a world
   * view forever. There is no route to fit yet, so this is the only thing that
   * moves the camera to them.
   */
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    if (hasFittedOnceRef.current || fitCoordinates.length >= 2) return;
    if (!currentLocation) return;

    hasFittedOnceRef.current = true;
    mapRef.current.animateToRegion(
      {
        latitude: currentLocation.lat,
        longitude: currentLocation.lng,
        latitudeDelta: initialDelta.latitudeDelta,
        longitudeDelta: initialDelta.longitudeDelta,
      },
      450,
    );
  }, [currentLocation, fitCoordinates.length, initialDelta, mapReady]);

  return (
    <View
      style={[
        styles.container,
        {
          height,
          borderTopLeftRadius: roundedTop ? theme.radius.lg : 0,
          borderTopRightRadius: roundedTop ? theme.radius.lg : 0,
        },
      ]}
    >
      <GoogleMapView
        initialRegion={initialRegion}
        mapPadding={Platform.select({ ios: undefined, default: undefined })}
        onMapReady={() => setMapReady(true)}
        pitchEnabled={false}
        rotateEnabled={false}
        scrollEnabled
        showsBuildings
        showsCompass={false}
        showsIndoors={false}
        // Same as the driver's map: a rider following a trip needs to see
        // where they are, not just where the route is.
        showsUserLocation
        showsMyLocationButton={false}
        showsTraffic
        style={StyleSheet.absoluteFill}
        toolbarEnabled={false}
        userLocationCalloutEnabled={false}
        ref={mapRef}
      >
        {/* The blue dot itself can't be tapped on every phone, so an
            invisible target sits on it, big enough for a thumb. */}
        {onMyLocationPress && currentLocation ? (
          <Marker
            accessibilityLabel="Set your pickup"
            anchor={{ x: 0.5, y: 0.5 }}
            coordinate={toLatLng(currentLocation)}
            onPress={onMyLocationPress}
            tracksViewChanges={false}>
            <View style={styles.myLocationTarget} />
          </Marker>
        ) : null}

        {routePolyline.length >= 2 ? (
          <Polyline
            coordinates={routePolyline}
            strokeColor={theme.colors.orange}
            strokeWidth={5}
          />
        ) : null}

        {pickup ? (
          <Marker coordinate={toLatLng(pickup)}>
            <View style={[styles.marker, styles.pickupMarker]} />
          </Marker>
        ) : null}

        {stops.map((stop, index) => (
          <Marker key={`${stop.address}-${index}`} coordinate={toLatLng(stop)}>
            <View style={[styles.marker, styles.stopMarker]} />
          </Marker>
        ))}

        {destination ? (
          <Marker coordinate={toLatLng(destination)}>
            <View style={[styles.marker, styles.destinationMarker]} />
          </Marker>
        ) : null}

        {driverLocation ? (
          <Marker coordinate={toLatLng(driverLocation)}>
            <View style={[styles.marker, styles.driverMarker]}>
              <View style={styles.driverInner} />
            </View>
          </Marker>
        ) : null}
      </GoogleMapView>

      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        {children}
      </View>
    </View>
  );
}

function toLatLng(value: RideEstimateWaypoint | RideMapCoordinate): LatLng {
  return {
    latitude: value.lat,
    longitude: value.lng,
  };
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.mapBase,
    overflow: "hidden",
    position: "relative",
  },
  myLocationTarget: {
    width: 48,
    height: 48,
    borderRadius: 24,
    // All but invisible: a fully clear view is not tappable on some Androids.
    backgroundColor: "rgba(255,255,255,0.01)",
  },
  marker: {
    borderColor: theme.colors.black,
    borderWidth: theme.borders.thick,
    ...theme.shadows.card,
  },
  pickupMarker: {
    width: 16,
    height: 16,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.orange,
  },
  stopMarker: {
    width: 14,
    height: 14,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.white,
  },
  destinationMarker: {
    width: 18,
    height: 18,
    borderRadius: 5,
    backgroundColor: theme.colors.green,
  },
  driverMarker: {
    width: 24,
    height: 24,
    borderRadius: theme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.black,
  },
  driverInner: {
    width: 10,
    height: 10,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.white,
  },
});
