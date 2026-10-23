import dayjs from 'dayjs';

/** 'YYYY-MM' */
export function monthKey(d: Date | string = new Date()): string {
  return dayjs(d).format('YYYY-MM');
}

/** 'YYYY-MM-DD' */
export function dateKey(d: Date = new Date()): string {
  return dayjs(d).format('YYYY-MM-DD');
}

export function addMonth(month: string, delta: number): string {
  return dayjs(`${month}-01`).add(delta, 'month').format('YYYY-MM');
}

/** "2026-10" -> "2026年10月" */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-');
  return `${y}年${Number(m)}月`;
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 日期键 -> "今天"/"昨天"/"10月17日 周六" */
export function dayLabel(date: string): string {
  const d = dayjs(date);
  const today = dayjs();
  if (d.isSame(today, 'day')) return '今天';
  if (d.isSame(today.subtract(1, 'day'), 'day')) return '昨天';
  return `${d.month() + 1}月${d.date()}日 ${WEEKDAYS[d.day()]}`;
}

export function daysInMonth(month: string): number {
  return dayjs(`${month}-01`).daysInMonth();
}
