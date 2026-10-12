import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

/**
 * Whether the rider has chosen to hide their wallet balance (someone may be
 * looking at the phone). One choice for every screen that shows the balance,
 * remembered on the phone.
 */
const KEY = "wheelers.wallet.balance-hidden";
export const HIDDEN_BALANCE = "₦ • • • •";

let hidden = false;
let loaded = false;
const listeners = new Set<(value: boolean) => void>();

function set(value: boolean): void {
  hidden = value;
  listeners.forEach((listener) => listener(value));
}

export function useBalanceHidden(): { hidden: boolean; toggle: () => void } {
  const [value, setValue] = useState(hidden);

  useEffect(() => {
    listeners.add(setValue);
    if (!loaded) {
      loaded = true;
      void AsyncStorage.getItem(KEY)
        .then((stored) => set(stored === "1"))
        .catch(() => undefined);
    } else {
      setValue(hidden);
    }
    return () => {
      listeners.delete(setValue);
    };
  }, []);

  const toggle = useCallback(() => {
    const next = !hidden;
    set(next);
    void AsyncStorage.setItem(KEY, next ? "1" : "0").catch(() => undefined);
  }, []);

  return { hidden: value, toggle };
}
