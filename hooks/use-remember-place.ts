import { useGlobalSearchParams, usePathname } from "expo-router";
import { useEffect } from "react";

import { appVariant } from "@/lib/app-variant";
import { rememberPlace } from "@/lib/resume-place";

/**
 * Remembers the screen someone is on as they move (lib/resume-place), so an
 * app Android closed in the background opens there again. Mounted once, in
 * the root layout.
 */
export function useRememberPlace(): void {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const serialized = JSON.stringify(params);

  useEffect(() => {
    void rememberPlace(pathname, JSON.parse(serialized) as Record<string, unknown>, appVariant);
  }, [pathname, serialized]);
}
