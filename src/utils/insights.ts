import type { DailyStat } from '@/db/types';

interface MonthlyInsightInput {
  current: DailyStat[];
  previous: DailyStat[];
  mode: 'expense' | 'income';
  compareDays: number;
  projectionDays?: number;
}

export interface MonthlyInsight {
  currentTotal: number;
  previousComparable: number;
  delta: number;
  percent: number | null;
  dailyAverage: number;
  projectedTotal: number | null;
  recordedDays: number;
}

function valueFor(stat: DailyStat | undefined, mode: 'expense' | 'income'): number {
  return stat?.[mode] ?? 0;
}

export function buildMonthlyInsight({
  current,
  previous,
  mode,
  compareDays,
  projectionDays,
}: MonthlyInsightInput): MonthlyInsight {
  const currentTotal = current.reduce((sum, stat) => sum + valueFor(stat, mode), 0);
  const previousComparable = previous
    .filter((stat) => stat.day <= compareDays)
    .reduce((sum, stat) => sum + valueFor(stat, mode), 0);
  const delta = currentTotal - previousComparable;
  const recordedDays = current.filter((stat) => valueFor(stat, mode) > 0).length;
  return {
    currentTotal,
    previousComparable,
    delta,
    percent: previousComparable > 0 ? (delta / previousComparable) * 100 : null,
    dailyAverage: compareDays > 0 ? currentTotal / compareDays : 0,
    projectedTotal:
      projectionDays && compareDays > 0
        ? Math.round((currentTotal / compareDays) * projectionDays)
        : null,
    recordedDays,
  };
}
