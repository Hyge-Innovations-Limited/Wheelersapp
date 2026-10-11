import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import { rider } from "@/constants/rider-theme";

const BUILDINGS: readonly [number, number, number][] = [
  [10, 44, 130], [62, 56, 170], [126, 38, 110], [172, 62, 152], [242, 42, 98], [292, 52, 140], [352, 38, 116],
];
const STRIP = 390;

/**
 * The Wheelers car driving past a skyline: the road slides, the city drifts
 * and the car bobs. It holds still for anyone who has asked the phone to
 * reduce motion.
 */
export function DriveScene({
  height = 200,
  ground = rider.colors.ink,
  skyline = rider.colors.tint,
  dash = rider.colors.cream,
  showSkyline = true,
}: {
  height?: number;
  ground?: string;
  skyline?: string;
  dash?: string;
  showSkyline?: boolean;
}) {
  const city = useRef(new Animated.Value(0)).current;
  const road = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let loops: Animated.CompositeAnimation[] = [];
    let cancelled = false;

    void AccessibilityInfo.isReduceMotionEnabled().then((still) => {
      if (cancelled || still) return;
      loops = [
        Animated.loop(
          Animated.timing(city, { toValue: 1, duration: 26000, easing: Easing.linear, useNativeDriver: true }),
        ),
        Animated.loop(
          Animated.timing(road, { toValue: 1, duration: 700, easing: Easing.linear, useNativeDriver: true }),
        ),
        Animated.loop(
          Animated.sequence([
            Animated.timing(bob, { toValue: 1, duration: 250, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            Animated.timing(bob, { toValue: 0, duration: 250, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          ]),
        ),
      ];
      loops.forEach((loop) => loop.start());
    });

    return () => {
      cancelled = true;
      loops.forEach((loop) => loop.stop());
    };
  }, [bob, city, road]);

  const roadHeight = 42;
  const tallest = 170;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.scene, { height }]}>
      {showSkyline ? (
        <Animated.View
          style={[
            styles.city,
            { bottom: roadHeight, height: tallest },
            { transform: [{ translateX: city.interpolate({ inputRange: [0, 1], outputRange: [0, -STRIP] }) }] },
          ]}>
          {[0, STRIP].flatMap((offset) =>
            BUILDINGS.map(([x, width, tall]) => (
              <View
                key={`${offset}-${x}`}
                style={{ position: "absolute", bottom: 0, left: offset + x, width, height: tall, backgroundColor: skyline }}
              />
            )),
          )}
        </Animated.View>
      ) : null}

      <View style={[styles.road, { height: roadHeight, backgroundColor: ground }]}>
        <Animated.View
          style={[
            styles.dashes,
            { transform: [{ translateX: road.interpolate({ inputRange: [0, 1], outputRange: [0, -52] }) }] },
          ]}>
          {Array.from({ length: 12 }, (_, index) => (
            <View key={index} style={[styles.dash, { backgroundColor: dash }]} />
          ))}
        </Animated.View>
      </View>

      <Animated.View
        style={[
          styles.car,
          { bottom: roadHeight - 20 },
          { transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) }] },
        ]}>
        <Svg height={100} viewBox="86 236 204 100" width={204}>
          <Path
            d="M102 318h170c7 0 12-5 12-12v-9c0-7-5-12-12-13l-26-5-19-21c-4-4-9-6-14-6h-54c-6 0-11 3-14 8l-13 19-23 5c-7 2-12 7-12 14v8c0 7 5 12 12 12z"
            fill={rider.colors.orange}
          />
          <Path d="M152 262h30v20h-44zM190 262h23l17 20h-40z" fill="#2B2B2B" />
          <Rect fill="#FFFFFF" height={7} rx={3} width={14} x={262} y={292} />
          <Circle cx={140} cy={320} fill="#2B2B2B" r={15} />
          <Circle cx={140} cy={320} fill="#FFFFFF" r={7} />
          <Circle cx={242} cy={320} fill="#2B2B2B" r={15} />
          <Circle cx={242} cy={320} fill="#FFFFFF" r={7} />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  scene: { width: "100%", overflow: "hidden" },
  city: { position: "absolute", left: 0, width: STRIP * 2 },
  road: { position: "absolute", left: 0, right: 0, bottom: 0, justifyContent: "center", overflow: "hidden" },
  dashes: { flexDirection: "row", gap: 22, width: 12 * 52 },
  dash: { width: 30, height: 4, borderRadius: 2 },
  car: { position: "absolute", alignSelf: "center" },
});
