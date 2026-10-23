import type { Category } from '../db/types';

export interface BudgetLeaf {
  category: Category;
  /** 本月已花，单位：分 */
  spent: number;
  /** 本月预算，单位：分；0 表示未设置 */
  budget: number;
}

export interface BudgetGroup {
  /** 父分类自身（budget 保留其历史存储值，便于提示） */
  parent: BudgetLeaf;
  children: BudgetLeaf[];
  /** 生效预算：有子分类时 = 子分类预算之和 */
  budget: number;
  /** 父分类支出 + 所有子分类支出 */
  spent: number;
  /** 预算是否由子分类合计而来 */
  derived: boolean;
}

/**
 * 把逐条分类预算按一级分类分组：
 * - 父分类的“已用”= 自身 + 所有子分类；
 * - 父分类的预算 = 所有子分类预算之和（有子分类时不再使用父分类自身预算）；
 * - 父分类丢失的孤儿分类单独成组，不会被吞掉。
 */
export function groupBudgets(rows: BudgetLeaf[]): BudgetGroup[] {
  const groups: BudgetGroup[] = [];
  const claimed = new Set<string>();

  for (const row of rows) {
    if (row.category.parentId) continue;
    const children = rows.filter((r) => r.category.parentId === row.category.id);
    claimed.add(row.category.id);
    for (const child of children) claimed.add(child.category.id);
    const childSpent = children.reduce((sum, child) => sum + child.spent, 0);
    const childBudget = children.reduce((sum, child) => sum + child.budget, 0);
    groups.push({
      parent: row,
      children,
      spent: row.spent + childSpent,
      budget: children.length > 0 ? childBudget : row.budget,
      derived: children.length > 0,
    });
  }

  for (const row of rows) {
    if (claimed.has(row.category.id)) continue;
    groups.push({ parent: row, children: [], spent: row.spent, budget: row.budget, derived: false });
  }

  return groups;
}
