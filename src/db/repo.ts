import { ensureCategoryTree, getDb } from './database';
import { groupCommonBills } from '../utils/commonBills';
import { dateKey, monthKey } from '../utils/date';
import { monthlyDueDate, recurringMonths } from '../utils/recurring';
import type {
  Account,
  AccountBalance,
  AppSettings,
  BudgetMonth,
  Category,
  CategoryStat,
  ClaimStatus,
  DailyStat,
  DueRecurringBill,
  InstallmentEntry,
  InstallmentProgress,
  MonthSummary,
  RecurringRule,
  Tag,
  Txn,
} from './types';
import { monthSequence, splitInstallment } from '../utils/installments';

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ---------- transactions ---------- */

interface TxnRow {
  id: string;
  type: Txn['type'];
  amount: number;
  category_id: string | null;
  account_id: string;
  to_account_id: string | null;
  date: string;
  note: string;
  created_at: number;
  fee: number | null;
  discount: number | null;
  claim_status: string | null;
  claim_account_id: string | null;
  claim_txn_id: string | null;
  refund_of: string | null;
}

function rowToTxn(r: TxnRow): Txn {
  return {
    id: r.id,
    type: r.type,
    amount: r.amount,
    categoryId: r.category_id,
    accountId: r.account_id,
    toAccountId: r.to_account_id,
    date: r.date,
    note: r.note,
    createdAt: r.created_at,
    fee: r.fee ?? 0,
    discount: r.discount ?? 0,
    claimStatus: (r.claim_status as 'pending' | 'done' | null) ?? null,
    claimAccountId: r.claim_account_id ?? null,
    claimTxnId: r.claim_txn_id ?? null,
    refundOf: r.refund_of ?? null,
  };
}

const TXN_COLS =
  'id, type, amount, category_id, account_id, to_account_id, date, note, created_at, ' +
  'fee, discount, claim_status, claim_account_id, claim_txn_id, refund_of';

const TXN_PLACEHOLDERS = TXN_COLS.split(',').map(() => '?').join(',');

function txnValues(txn: Txn): (string | number | null)[] {
  return [
    txn.id,
    txn.type,
    txn.amount,
    txn.categoryId,
    txn.accountId,
    txn.toAccountId,
    txn.date,
    txn.note,
    txn.createdAt,
    txn.fee ?? 0,
    txn.discount ?? 0,
    txn.claimStatus ?? null,
    txn.claimAccountId ?? null,
    txn.claimTxnId ?? null,
    txn.refundOf ?? null,
  ];
}

export async function listTxnsByMonth(month: string): Promise<Txn[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<TxnRow>(
    `SELECT ${TXN_COLS} FROM transactions WHERE date LIKE ? ORDER BY date DESC, created_at DESC`,
    [`${month}%`]
  );
  return rows.map(rowToTxn);
}

export async function getTxn(id: string): Promise<Txn | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<TxnRow>(
    `SELECT ${TXN_COLS} FROM transactions WHERE id = ?`,
    [id]
  );
  return row ? rowToTxn(row) : null;
}

export async function insertTxn(txn: Txn): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO transactions (${TXN_COLS}) VALUES (${TXN_PLACEHOLDERS})`,
    txnValues(txn)
  );
}

export async function updateTxn(txn: Txn): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE transactions SET type=?, amount=?, category_id=?, account_id=?, to_account_id=?,
       date=?, note=?, fee=?, discount=?, claim_status=?, claim_account_id=?, claim_txn_id=?,
       refund_of=? WHERE id=?`,
    [
      txn.type,
      txn.amount,
      txn.categoryId,
      txn.accountId,
      txn.toAccountId,
      txn.date,
      txn.note,
      txn.fee ?? 0,
      txn.discount ?? 0,
      txn.claimStatus ?? null,
      txn.claimAccountId ?? null,
      txn.claimTxnId ?? null,
      txn.refundOf ?? null,
      txn.id,
    ]
  );
}

export async function deleteTxn(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM transactions WHERE id=?', [id]);
}

/** 从最近半年高频、同分类/账户/备注的流水自动生成常用账单。 */
export async function listCommonBills(sinceDate: string, limit = 4) {
  const db = await getDb();
  const rows = await db.getAllAsync<TxnRow>(
    `SELECT ${TXN_COLS} FROM transactions
     WHERE date >= ? ORDER BY date DESC, created_at DESC LIMIT 2000`,
    [sinceDate]
  );
  return groupCommonBills(rows.map(rowToTxn), limit);
}

export interface TxnSearchFilters {
  type?: Txn['type'];
  accountId?: string;
  categoryId?: string;
}

