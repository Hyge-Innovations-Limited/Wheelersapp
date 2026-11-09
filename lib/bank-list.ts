/**
 * The bank list on the Withdraw screen: the popular banks first, then every bank A–Z under its letter,
 * search, and each bank's initials for when it has no logo. The webview has the same list
 * (Wheelers-Backend apps/api-gateway/widget/shared/banks.js); keep the two in step.
 */

export type ListedBank = { code: string | null; name: string };

/** Pinned on top, in this order, when the bank is in the list: OPay, Moniepoint, PalmPay, Kuda, GTBank, Access, First Bank, UBA, Zenith, Wema. */
export const POPULAR_BANK_CODES = ["999992", "50515", "999991", "50211", "058", "044", "011", "033", "057", "035"];

/** Words left out of a bank's initials. */
const FILLER = /^(bank|banks|of|the|and|plc|ltd|limited|nigeria|nig|mfb|microfinance|mortgage|psb|services|service|company|co|financial|finance)$/i;

/** "Guaranty Trust Bank" → "GT"; a one-word name → its first two letters. */
export function bankInitials(name: string): string {
  const words = String(name || "").replace(/[^A-Za-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  const kept = words.filter((w) => !FILLER.test(w));
  const use = kept.length ? kept : words;
  if (use.length === 0) return "?";
  if (use.length === 1) return use[0].slice(0, 2).toUpperCase();
  return (use[0][0] + use[1][0]).toUpperCase();
}

const byName = (a: ListedBank, b: ListedBank) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });

/** No search: [{ title: "Popular", data }, { title: "A", data }, …]; "#" holds names that start with a digit. */
export function bankSections<T extends ListedBank>(banks: T[]): { title: string; data: T[] }[] {
  const out: { title: string; data: T[] }[] = [];
  const byCode = new Map<string, T>();
  for (const b of banks) if (b.code) byCode.set(b.code, b);
  const popular = POPULAR_BANK_CODES.map((code) => byCode.get(code)).filter((b): b is T => Boolean(b));
  if (popular.length) out.push({ title: "Popular", data: popular });
  const letters = new Map<string, T[]>();
  for (const b of [...banks].sort(byName)) {
    const first = b.name.trim().charAt(0).toUpperCase();
    const key = /[A-Z]/.test(first) ? first : "#";
    let group = letters.get(key);
    if (!group) {
      group = [];
      letters.set(key, group);
      out.push({ title: key, data: group });
    }
    group.push(b);
  }
  return out;
}

/** Every bank whose name has the search in it: names that start with it first, then a word that does, then the rest. */
export function searchBanks<T extends ListedBank>(banks: T[], query: string): T[] {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [...banks].sort(byName);
  const rank = (b: T) => {
    const n = b.name.toLowerCase();
    if (n.startsWith(q)) return 0;
    if ((" " + n).includes(" " + q)) return 1;
    return 2;
  };
  return banks.filter((b) => b.name.toLowerCase().includes(q)).sort((a, b) => rank(a) - rank(b) || byName(a, b));
}
