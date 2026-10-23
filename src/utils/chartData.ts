interface CategoryTotal {
  categoryId: string;
  name: string;
  icon: string;
  total: number;
  count: number;
}

/** 环图最多十项，长尾合并后仍覆盖完整总额。 */
export function categoryChartData(categories: CategoryTotal[], palette: readonly string[]) {
  const head = categories.length > 10 ? categories.slice(0, 9) : categories;
  const result = head.map((item, i) => ({ ...item, color: palette[i % palette.length] }));
  if (categories.length > 10) {
    const tail = categories.slice(9);
    result.push({ categoryId: '__other__', name: '其他分类', icon: '📦',
      total: tail.reduce((sum, item) => sum + item.total, 0),
      count: tail.reduce((sum, item) => sum + item.count, 0), color: '#677389' });
  }
  return result;
}
