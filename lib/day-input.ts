/**
 * A date typed as DD/MM/YYYY, the way it is printed on Nigerian papers.
 * The server takes and gives YYYY-MM-DD.
 */

/** As the driver types: digits only, slashes put in for them. "3112" → "31/12". */
export function maskDay(text: string): string {
  const digits = text.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** "31/12/2027" → "2027-12-31". Null until it is a whole, real date. */
export function dayToIso(text: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

/** "2027-12-31" → "31/12/2027", for a form that starts from what was saved. */
export function isoToDay(iso: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2027-12-31" → "31 Dec 2027", for reading. */
export function isoToWords(iso: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return match ? `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}` : "";
}

/** Has this day already gone? `today` is YYYY-MM-DD (the phone's own date). */
export function isPast(iso: string, today: string = new Date().toISOString().slice(0, 10)): boolean {
  return iso < today;
}
