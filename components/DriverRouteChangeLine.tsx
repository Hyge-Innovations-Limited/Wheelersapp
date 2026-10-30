import { useEffect, useState } from 'react';
import { AppText } from '@/components/app-text';
import { ROUTE_LINE_MS, routeChangeLine, type DriverRide } from '@/lib/driver-session-reducer';
import { theme } from '@/theme';

/** The rider's last route change, in one short line; gone after a minute. */
export function DriverRouteChangeLine({ change }: { change: DriverRide['routeChange'] }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!change?.at) return;
    setNow(Date.now());
    const t = setTimeout(() => setNow(Date.now()), Math.max(0, change.at + ROUTE_LINE_MS - Date.now()) + 50);
    return () => clearTimeout(t);
  }, [change]);
  const line = routeChangeLine(change, now);
  if (!line) return null;
  return (
    <AppText variant="bodySmall" color={theme.colors.black} numberOfLines={2} accessibilityLiveRegion="polite" style={{ textAlign: 'center', fontWeight: '700' }}>
      {line}
    </AppText>
  );
}
