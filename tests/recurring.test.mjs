import test from 'node:test';
import assert from 'node:assert/strict';
import { monthlyDueDate, recurringMonths } from '../src/utils/recurring.ts';

test('月底日期自动落到当月最后一天', () => {
  assert.equal(monthlyDueDate('2026-02', 31), '2026-02-28');
  assert.equal(monthlyDueDate('2024-02', 31), '2024-02-29');
  assert.equal(monthlyDueDate('2026-04', 31), '2026-04-30');
  assert.equal(monthlyDueDate('2026-10', 15), '2026-10-15');
});

test('只生成开始月份到目标月份的连续月份', () => {
  assert.deepEqual(recurringMonths('2026-08', '2026-10'), ['2026-08', '2026-09', '2026-10']);
  assert.deepEqual(recurringMonths('2026-11', '2026-10'), []);
});

test('长期未打开时最多保留最近十二个周期', () => {
  const months = recurringMonths('2024-01', '2026-10');
  assert.equal(months.length, 12);
  assert.equal(months[0], '2025-11');
  assert.equal(months[11], '2026-10');
});
