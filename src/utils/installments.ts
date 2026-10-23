/** 分期金额与期次计算（纯函数，便于测试） */

/**
 * 把本金与手续费均摊到各期，余数全部落在最后一期，保证总额精确等于 principal + fee。
 * 单位：分。
 */
export function splitInstallment(principal: number, periods: number, fee = 0): number[] {
  if (periods <= 0) return [];
  const base = Math.floor(principal / periods);
  const feeBase = Math.floor(fee / periods);
  const amounts = Array.from({ length: periods }, () => base + feeBase);
  amounts[periods - 1] += principal - base * periods + (fee - feeBase * periods);
  return amounts;
}

/** 从 startMonth（YYYY-MM）开始的连续月份 */
export function monthSequence(startMonth: string, count: number): string[] {
  const [year, month] = startMonth.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return [];
  return Array.from({ length: count }, (_, index) => {
    const total = year * 12 + (month - 1) + index;
    const y = Math.floor(total / 12);
    const m = (total % 12) + 1;
    return `${y}-${String(m).padStart(2, '0')}`;
  });
}
