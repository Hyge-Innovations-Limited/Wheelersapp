import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import Svg, { Circle, Line, Path, Polyline } from 'react-native-svg';

import type { StellarTransferView } from '@/lib/api';
import { theme } from '@/theme';

/** Shared by the Stellar screens: formatting, what a transfer is, copying, icons. */

export type IconName = ComponentProps<typeof MaterialIcons>['name'];

export function xlmText(amount: number | string, digits = 2): string {
  return Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

export function ngnText(amount: number): string {
  return `NGN ${Math.round(amount).toLocaleString('en-NG')}`;
}

export function shortKey(key: string, keep = 6): string {
  return key.length > keep * 2 + 1 ? `${key.slice(0, keep)}…${key.slice(-keep)}` : key;
}

export function whenText(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** A Stellar public address: G and 55 more base-32 characters. */
export function looksLikeAddress(text: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(text.trim());
}

/** What a transfer is, from this person's side. */
export function transferLabel(t: StellarTransferView): { title: string; icon: IconName } {
  const incoming = t.direction === 'in';
  switch (t.kind) {
    case 'ACCOUNT_OPEN': return { title: 'Account opened', icon: 'account-balance-wallet' };
    case 'FARE': return { title: incoming ? 'Trip fare received' : 'Trip fare paid', icon: 'directions-car' };
    case 'COMMISSION': return { title: 'Wheelers commission', icon: 'percent' };
    case 'RESET': return { title: 'Balance reset to 100 XLM', icon: 'restart-alt' };
    case 'WITHDRAWAL': return { title: incoming ? 'Received' : 'Sent', icon: incoming ? 'south-west' : 'north-east' };
    default: return { title: t.kind === 'TOPUP' ? 'Top-up' : t.kind, icon: incoming ? 'south-west' : 'north-east' };
  }
}

export function transferStatus(t: StellarTransferView): { label: string; color: string } {
  switch (t.status) {
    case 'CONFIRMED': return { label: 'Confirmed', color: theme.colors.green };
    case 'SKIPPED': return { label: 'Skipped', color: theme.colors.danger };
    case 'FAILED': return { label: 'Failed', color: theme.colors.danger };
    default: return { label: 'On its way', color: theme.colors.warning };
  }
}

/** A tap copies; the button says "Copied" for a moment. No pop-up. `key` tells several copy buttons apart. */
export function useCopy(): { copied: string | null; copy: (text: string, key?: string) => Promise<void> } {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const copy = async (text: string, key = 'default') => {
    await Clipboard.setStringAsync(text);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    setCopied(key);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), 2000);
  };
  return { copied, copy };
}

export function BackIcon({ size = 22, color = theme.colors.black }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Line x1="19" y1="12" x2="5" y2="12" />
      <Polyline points="12 19 5 12 12 5" />
    </Svg>
  );
}

export function CopyIcon({ size = 16 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={theme.colors.orange} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <Path d="M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z" />
    </Svg>
  );
}

export function ArrowUpIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={theme.colors.white} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Line x1="12" y1="19" x2="12" y2="5" />
      <Polyline points="5 12 12 5 19 12" />
    </Svg>
  );
}

export function ChevronRightIcon({ size = 18, color = theme.colors.muted }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="9 18 15 12 9 6" />
    </Svg>
  );
}

export function CheckIcon({ size = 18, color = theme.colors.orange }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="20 6 9 17 4 12" />
    </Svg>
  );
}

export function EyeIcon({ open, size = 20 }: { open: boolean; size?: number }) {
  const c = '#9C948D';
  if (open) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <Circle cx="12" cy="12" r="3" />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <Path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <Line x1="1" y1="1" x2="23" y2="23" />
    </Svg>
  );
}
