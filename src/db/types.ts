export type TxType = 'expense' | 'income' | 'transfer';

export interface Account {
  id: string;
  name: string;
  icon: string; // emoji
  /** 期初余额，单位：分 */
  initialBalance: number;
  sort: number;
}

export interface Category {
  id: string;
  name: string;
  icon: string; // emoji，作为图标缺失时的兜底
  type: 'expense' | 'income';
  /** 父分类 id；null 表示一级分类 */
  parentId: string | null;
  /** 图标资源键；null 表示只用 emoji */
  iconImage: string | null;
  /** 每月预算，单位：分；null 表示未设置 */
  monthlyBudget: number | null;
  sort: number;
}

export type ClaimStatus = 'pending' | 'done';

export interface Txn {
  id: string;
  type: TxType;
  /** 金额，单位：分，恒为正数（实付/实收） */
  amount: number;
  /** 手续费（分），仅作记录与导出，不改变 amount 与统计口径 */
  fee?: number;
  /** 优惠（分），仅作记录与导出 */
  discount?: number;
  /** 报销状态；null 表示不可报销 */
  claimStatus?: ClaimStatus | null;
  /** 报销入账账户 */
  claimAccountId?: string | null;
  /** 报销生成的收入流水 id */
  claimTxnId?: string | null;
  /** 退款来源账单 id（本笔为退款收入） */
  refundOf?: string | null;
  categoryId: string | null;
  /** 支出=付款账户，收入=收款账户，转账=转出账户 */
  accountId: string;
  /** 仅转账：转入账户 */
  toAccountId: string | null;
  /** 'YYYY-MM-DD' */
  date: string;
  note: string;
  createdAt: number;
}

export interface AppSettings {
  /** 总月度预算（分），0 表示未设置 */
  monthlyBudget: number;
  defaultAccountId: string | null;
}

export interface MonthSummary {
  expense: number;
  income: number;
  balance: number;
}

export interface CategoryStat {
  categoryId: string;
  name: string;
  icon: string;
  /** 上卷后的一级分类图标资源键 */
  iconImage?: string | null;
  total: number;
  count: number;
}

export interface DailyStat {
  day: number; // 1..31
  expense: number;
  income: number;
}

export interface AccountBalance extends Account {
  balance: number;
}

export interface RecurringRule {
  id: string;
  title: string;
  type: TxType;
  amount: number;
  categoryId: string | null;
  accountId: string;
  toAccountId: string | null;
  note: string;
  dayOfMonth: number;
  /** 'YYYY-MM' */
  startMonth: string;
  active: boolean;
  createdAt: number;
  pendingCount?: number;
}

export type RecurringStatus = 'pending' | 'completed' | 'skipped';

export interface DueRecurringBill extends RecurringRule {
  occurrenceId: string;
  dueDate: string;
}

export interface BudgetMonth {
  month: string;
  total: number;
  categories: Record<string, number>;
  exists: boolean;
}

export interface Tag {
  id: string;
  name: string;
  color: string | null;
  sort: number;
}

export interface Installment {
  id: string;
  title: string;
  /** 本金（分） */
  principal: number;
  periods: number;
  /** 总手续费（分） */
  fee: number;
  accountId: string;
  categoryId: string | null;
  /** 'YYYY-MM' */
  startMonth: string;
  createdAt: number;
}

export interface InstallmentEntry {
  id: string;
  installmentId: string;
  /** 第几期，从 1 开始 */
  period: number;
  /** 'YYYY-MM' */
  dueMonth: string;
  /** 本期金额（分，含分摊手续费） */
  amount: number;
  transactionId: string | null;
}

export interface InstallmentProgress extends Installment {
  paidPeriods: number;
  paidAmount: number;
  entries: InstallmentEntry[];
}
