import type { ReactNode } from 'react';

import { useDriverSession } from '@/lib/driver-session';
import { LiveCallProvider } from '@/lib/live-call/call-session';
import { useRideSession } from '@/lib/ride-session';

/** Live call in the driver app, on the driver session's socket. */
export function DriverLiveCallHost({ children }: { children: ReactNode }) {
  const { sendCallMessage } = useDriverSession();
  return <LiveCallProvider send={sendCallMessage}>{children}</LiveCallProvider>;
}

/** Live call in the rider app, on the ride session's socket. */
export function RiderLiveCallHost({ children }: { children: ReactNode }) {
  const { sendCallMessage } = useRideSession();
  return <LiveCallProvider send={sendCallMessage}>{children}</LiveCallProvider>;
}
