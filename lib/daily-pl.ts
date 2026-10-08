/** Fleet reporting day uses Pakistan time (UTC+5), consistently across brokers. */
export function reportingDay(now = new Date()): string {
  return new Date(now.getTime() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
export function todayRealized(value: number | null, day: string | null, now = new Date()): number | null {
  return day === reportingDay(now) ? value : null;
}
