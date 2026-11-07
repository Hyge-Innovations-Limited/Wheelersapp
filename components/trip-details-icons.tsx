import Svg, { Circle, Ellipse, Path, Rect } from "react-native-svg";

/**
 * The trip details icons (people, luggage, pet, note): the same drawings as
 * the WhatsApp ride page's box (widget/ride/ride.html), so both look alike.
 */
export type TripIconName = "people" | "luggage" | "pet" | "note";

export function TripIcon({ name, size = 22, color }: { name: TripIconName; size?: number; color: string }) {
  const stroke = { stroke: color, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {name === "people" ? (
        <>
          <Circle cx={9} cy={8} r={3.5} {...stroke} />
          <Path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" {...stroke} />
          <Path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" {...stroke} />
          <Path d="M18.5 14.3c1.8.8 3 2.9 3 5.7" {...stroke} />
        </>
      ) : name === "luggage" ? (
        <>
          <Rect x={4} y={7} width={16} height={13} rx={2.5} {...stroke} />
          <Path d="M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7" {...stroke} />
          <Path d="M8 11v5M16 11v5" {...stroke} />
        </>
      ) : name === "pet" ? (
        <>
          <Ellipse cx={6} cy={10} rx={1.8} ry={2.3} {...stroke} />
          <Ellipse cx={10} cy={6} rx={1.8} ry={2.3} {...stroke} />
          <Ellipse cx={14} cy={6} rx={1.8} ry={2.3} {...stroke} />
          <Ellipse cx={18} cy={10} rx={1.8} ry={2.3} {...stroke} />
          <Path d="M12 12c-2.6 0-5 3-5 5.4C7 19 8.2 20 9.6 20c1 0 1.6-.5 2.4-.5s1.4.5 2.4.5c1.4 0 2.6-1 2.6-2.6C17 15 14.6 12 12 12z" {...stroke} />
        </>
      ) : (
        <>
          <Path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" {...stroke} />
          <Path d="M13.5 6.5l4 4" {...stroke} />
        </>
      )}
    </Svg>
  );
}
