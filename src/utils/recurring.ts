function monthIndex(month: string): number {
  const [year, value] = month.split('-').map(Number);
  return year * 12 + value - 1;
}

function formatMonth(index: number): string {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** 31 日等日期在小月自动落到该月最后一天。 */
export function monthlyDueDate(month: string, dayOfMonth: number): string {
  const [year, value] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, value, 0)).getUTCDate();
  const day = Math.min(Math.max(1, dayOfMonth), lastDay);
  return `${month}-${String(day).padStart(2, '0')}`;
}

/** 最多生成最近 12 个应到期月份，避免长期未打开后堆积过多账单。 */
export function recurringMonths(startMonth: string, throughMonth: string, maxMonths = 12): string[] {
  const start = monthIndex(startMonth);
  const end = monthIndex(throughMonth);
  if (start > end) return [];
  const first = Math.max(start, end - maxMonths + 1);
  return Array.from({ length: end - first + 1 }, (_, i) => formatMonth(first + i));
}
