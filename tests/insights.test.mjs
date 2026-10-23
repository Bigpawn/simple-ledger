import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMonthlyInsight } from '../src/utils/insights.ts';

const day = (value, expense = 0, income = 0) => ({ day: value, expense, income });

test('当月按已过天数与上月同期比较，并预估月底', () => {
  const result = buildMonthlyInsight({
    current: [day(1, 10000), day(2, 5000)],
    previous: [day(1, 5000), day(2, 5000), day(3, 9000)],
    mode: 'expense',
    compareDays: 2,
    projectionDays: 30,
  });
  assert.equal(result.currentTotal, 15000);
  assert.equal(result.previousComparable, 10000);
  assert.equal(result.delta, 5000);
  assert.equal(result.percent, 50);
  assert.equal(result.dailyAverage, 7500);
  assert.equal(result.projectedTotal, 225000);
  assert.equal(result.recordedDays, 2);
});

test('收入模式只累计收入，历史月份不做月底预估', () => {
  const result = buildMonthlyInsight({
    current: [day(1, 9000, 30000), day(15, 1000, 20000)],
    previous: [day(1, 1000, 25000)],
    mode: 'income',
    compareDays: 31,
  });
  assert.equal(result.currentTotal, 50000);
  assert.equal(result.previousComparable, 25000);
  assert.equal(result.delta, 25000);
  assert.equal(result.percent, 100);
  assert.equal(result.projectedTotal, null);
  assert.equal(result.recordedDays, 2);
});

test('上月同期为零时不给虚假百分比', () => {
  const result = buildMonthlyInsight({
    current: [day(1, 1000)],
    previous: [],
    mode: 'expense',
    compareDays: 10,
    projectionDays: 31,
  });
  assert.equal(result.delta, 1000);
  assert.equal(result.percent, null);
  assert.equal(result.projectedTotal, 3100);
});