export interface TxnSearchResult {
  items: Txn[];
  truncated: boolean;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

/** 跨月份搜索；空关键词时用于浏览最近账单。 */
export async function searchTxns(
  query: string,
  filters: TxnSearchFilters = {},
  limit = 500
): Promise<TxnSearchResult> {
  const db = await getDb();
  const clauses: string[] = [];
  const params: (string | number)[] = [];
  if (filters.type) {
    clauses.push('t.type = ?');
    params.push(filters.type);
  }
  if (filters.accountId) {
    clauses.push('(t.account_id = ? OR t.to_account_id = ?)');
    params.push(filters.accountId, filters.accountId);
  }
  if (filters.categoryId) {
    // 选中一级分类时，同时匹配它的子分类
    clauses.push(
      '(t.category_id = ? OR t.category_id IN (SELECT id FROM categories WHERE parent_id = ?))'
    );
    params.push(filters.categoryId, filters.categoryId);
  }
  const search = query.trim();
  if (search) {
    const like = `%${escapeLike(search)}%`;
    clauses.push(`(
      t.note LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\' OR
      a.name LIKE ? ESCAPE '\\' OR ta.name LIKE ? ESCAPE '\\' OR
      printf('%.2f', t.amount / 100.0) LIKE ? ESCAPE '\\'
    )`);
    params.push(like, like, like, like, like);
  }
  params.push(limit + 1);
  const rows = await db.getAllAsync<TxnRow>(
    `SELECT t.id, t.type, t.amount, t.category_id, t.account_id, t.to_account_id,
       t.date, t.note, t.created_at
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     LEFT JOIN accounts a ON a.id = t.account_id
     LEFT JOIN accounts ta ON ta.id = t.to_account_id
     ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
     ORDER BY t.date DESC, t.created_at DESC LIMIT ?`,
    params
  );
  return {
    items: rows.slice(0, limit).map(rowToTxn),
    truncated: rows.length > limit,
  };
}

/* ---------- aggregates ---------- */

export async function monthSummary(month: string): Promise<MonthSummary> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ expense: number; income: number }>(
    `SELECT
       IFNULL(SUM(CASE WHEN type='expense' THEN amount END),0) AS expense,
       IFNULL(SUM(CASE WHEN type='income' THEN amount END),0) AS income
     FROM transactions WHERE date LIKE ?`,
    [`${month}%`]
  );
  const expense = row?.expense ?? 0;
  const income = row?.income ?? 0;
  return { expense, income, balance: income - expense };
}

export async function categoryStats(
  month: string,
  type: 'expense' | 'income'
): Promise<CategoryStat[]> {
  const db = await getDb();
  return db.getAllAsync<CategoryStat>(
    `SELECT c.id AS categoryId, c.name, c.icon, SUM(t.amount) AS total, COUNT(*) AS count
     FROM transactions t JOIN categories c ON c.id = t.category_id
     WHERE t.type = ? AND t.date LIKE ?
     GROUP BY c.id ORDER BY total DESC`,
    [type, `${month}%`]
  );
}

export async function dailyStats(month: string): Promise<DailyStat[]> {
  const db = await getDb();
  return db.getAllAsync<DailyStat>(
    `SELECT CAST(substr(date, 9, 2) AS INTEGER) AS day,
       IFNULL(SUM(CASE WHEN type='expense' THEN amount END),0) AS expense,
       IFNULL(SUM(CASE WHEN type='income' THEN amount END),0) AS income
     FROM transactions WHERE date LIKE ?
     GROUP BY date ORDER BY day`,
    [`${month}%`]
  );
}

export async function accountBalances(): Promise<AccountBalance[]> {
  const db = await getDb();
  return db.getAllAsync<AccountBalance>(
    `SELECT a.id, a.name, a.icon, a.initial_balance AS initialBalance, a.sort,
       a.initial_balance
       + IFNULL((SELECT SUM(amount) FROM transactions t WHERE t.type='income'   AND t.account_id    = a.id),0)
       - IFNULL((SELECT SUM(amount) FROM transactions t WHERE t.type='expense'  AND t.account_id    = a.id),0)
       + IFNULL((SELECT SUM(amount) FROM transactions t WHERE t.type='transfer' AND t.to_account_id = a.id),0)
       - IFNULL((SELECT SUM(amount) FROM transactions t WHERE t.type='transfer' AND t.account_id    = a.id),0)
       AS balance
     FROM accounts a ORDER BY a.sort, a.id`
  );
}

/** 某月各分类的支出，含未设预算的分类，用于预算页 */
export async function expenseByCategoryWithBudget(
  month: string
): Promise<(Category & { spent: number })[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    name: string;
    icon: string;
    type: 'expense' | 'income';
    parent_id: string | null;
    icon_image: string | null;
    monthlyBudget: number;
    sort: number;
    spent: number;
  }>(
    `SELECT c.id, c.name, c.icon, c.type, c.parent_id, c.icon_image,
       IFNULL(b.amount, 0) AS monthlyBudget, c.sort,
       IFNULL((
         SELECT SUM(t.amount) FROM transactions t
         WHERE t.category_id = c.id AND t.type='expense' AND t.date LIKE ?
       ),0) AS spent
     FROM categories c
     LEFT JOIN budget_amounts b ON b.month = ? AND b.budget_key = c.id
     WHERE c.type='expense' ORDER BY c.sort`,
    [`${month}%`, month]
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    icon: r.icon,
    type: r.type,
    parentId: r.parent_id ?? null,
    iconImage: r.icon_image ?? null,
    monthlyBudget: r.monthlyBudget,
    sort: r.sort,
    spent: r.spent,
  }));
}

