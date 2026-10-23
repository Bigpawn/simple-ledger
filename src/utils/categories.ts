import type { Category, CategoryStat } from '../db/types';

/**
 * 把逐条分类的统计上卷到一级分类：
 * - 二级分类的金额与笔数并入父分类；
 * - 未挂靠的老分类保持不变；
 * - 结果按金额降序，便于直接喂给图表。
 */
export function rollupCategoryStats(stats: CategoryStat[], categories: Category[]): CategoryStat[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const out = new Map<string, CategoryStat>();
  for (const s of stats) {
    const cat = byId.get(s.categoryId);
    const rootId = cat?.parentId ?? s.categoryId;
    const root = byId.get(rootId) ?? cat;
    const current = out.get(rootId) ?? {
      categoryId: rootId,
      name: root?.name ?? s.name,
      icon: root?.icon ?? s.icon,
      iconImage: root?.iconImage ?? null,
      total: 0,
      count: 0,
    };
    current.total += s.total;
    current.count += s.count;
    out.set(rootId, current);
  }
  return [...out.values()].sort((a, b) => b.total - a.total);
}

/** 某个分类自身 + 其子分类的 id，用于按一级分类筛选流水 */
export function categoryIdWithChildren(id: string, categories: Category[]): string[] {
  return [id, ...categories.filter((c) => c.parentId === id).map((c) => c.id)];
}
