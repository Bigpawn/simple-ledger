import test from 'node:test';
import assert from 'node:assert/strict';
import { monthSequence, splitInstallment } from '../src/utils/installments.ts';

test('本金能整除时每期金额一致', () => {
  assert.deepEqual(splitInstallment(120000, 12, 0), Array(12).fill(10000));
});

test('除不尽时余数落在最后一期，总额精确', () => {
  const parts = splitInstallment(100000, 3, 0);
  assert.deepEqual(parts, [33333, 33333, 33334]);
  assert.equal(parts.reduce((a, b) => a + b, 0), 100000);
});

test('手续费均摊并计入总额', () => {
  const parts = splitInstallment(100000, 3, 10000);
  assert.equal(parts.reduce((a, b) => a + b, 0), 110000);
  assert.deepEqual(parts, [36666, 36666, 36668]);
});

test('一期时金额为全部本金加手续费', () => {
  assert.deepEqual(splitInstallment(99999, 1, 1234), [101233]);
});

test('期数非法时返回空数组', () => {
  assert.deepEqual(splitInstallment(1000, 0), []);
  assert.deepEqual(splitInstallment(1000, -3), []);
});

test('月份序列跨年正确', () => {
  assert.deepEqual(monthSequence('2026-11', 4), ['2026-11', '2026-12', '2027-01', '2027-02']);
  assert.deepEqual(monthSequence('2026-01', 2), ['2026-01', '2026-02']);
});
