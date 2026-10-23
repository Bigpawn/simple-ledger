import test from 'node:test';
import assert from 'node:assert/strict';
import { groupBudgets } from '../src/utils/budgetTree.ts';

const cat = (id, name, parentId = null) => ({
  id,
  name,
  icon: '📦',
  type: 'expense',
  parentId,
  iconImage: null,
  monthlyBudget: null,
  sort: 0,
});

const leaf = (category, spent, budget = 0) => ({ category, spent, budget });

test('父分类已用金额包含子分类，父预算等于子预算之和', () => {
  const rows = [
    leaf(cat('cat-e-food', '餐饮'), 1000, 5000),
    leaf(cat('cat-e-food-meals', '三餐', 'cat-e-food'), 2000, 3000),
    leaf(cat('cat-e-food-snack', '零食', 'cat-e-food'), 500, 800),
    leaf(cat('cat-e-shop', '购物'), 300, 1200),
  ];
  const groups = groupBudgets(rows);
  assert.equal(groups.length, 2);

  const food = groups.find((g) => g.parent.category.id === 'cat-e-food');
  assert.equal(food.spent, 3500, '已用 = 自身 + 子类');
  assert.equal(food.budget, 3800, '预算 = 子类预算之和');
  assert.equal(food.derived, true);
  assert.equal(food.parent.budget, 5000, '父分类原预算保留在数据里');
  assert.equal(food.children.length, 2);

  const shop = groups.find((g) => g.parent.category.id === 'cat-e-shop');
  assert.equal(shop.spent, 300);
  assert.equal(shop.budget, 1200, '没有子类时使用自身预算');
  assert.equal(shop.derived, false);
});

test('子分类都没设预算时父预算为 0，不沿用父分类旧值', () => {
  const rows = [
    leaf(cat('cat-e-food', '餐饮'), 1000, 5000),
    leaf(cat('cat-e-food-meals', '三餐', 'cat-e-food'), 200),
  ];
  const group = groupBudgets(rows)[0];
  assert.equal(group.budget, 0);
  assert.equal(group.parent.budget, 5000);
});

test('合计金额不会因为分组而重复计算', () => {
  const rows = [
    leaf(cat('cat-e-food', '餐饮'), 1000),
    leaf(cat('cat-e-food-meals', '三餐', 'cat-e-food'), 2000),
    leaf(cat('cat-e-shop', '购物'), 300),
  ];
  const groups = groupBudgets(rows);
  const total = groups.reduce((sum, g) => sum + g.spent, 0);
  const raw = rows.reduce((sum, r) => sum + r.spent, 0);
  assert.equal(total, raw);
  assert.equal(total, 3300);
});

test('父分类缺失的孤儿分类单独成组', () => {
  const rows = [
    leaf(cat('cat-e0', '水果', 'cat-e-missing'), 700, 1000),
    leaf(cat('cat-e-shop', '购物'), 200),
  ];
  const groups = groupBudgets(rows);
  assert.equal(groups.length, 2);
  const orphan = groups.find((g) => g.parent.category.id === 'cat-e0');
  assert.equal(orphan.spent, 700);
  assert.equal(orphan.budget, 1000);
  assert.equal(orphan.derived, false);
});

test('没有子分类时保持原始顺序', () => {
  const rows = [leaf(cat('a', 'A'), 1), leaf(cat('b', 'B'), 2), leaf(cat('c', 'C'), 3)];
  assert.deepEqual(groupBudgets(rows).map((g) => g.parent.category.id), ['a', 'b', 'c']);
});