export const TOTAL_BUDGET_KEY = '__total__';

/** 当前月没有快照时，沿用最近一期；完全没有历史时从旧设置迁移。 */
export async function ensureCurrentBudgetSnapshot(): Promise<void> {
  const db = await getDb();
  const current = monthKey();
  const count = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM budget_amounts WHERE month = ?',
    [current]
  );
  if ((count?.n ?? 0) > 0) return;

  const latest = await db.getFirstAsync<{ month: string }>(
    'SELECT month FROM budget_amounts WHERE month < ? ORDER BY month DESC LIMIT 1',
    [current]
  );
  if (latest) {
    await db.runAsync(
      `INSERT OR IGNORE INTO budget_amounts (month, budget_key, amount)
       SELECT ?, budget_key, amount FROM budget_amounts WHERE month = ?`,
      [current, latest.month]
    );
    return;
  }

  const total = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'monthlyBudget'"
  );
  if (Number(total?.value ?? 0) > 0) {
    await db.runAsync(
      'INSERT OR IGNORE INTO budget_amounts (month, budget_key, amount) VALUES (?,?,?)',
      [current, TOTAL_BUDGET_KEY, Number(total?.value)]
    );
  }
  const categories = await db.getAllAsync<{ id: string; monthly_budget: number }>(
    'SELECT id, monthly_budget FROM categories WHERE monthly_budget IS NOT NULL AND monthly_budget > 0'
  );
  for (const category of categories) {
    await db.runAsync(
      'INSERT OR IGNORE INTO budget_amounts (month, budget_key, amount) VALUES (?,?,?)',
      [current, category.id, category.monthly_budget]
    );
  }
}

export async function loadBudgetMonth(month: string): Promise<BudgetMonth> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ budget_key: string; amount: number }>(
    'SELECT budget_key, amount FROM budget_amounts WHERE month = ?',
    [month]
  );
  const categories: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    if (row.budget_key === TOTAL_BUDGET_KEY) total = row.amount;
    else categories[row.budget_key] = row.amount;
  }
  return { month, total, categories, exists: rows.length > 0 };
}

export async function saveBudgetAmount(
  month: string,
  budgetKey: string,
  amount: number
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO budget_amounts (month, budget_key, amount) VALUES (?,?,?)
       ON CONFLICT(month, budget_key) DO UPDATE SET amount = excluded.amount`,
      [month, budgetKey, amount]
    );
    if (month !== monthKey()) return;
    if (budgetKey === TOTAL_BUDGET_KEY) {
      await db.runAsync(
        `INSERT INTO settings (key, value) VALUES ('monthlyBudget', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [String(amount)]
      );
    } else {
      await db.runAsync(
        'UPDATE categories SET monthly_budget = ? WHERE id = ?',
        [amount > 0 ? amount : null, budgetKey]
      );
    }
  });
}

/* ---------- accounts ---------- */

interface AccountRow {
  id: string;
  name: string;
  icon: string;
  initial_balance: number;
  sort: number;
}

export async function listAccounts(): Promise<Account[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<AccountRow>(
    'SELECT id, name, icon, initial_balance, sort FROM accounts ORDER BY sort, id'
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    icon: r.icon,
    initialBalance: r.initial_balance,
    sort: r.sort,
  }));
}

export async function insertAccount(acc: Account): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO accounts (id, name, icon, initial_balance, sort) VALUES (?,?,?,?,?)',
    [acc.id, acc.name, acc.icon, acc.initialBalance, acc.sort]
  );
}

export async function updateAccount(acc: Account): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE accounts SET name=?, icon=?, initial_balance=? WHERE id=?',
    [acc.name, acc.icon, acc.initialBalance, acc.id]
  );
}

/** 被流水引用的账户不允许删除；返回 false 表示有引用 */
export async function tryDeleteAccount(id: string): Promise<boolean> {
  const db = await getDb();
  const [transactions, recurring] = await Promise.all([
    db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM transactions WHERE account_id=? OR to_account_id=?`,
      [id, id]
    ),
    db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM recurring_rules WHERE account_id=? OR to_account_id=?`,
      [id, id]
    ),
  ]);
  if ((transactions?.n ?? 0) > 0 || (recurring?.n ?? 0) > 0) return false;
  await db.runAsync('DELETE FROM accounts WHERE id=?', [id]);
  return true;
}

/* ---------- categories ---------- */

