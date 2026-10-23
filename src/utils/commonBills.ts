import type { Txn } from '@/db/types';

export interface CommonBill {
  key: string;
  type: Txn['type'];
  amount: number;
  categoryId: string | null;
  accountId: string;
  toAccountId: string | null;
  note: string;
  count: number;
  lastDate: string;
}

/** 同类型、分类、账户和备注在窗口内出现至少两次，才视为常用账单。 */
export function groupCommonBills(transactions: Txn[], limit = 4): CommonBill[] {
  const groups = new Map<string, CommonBill>();
  for (const txn of transactions) {
    const note = txn.note.trim();
    const key = [txn.type, txn.categoryId ?? '', txn.accountId, txn.toAccountId ?? '',
      note.toLocaleLowerCase()].join('|');
    const existing = groups.get(key);
    if (existing) existing.count += 1;
    else {
      groups.set(key, {
        key,
        type: txn.type,
        amount: txn.amount,
        categoryId: txn.categoryId,
        accountId: txn.accountId,
        toAccountId: txn.toAccountId,
        note,
        count: 1,
        lastDate: txn.date,
      });
    }
  }
  return [...groups.values()]
    .filter((bill) => bill.count >= 2)
    .sort((a, b) => b.count - a.count || b.lastDate.localeCompare(a.lastDate))
    .slice(0, limit);
}
