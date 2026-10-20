import { CommonActions } from "@react-navigation/native";
import { useNavigationContainerRef, useRouter } from "expo-router";
import { useCallback } from "react";

/**
 * Home, fresh, after something ends a flow (a ride cancelled, a trip over and
 * rated, a search closed, signing up done).
 *
 * `router.replace("/rider")` from deep in a booking found home already lower
 * in the stack and walked back to it: Cancel → Finding drivers → Set your
 * price → Where to → Home, a reverse slide through every screen, with the
 * finished ones still there for Back to land on. This clears the stack and
 * opens home anew, moving forward, so Back from home has nowhere stale to go.
 * Ordinary Back buttons are untouched.
 */
export function useGoHome(): () => void {
  const navigation = useNavigationContainerRef();
  const router = useRouter();
  return useCallback(() => {
    if (navigation?.isReady()) {
      navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: "rider" }] }));
      return;
    }
    router.replace("/rider");
  }, [navigation, router]);
}