interface CategoryRow {
  id: string;
  name: string;
  icon: string;
  type: 'expense' | 'income';
  parent_id: string | null;
  icon_image: string | null;
  monthly_budget: number | null;
  period_budget: number | null;
  sort: number;
}

export async function listCategories(): Promise<Category[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<CategoryRow>(
    `SELECT c.id, c.name, c.icon, c.type, c.parent_id, c.icon_image,
       c.monthly_budget, b.amount AS period_budget, c.sort
     FROM categories c
     LEFT JOIN budget_amounts b ON b.month = ? AND b.budget_key = c.id
     ORDER BY c.sort, c.id`,
    [monthKey()]
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    icon: r.icon,
    type: r.type,
    parentId: r.parent_id ?? null,
    iconImage: r.icon_image ?? null,
    monthlyBudget:
      r.period_budget === null
        ? r.monthly_budget
        : r.period_budget > 0
          ? r.period_budget
          : null,
    sort: r.sort,
  }));
}

export async function upsertCategory(cat: Category): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO categories (id, name, icon, type, monthly_budget, sort, parent_id, icon_image)
     VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, icon=excluded.icon,
       monthly_budget=excluded.monthly_budget, parent_id=excluded.parent_id,
       icon_image=excluded.icon_image`,
    [cat.id, cat.name, cat.icon, cat.type, cat.monthlyBudget, cat.sort, cat.parentId, cat.iconImage]
  );
  await saveBudgetAmount(monthKey(), cat.id, cat.monthlyBudget ?? 0);
}

export async function tryDeleteCategory(id: string): Promise<boolean> {
  const db = await getDb();
  const [transactions, recurring, children] = await Promise.all([
    db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM transactions WHERE category_id=?',
      [id]
    ),
    db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM recurring_rules WHERE category_id=?',
      [id]
    ),
    db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM categories WHERE parent_id=?',
      [id]
    ),
  ]);
  if ((transactions?.n ?? 0) > 0 || (recurring?.n ?? 0) > 0 || (children?.n ?? 0) > 0) return false;
  await db.runAsync('DELETE FROM categories WHERE id=?', [id]);
  return true;
}

/* ---------- tags ---------- */

export async function listTags(): Promise<Tag[]> {
  const db = await getDb();
  return db.getAllAsync<Tag>('SELECT id, name, color, sort FROM tags ORDER BY sort, name');
}

export async function upsertTag(tag: Tag): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO tags (id, name, color, sort) VALUES (?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, color=excluded.color, sort=excluded.sort`,
    [tag.id, tag.name, tag.color, tag.sort]
  );
}

export async function deleteTag(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM tags WHERE id=?', [id]);
}

export async function tagsForTxn(txnId: string): Promise<Tag[]> {
  const db = await getDb();
  return db.getAllAsync<Tag>(
    `SELECT t.id, t.name, t.color, t.sort
     FROM tags t JOIN transaction_tags tt ON tt.tag_id = t.id
     WHERE tt.transaction_id = ? ORDER BY t.sort, t.name`,
    [txnId]
  );
}

/** 批量取标签，供列表渲染 */
export async function tagsByTxn(ids: string[]): Promise<Map<string, Tag[]>> {
  const map = new Map<string, Tag[]>();
  if (ids.length === 0) return map;
  const db = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.getAllAsync<Tag & { transaction_id: string }>(
    `SELECT tt.transaction_id, t.id, t.name, t.color, t.sort
     FROM tags t JOIN transaction_tags tt ON tt.tag_id = t.id
     WHERE tt.transaction_id IN (${placeholders})
     ORDER BY t.sort, t.name`,
    ids
  );
  for (const row of rows) {
    const list = map.get(row.transaction_id) ?? [];
    list.push({ id: row.id, name: row.name, color: row.color, sort: row.sort });
    map.set(row.transaction_id, list);
  }
  return map;
}

export async function setTxnTags(txnId: string, tagIds: string[]): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM transaction_tags WHERE transaction_id=?', [txnId]);
  for (const tagId of tagIds) {
    await db.runAsync(
      'INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?,?)',
      [txnId, tagId]
    );
  }
}

/* ---------- 报销 / 退款 ---------- */

/**
 * 标记报销状态。标记为已完成时会生成一笔收入流水；取消时删除那笔收入。
 */
