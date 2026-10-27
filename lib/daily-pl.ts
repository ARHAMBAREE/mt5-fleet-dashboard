/** Fleet reporting day matches broker server day. */
export function reportingDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}
export function todayRealized(value: number | null | undefined, day?: string | null, now = new Date()): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return value;
}
