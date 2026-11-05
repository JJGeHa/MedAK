/** Small helpers shared by server and client. */

/** Only ever redirect within this site, so a crafted link can't send people elsewhere after login. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/app";
  return next;
}

/** The annual deadline for an income year: 20 January after it, or the following Monday. */
export function annualDeadline(incomeYear: number): Date {
  const date = new Date(Date.UTC(incomeYear + 1, 0, 20));
  const day = date.getUTCDay();
  if (day === 6) date.setUTCDate(22);
  if (day === 0) date.setUTCDate(21);
  return date;
}

/** Whole days from one date until another, ignoring the time of day. */
export function daysUntil(deadline: Date, today: Date): number {
  const a = Date.UTC(deadline.getUTCFullYear(), deadline.getUTCMonth(), deadline.getUTCDate());
  const b = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((a - b) / 86_400_000);
}

/** The income year people are most likely reporting: last year in January, otherwise this year. */
export function likelyIncomeYear(today: Date): number {
  return today.getMonth() === 0 && today.getDate() <= 20 ? today.getFullYear() - 1 : today.getFullYear();
}

/** A CPR number with the last four digits hidden, as shown in lists. */
export function maskId(id: string | undefined): string {
  if (!id) return "";
  return id.length === 10 ? `${id.slice(0, 6)}-••••` : id;
}
