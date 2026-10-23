import test from 'node:test';
import assert from 'node:assert/strict';
import { groupCommonBills } from '../src/utils/commonBills.ts';

const txn = (id, date, amount, note, overrides = {}) => ({
  id,
  type: 'expense',
  amount,
  categoryId: 'cat-e0',
  accountId: 'acc-cash',
  toAccountId: null,
  date,
  note,
  createdAt: Number(id.replace(/\D/g, '')) || 1,
  ...overrides,
});

test('至少出现两次才推荐，并使用最近一次金额', () => {
  const bills = groupCommonBills([
    txn('a1', '2026-10-19', 1200, '早餐'),
    txn('a2', '2026-10-18', 1000, '早餐'),
    txn('a3', '2026-10-17', 900, '晚餐'),
  ]);
  assert.equal(bills.length, 1);
  assert.equal(bills[0].note, '早餐');
  assert.equal(bills[0].amount, 1200);
  assert.equal(bills[0].count, 2);
});

test('分类、账户或备注不同会分成不同常用账单', () => {
  const bills = groupCommonBills([
    txn('b1', '2026-10-19', 1200, '早餐'),
    txn('b2', '2026-10-18', 1100, '早餐'),
    txn('b3', '2026-10-17', 1100, '早餐', { accountId: 'acc-wechat' }),
    txn('b4', '2026-10-16', 800, '早餐', { categoryId: 'cat-e1' }),
  ]);
  assert.equal(bills.length, 1);
  assert.equal(bills[0].accountId, 'acc-cash');
  assert.equal(bills[0].categoryId, 'cat-e0');
});

test('按出现次数排序并限制数量', () => {
  const rows = [
    ...Array.from({ length: 4 }, (_, i) => txn(`c${i}`, `2026-10-1${i}`, 100, '公交')),
    ...Array.from({ length: 2 }, (_, i) => txn(`d${i}`, `2026-10-1${i}`, 200, '早餐')),
    ...Array.from({ length: 2 }, (_, i) => txn(`e${i}`, `2026-10-1${i}`, 300, '咖啡')),
  ];
  const bills = groupCommonBills(rows, 2);
  assert.deepEqual(bills.map((bill) => bill.note), ['公交', '早餐']);
});
