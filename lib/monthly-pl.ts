import { reportingDay } from './daily-pl';

export interface MonthlyPl {
  startedAt: string;
  month: string;
  day: string;
  daily: number;
  total: number;
}
export function readMonthlyPl(value: unknown): MonthlyPl | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as MonthlyPl;
  return typeof v.startedAt === 'string' && typeof v.month === 'string' && typeof v.day === 'string'
    && Number.isFinite(v.daily) && Number.isFinite(v.total) ? v : null;
}
/** Observe daily cumulative profit. First report is a baseline, never historical backfill. */
export function observeMonthlyPl(previous: unknown, daily: number | undefined, day: string | undefined, now = new Date()): MonthlyPl | null {
  const old = readMonthlyPl(previous);
  if (daily === undefined || !Number.isFinite(daily) || day !== reportingDay(now)) return old;
  const month = day.slice(0, 7);
  if (!old) return { startedAt: now.toISOString(), month, day, daily, total: 0 };
  if (day < old.day) return old;
  const total = month !== old.month ? daily : old.total + (day === old.day ? daily - old.daily : daily);
  return { ...old, month, day, daily, total };
}
/** Record monthly P&L: directly from EA if provided, or observe daily cumulative profit baseline. */
export function recordMonthlyPl(
  previous: unknown,
  monthly: number | undefined,
  month: string | undefined,
  daily: number | undefined,
  day: string | undefined,
  now = new Date()
): MonthlyPl | null {
  const old = readMonthlyPl(previous);
  if (monthly !== undefined && Number.isFinite(monthly)) {
    const currentMonth = (month ?? day ?? reportingDay(now)).slice(0, 7);
    const currentDay = day ?? reportingDay(now);
    return {
      startedAt: old?.startedAt ?? now.toISOString(),
      month: currentMonth,
      day: currentDay,
      daily: daily !== undefined && Number.isFinite(daily) ? daily : (old?.daily ?? 0),
      total: monthly,
    };
  }
  return observeMonthlyPl(previous, daily, day, now);
}
export function monthlyValue(value: unknown, now = new Date()): number | null {
  const state = readMonthlyPl(value);
  return state ? state.month === reportingDay(now).slice(0, 7) ? state.total : 0 : null;
}
