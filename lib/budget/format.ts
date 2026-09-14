export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = String(abs % 100).padStart(2, "0");
  return `${sign}$${dollars.toLocaleString("en-US")}.${remainder}`;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * 'YYYY-MM-DD' -> 'Sep 1'.
 *
 * String slicing only. Parsing this into a Date to format it is how a due
 * date one timezone west of the server starts rendering as the day before.
 */
export function formatShortDate(iso: string): string {
  const [, month, day] = iso.split("-");
  const name = MONTHS[Number(month) - 1];
  return name ? `${name} ${Number(day)}` : iso;
}