export async function setClaimStatus(
  txnId: string,
  status: ClaimStatus | null,
  accountId?: string | null
): Promise<void> {
  const txn = await getTxn(txnId);
  if (!txn) return;
  const db = await getDb();

  if (txn.claimTxnId) {
    await db.runAsync('DELETE FROM transactions WHERE id=?', [txn.claimTxnId]);
  }

  if (status === 'done' && accountId) {
    const incomeId = newId();
    await insertTxn({
      id: incomeId,
      type: 'income',
      amount: txn.amount,
      categoryId: txn.categoryId,
      accountId,
      toAccountId: null,
      date: dateKey(),
      note: `报销：${txn.note}`.replace(/：$/, ''),
      createdAt: Date.now(),
      claimStatus: null,
      claimAccountId: null,
      claimTxnId: null,
      refundOf: null,
      fee: 0,
      discount: 0,
    });
    await db.runAsync(
      'UPDATE transactions SET claim_status=?, claim_account_id=?, claim_txn_id=? WHERE id=?',
      ['done', accountId, incomeId, txnId]
    );
    return;
  }

  if (status === 'pending') {
    await db.runAsync(
      'UPDATE transactions SET claim_status=?, claim_account_id=NULL, claim_txn_id=NULL WHERE id=?',
      ['pending', txnId]
    );
    return;
  }

  await db.runAsync(
    'UPDATE transactions SET claim_status=NULL, claim_account_id=NULL, claim_txn_id=NULL WHERE id=?',
    [txnId]
  );
}

/** 生成一笔退款收入，关联原账单 */
export async function createRefund(txnId: string, amount: number, accountId: string): Promise<string> {
  const txn = await getTxn(txnId);
  if (!txn) throw new Error('账单不存在');
  const id = newId();
  await insertTxn({
    id,
    type: 'income',
    amount,
    categoryId: txn.categoryId,
    accountId,
    toAccountId: null,
    date: dateKey(),
    note: `退款：${txn.note}`.replace(/：$/, ''),
    createdAt: Date.now(),
    claimStatus: null,
    claimAccountId: null,
    claimTxnId: null,
    refundOf: txnId,
    fee: 0,
    discount: 0,
  });
  return id;
}

/* ---------- 分期 ---------- */

export async function listInstallments(): Promise<InstallmentProgress[]> {
  const db = await getDb();
  const plans = await db.getAllAsync<{
    id: string;
    title: string;
    principal: number;
    periods: number;
    fee: number;
    account_id: string;
    category_id: string | null;
    start_month: string;
    created_at: number;
  }>('SELECT * FROM installments ORDER BY created_at DESC');
  const entries = await db.getAllAsync<{
    id: string;
    installment_id: string;
    period: number;
    due_month: string;
    amount: number;
    transaction_id: string | null;
  }>('SELECT * FROM installment_entries ORDER BY period');

  return plans.map((plan) => {
    const own = entries
      .filter((entry) => entry.installment_id === plan.id)
      .map((entry) => ({
        id: entry.id,
        installmentId: entry.installment_id,
        period: entry.period,
        dueMonth: entry.due_month,
        amount: entry.amount,
        transactionId: entry.transaction_id,
      }));
    const paid = own.filter((entry) => entry.transactionId);
    return {
      id: plan.id,
      title: plan.title,
      principal: plan.principal,
      periods: plan.periods,
      fee: plan.fee,
      accountId: plan.account_id,
      categoryId: plan.category_id,
      startMonth: plan.start_month,
      createdAt: plan.created_at,
      entries: own,
      paidPeriods: paid.length,
      paidAmount: paid.reduce((sum, entry) => sum + entry.amount, 0),
    };
  });
}

export async function createInstallmentPlan(input: {
  title: string;
  principal: number;
  periods: number;
  fee: number;
  accountId: string;
  categoryId: string | null;
  startMonth: string;
}): Promise<string> {
  const db = await getDb();
  const id = newId();
  const amounts = splitInstallment(input.principal, input.periods, input.fee);
  const months = monthSequence(input.startMonth, input.periods);
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO installments
        (id, title, principal, periods, fee, account_id, category_id, start_month, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        id,
        input.title,
        input.principal,
        input.periods,
        input.fee,
        input.accountId,
        input.categoryId,
        input.startMonth,
        Date.now(),
      ]
    );
    for (let index = 0; index < amounts.length; index += 1) {
      await db.runAsync(
        `INSERT INTO installment_entries (id, installment_id, period, due_month, amount, transaction_id)
         VALUES (?,?,?,?,?,NULL)`,
        [newId(), id, index + 1, months[index], amounts[index]]
      );
    }
  });
  return id;
}

/** 把某一期入账为支出流水 */
export async function payInstallmentEntry(entryId: string): Promise<void> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    id: string;
    installment_id: string;
    period: number;
    due_month: string;
    amount: number;
    transaction_id: string | null;
  }>('SELECT * FROM installment_entries WHERE id=?', [entryId]);
  if (!row || row.transaction_id) return;

  const plan = await db.getFirstAsync<{
    title: string;
    account_id: string;
    category_id: string | null;
    periods: number;
  }>('SELECT title, account_id, category_id, periods FROM installments WHERE id=?', [
    row.installment_id,
  ]);
  if (!plan) return;

  const txnId = newId();
  const date = row.due_month === monthKey() ? dateKey() : `${row.due_month}-01`;
  await insertTxn({
    id: txnId,
    type: 'expense',
    amount: row.amount,
    categoryId: plan.category_id,
    accountId: plan.account_id,
    toAccountId: null,
    date,
    note: `分期：${plan.title}（${row.period}/${plan.periods}）`,
    createdAt: Date.now(),
    claimStatus: null,
    claimAccountId: null,
    claimTxnId: null,
    refundOf: null,
    fee: 0,
    discount: 0,
  });
  await db.runAsync('UPDATE installment_entries SET transaction_id=? WHERE id=?', [txnId, entryId]);
}

