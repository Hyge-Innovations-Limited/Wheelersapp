import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

/** How long the app may be away (screen locked, another app) before its maps are rebuilt on return. */
const REBUILD_AFTER_MS = 2 * 60_000;

/**
 * A key for a map that changes when the app comes back after a while away.
 *
 * Left in the background for long, Android pauses the native map and can
 * hand it back without its blue dot, pins or route: a plain map nobody
 * moves. Giving the map this as its `key` builds it afresh on return, and
 * the screen frames it again as it does on opening. A quick look away
 * changes nothing.
 */
export function useMapRevival(afterMs = REBUILD_AFTER_MS): number {
  const [generation, setGeneration] = useState(0);
  const leftAt = useRef<number | null>(null);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        if (leftAt.current !== null && Date.now() - leftAt.current >= afterMs) {
          setGeneration((value) => value + 1);
        }
        leftAt.current = null;
      } else if (leftAt.current === null) {
        leftAt.current = Date.now();
      }
    });
    return () => subscription.remove();
  }, [afterMs]);

  return generation;
}