export async function deleteInstallmentPlan(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM installments WHERE id=?', [id]);
}

/* ---------- settings ---------- */

export async function loadSettings(): Promise<AppSettings> {
  const db = await getDb();
  await ensureCurrentBudgetSnapshot();
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM settings'
  );
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const currentBudget = await db.getFirstAsync<{ amount: number }>(
    'SELECT amount FROM budget_amounts WHERE month = ? AND budget_key = ?',
    [monthKey(), TOTAL_BUDGET_KEY]
  );
  return {
    monthlyBudget:
      currentBudget?.amount ?? (Number(map.get('monthlyBudget') ?? '0') || 0),
    defaultAccountId: map.get('defaultAccountId') ?? null,
  };
}

export async function saveSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    [key, value]
  );
}

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key=?',
    [key]
  );
  return row?.value ?? null;
}

/* ---------- recurring bills ---------- */

interface RecurringRuleRow {
  id: string;
  title: string;
  type: Txn['type'];
  amount: number;
  category_id: string | null;
  account_id: string;
  to_account_id: string | null;
  note: string;
  day_of_month: number;
  start_month: string;
  active: number;
  created_at: number;
  pending_count?: number;
}

function rowToRecurringRule(row: RecurringRuleRow): RecurringRule {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    amount: row.amount,
    categoryId: row.category_id,
    accountId: row.account_id,
    toAccountId: row.to_account_id,
    note: row.note,
    dayOfMonth: row.day_of_month,
    startMonth: row.start_month,
    active: row.active === 1,
    createdAt: row.created_at,
    pendingCount: row.pending_count ?? 0,
  };
}

export async function listRecurringRules(): Promise<RecurringRule[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<RecurringRuleRow>(
    `SELECT r.id, r.title, r.type, r.amount, r.category_id, r.account_id,
       r.to_account_id, r.note, r.day_of_month, r.start_month, r.active,
       r.created_at,
       IFNULL(SUM(CASE WHEN o.status = 'pending' THEN 1 ELSE 0 END), 0) AS pending_count
     FROM recurring_rules r
     LEFT JOIN recurring_occurrences o ON o.rule_id = r.id
     GROUP BY r.id
     ORDER BY r.active DESC, r.day_of_month, r.created_at DESC`
  );
  return rows.map(rowToRecurringRule);
}

export async function insertRecurringRule(rule: RecurringRule): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO recurring_rules
      (id,title,type,amount,category_id,account_id,to_account_id,note,
       day_of_month,start_month,active,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      rule.id,
      rule.title,
      rule.type,
      rule.amount,
      rule.categoryId,
      rule.accountId,
      rule.toAccountId,
      rule.note,
      rule.dayOfMonth,
      rule.startMonth,
      rule.active ? 1 : 0,
      rule.createdAt,
    ]
  );
}

export async function updateRecurringRule(rule: RecurringRule): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE recurring_rules SET
        title=?, type=?, amount=?, category_id=?, account_id=?, to_account_id=?,
        note=?, day_of_month=?, active=? WHERE id=?`,
      [
        rule.title,
        rule.type,
        rule.amount,
        rule.categoryId,
        rule.accountId,
        rule.toAccountId,
        rule.note,
        rule.dayOfMonth,
        rule.active ? 1 : 0,
        rule.id,
      ]
    );
    await db.runAsync(
      "DELETE FROM recurring_occurrences WHERE rule_id=? AND status='pending'",
      [rule.id]
    );
  });
}

export async function setRecurringRuleActive(id: string, active: boolean): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE recurring_rules SET active=? WHERE id=?', [active ? 1 : 0, id]);
    if (!active) {
      await db.runAsync(
        "DELETE FROM recurring_occurrences WHERE rule_id=? AND status='pending'",
        [id]
      );
    }
  });
}

export async function deleteRecurringRule(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM recurring_rules WHERE id=?', [id]);
}

export async function syncRecurringOccurrences(today = dateKey()): Promise<number> {
  const db = await getDb();
  const throughMonth = today.slice(0, 7);
  const rows = await db.getAllAsync<RecurringRuleRow>(
    `SELECT id, title, type, amount, category_id, account_id, to_account_id,
       note, day_of_month, start_month, active, created_at
     FROM recurring_rules
     WHERE active = 1 AND start_month <= ?`,
    [throughMonth]
  );
  let inserted = 0;
  for (const row of rows) {
    for (const month of recurringMonths(row.start_month, throughMonth)) {
      const dueDate = monthlyDueDate(month, row.day_of_month);
      if (dueDate > today) continue;
      const result = await db.runAsync(
        `INSERT OR IGNORE INTO recurring_occurrences
          (id, rule_id, due_date, status, transaction_id, completed_at)
         VALUES (?,?,?,'pending',NULL,NULL)`,
        [newId(), row.id, dueDate]
      );
      inserted += result.changes;
    }
  }
  return inserted;
}

interface DueRecurringRow extends RecurringRuleRow {
  occurrence_id: string;
  due_date: string;
}

export async function listDueRecurringBills(
  today = dateKey()
): Promise<DueRecurringBill[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<DueRecurringRow>(
    `SELECT o.id AS occurrence_id, o.due_date,
       r.id, r.title, r.type, r.amount, r.category_id, r.account_id,
       r.to_account_id, r.note, r.day_of_month, r.start_month, r.active,
       r.created_at
     FROM recurring_occurrences o
     JOIN recurring_rules r ON r.id = o.rule_id
     WHERE o.status = 'pending' AND o.due_date <= ? AND r.active = 1
     ORDER BY o.due_date, r.created_at`,
    [today]
  );
  return rows.map((row) => ({
    ...rowToRecurringRule(row),
    occurrenceId: row.occurrence_id,
    dueDate: row.due_date,
  }));
}

interface PendingOccurrenceRow extends RecurringRuleRow {
  occurrence_id: string;
  due_date: string;
  status: string;
}

export async function completeRecurringOccurrence(
  occurrenceId: string,
  today = dateKey()
): Promise<Txn | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<PendingOccurrenceRow>(
    `SELECT o.id AS occurrence_id, o.due_date, o.status,
       r.id, r.title, r.type, r.amount, r.category_id, r.account_id,
       r.to_account_id, r.note, r.day_of_month, r.start_month, r.active,
       r.created_at
     FROM recurring_occurrences o
     JOIN recurring_rules r ON r.id = o.rule_id
     WHERE o.id = ?`,
    [occurrenceId]
  );
  if (!row || row.status !== 'pending' || row.due_date > today) return null;

  const txn: Txn = {
    id: newId(),
    type: row.type,
    amount: row.amount,
    categoryId: row.category_id,
    accountId: row.account_id,
    toAccountId: row.to_account_id,
    date: row.due_date,
    note: row.note || row.title,
    createdAt: Date.now(),
  };
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO transactions
        (id,type,amount,category_id,account_id,to_account_id,date,note,created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        txn.id,
        txn.type,
        txn.amount,
        txn.categoryId,
        txn.accountId,
        txn.toAccountId,
        txn.date,
        txn.note,
        txn.createdAt,
      ]
    );
    const result = await db.runAsync(
      `UPDATE recurring_occurrences
       SET status='completed', transaction_id=?, completed_at=?
       WHERE id=? AND status='pending'`,
      [txn.id, Date.now(), occurrenceId]
    );
    if (result.changes === 0) throw new Error('RECURRING_ALREADY_HANDLED');
  });
  return txn;
}

export async function skipRecurringOccurrence(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE recurring_occurrences SET status='skipped' WHERE id=? AND status='pending'",
    [id]
  );
}

/* ---------- backup ---------- */

export interface BackupData {
  version: number;
  exportedAt: string;
  accounts: unknown[];
  categories: unknown[];
  transactions: unknown[];
  settings: unknown[];
  recurringRules?: unknown[];
  recurringOccurrences?: unknown[];
  budgetAmounts?: unknown[];
  tags?: unknown[];
  transactionTags?: unknown[];
  installments?: unknown[];
  installmentEntries?: unknown[];
}

export async function exportAll(): Promise<BackupData> {
  const db = await getDb();
  const [
    accounts,
    categories,
    transactions,
    settings,
    recurringRules,
    recurringOccurrences,
    budgetAmounts,
  ] = await Promise.all([
    db.getAllAsync('SELECT * FROM accounts'),
    db.getAllAsync('SELECT * FROM categories'),
    db.getAllAsync('SELECT * FROM transactions'),
    db.getAllAsync('SELECT * FROM settings'),
    db.getAllAsync('SELECT * FROM recurring_rules'),
    db.getAllAsync('SELECT * FROM recurring_occurrences'),
    db.getAllAsync('SELECT * FROM budget_amounts'),
  ]);
  const [tags, transactionTags, installments, installmentEntries] = await Promise.all([
    db.getAllAsync('SELECT * FROM tags'),
    db.getAllAsync('SELECT * FROM transaction_tags'),
    db.getAllAsync('SELECT * FROM installments'),
    db.getAllAsync('SELECT * FROM installment_entries'),
  ]);
  return {
    version: 6,
    exportedAt: new Date().toISOString(),
    accounts,
    categories,
    transactions,
    settings,
    recurringRules,
    recurringOccurrences,
    budgetAmounts,
    tags,
    transactionTags,
    installments,
    installmentEntries,
  };
}

export async function importAll(data: BackupData): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    // 自引用外键（refund_of）在批量导入时可能先插入子行
    await db.execAsync('PRAGMA defer_foreign_keys = ON');
    await db.runAsync('DELETE FROM installment_entries');
    await db.runAsync('DELETE FROM installments');
    await db.runAsync('DELETE FROM transaction_tags');
    await db.runAsync('DELETE FROM tags');
    await db.runAsync('DELETE FROM recurring_occurrences');
    await db.runAsync('DELETE FROM recurring_rules');
    await db.runAsync('DELETE FROM budget_amounts');
    await db.runAsync('DELETE FROM transactions');
    await db.runAsync('DELETE FROM categories');
    await db.runAsync('DELETE FROM accounts');
    await db.runAsync('DELETE FROM settings');
    for (const a of data.accounts as Record<string, unknown>[]) {
      await db.runAsync(
        'INSERT INTO accounts (id,name,icon,initial_balance,sort) VALUES (?,?,?,?,?)',
        [a.id, a.name, a.icon, a.initial_balance, a.sort] as never[]
      );
    }
    for (const c of data.categories as Record<string, unknown>[]) {
      await db.runAsync(
        `INSERT INTO categories
          (id,name,icon,type,monthly_budget,sort,parent_id,icon_image)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          c.id,
          c.name,
          c.icon,
          c.type,
          c.monthly_budget,
          c.sort,
          c.parent_id ?? null,
          c.icon_image ?? null,
        ] as never[]
      );
    }
    for (const r of (data.recurringRules ?? []) as Record<string, unknown>[]) {
      await db.runAsync(
        `INSERT INTO recurring_rules
          (id,title,type,amount,category_id,account_id,to_account_id,note,
           day_of_month,start_month,active,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          r.id,
          r.title,
          r.type,
          r.amount,
          r.category_id,
          r.account_id,
          r.to_account_id,
          r.note,
          r.day_of_month,
          r.start_month,
          r.active,
          r.created_at,
        ] as never[]
      );
    }
    for (const t of data.transactions as Record<string, unknown>[]) {
      await db.runAsync(
        'INSERT INTO transactions (id,type,amount,category_id,account_id,to_account_id,date,note,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        [
          t.id,
          t.type,
          t.amount,
          t.category_id,
          t.account_id,
          t.to_account_id,
          t.date,
          t.note,
          t.created_at,
        ] as never[]
      );
    }
    for (const o of (data.recurringOccurrences ?? []) as Record<string, unknown>[]) {
      await db.runAsync(
        `INSERT INTO recurring_occurrences
          (id,rule_id,due_date,status,transaction_id,completed_at)
         VALUES (?,?,?,?,?,?)`,
        [
          o.id,
          o.rule_id,
          o.due_date,
          o.status,
          o.transaction_id,
          o.completed_at,
        ] as never[]
      );
    }
    for (const b of (data.budgetAmounts ?? []) as Record<string, unknown>[]) {
      await db.runAsync(
        'INSERT INTO budget_amounts (month,budget_key,amount) VALUES (?,?,?)',
        [b.month, b.budget_key, b.amount] as never[]
      );
    }
    for (const t of (data.tags ?? []) as Record<string, unknown>[]) {
      await db.runAsync('INSERT INTO tags (id,name,color,sort) VALUES (?,?,?,?)', [
        t.id, t.name, t.color ?? null, t.sort ?? 0,
      ] as never[]);
    }
    for (const tt of (data.transactionTags ?? []) as Record<string, unknown>[]) {
      await db.runAsync(
        'INSERT OR IGNORE INTO transaction_tags (transaction_id,tag_id) VALUES (?,?)',
        [tt.transaction_id, tt.tag_id] as never[]
      );
    }
    for (const plan of (data.installments ?? []) as Record<string, unknown>[]) {
      await db.runAsync(
        `INSERT INTO installments
          (id,title,principal,periods,fee,account_id,category_id,start_month,created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          plan.id, plan.title, plan.principal, plan.periods, plan.fee ?? 0,
          plan.account_id, plan.category_id ?? null, plan.start_month, plan.created_at,
        ] as never[]
      );
    }
    for (const entry of (data.installmentEntries ?? []) as Record<string, unknown>[]) {
      await db.runAsync(
        `INSERT INTO installment_entries
          (id,installment_id,period,due_month,amount,transaction_id)
         VALUES (?,?,?,?,?,?)`,
        [
          entry.id, entry.installment_id, entry.period, entry.due_month,
          entry.amount, entry.transaction_id ?? null,
        ] as never[]
      );
    }
    for (const s of data.settings as Record<string, unknown>[]) {
      await db.runAsync('INSERT INTO settings (key,value) VALUES (?,?)', [
        s.key,
        s.value,
      ] as never[]);
    }
  });
  // 旧版备份没有两级分类字段，导入后补一次树对齐（幂等）。
  await ensureCategoryTree(db);
}
