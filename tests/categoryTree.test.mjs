import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planCategoryTree,
  EXPENSE_TREE,
  INCOME_TREE,
} from '../src/db/categoryTree.ts';

const LEGACY = [
  ['cat-e0', '餐饮'], ['cat-e1', '交通'], ['cat-e2', '购物'], ['cat-e3', '日用'],
  ['cat-e4', '水果'], ['cat-e5', '娱乐'], ['cat-e6', '医疗'], ['cat-e7', '住房'],
  ['cat-e8', '通讯'], ['cat-e9', '教育'], ['cat-e10', '服饰'], ['cat-e11', '美容'],
  ['cat-e12', '运动'], ['cat-e13', '旅行'], ['cat-e14', '宠物'], ['cat-e15', '人情'],
  ['cat-e16', '数码'], ['cat-e17', '其他支出'],
  ['cat-i0', '工资'], ['cat-i1', '奖金'], ['cat-i2', '理财'], ['cat-i3', '红包'],
  ['cat-i4', '兼职'], ['cat-i5', '其他收入'],
].map(([id, name]) => ({
  id,
  name,
  type: id.startsWith('cat-i') ? 'income' : 'expense',
  parentId: null,
  iconImage: null,
}));

const TOTAL_NODES =
  EXPENSE_TREE.reduce((n, c) => n + 1 + (c.children?.length ?? 0), 0) +
  INCOME_TREE.reduce((n, c) => n + 1 + (c.children?.length ?? 0), 0);

/** 把计划应用到当前状态，得到迁移后的分类表 */
function apply(existing, plan) {
  const byId = new Map(existing.map((c) => [c.id, { ...c }]));
  for (const u of plan.updates) {
    const current = byId.get(u.id);
    byId.set(u.id, { ...current, name: u.name, parentId: u.parentId, iconImage: u.iconImage });
  }
  for (const i of plan.inserts) {
    byId.set(i.id, {
      id: i.id,
      name: i.name,
      type: i.type,
      parentId: i.parentId,
      iconImage: i.iconImage,
    });
  }
  return [...byId.values()];
}

test('空库一次建出完整两级树', () => {
  const plan = planCategoryTree([]);
  assert.equal(plan.inserts.length, TOTAL_NODES);
  assert.equal(plan.updates.length, 0);

  const parents = plan.inserts.filter((c) => c.parentId === null);
  const children = plan.inserts.filter((c) => c.parentId !== null);
  assert.equal(parents.length, EXPENSE_TREE.length + INCOME_TREE.length);
  assert.equal(children.length, 23);

  const ids = new Set(plan.inserts.map((c) => c.id));
  assert.equal(ids.size, plan.inserts.length, 'id 不能重复');
  for (const child of children) {
    assert.ok(ids.has(child.parentId), `子分类 ${child.name} 的父分类必须存在`);
  }
});

test('老库不新增重复分类，旧分类挂靠为父/子节点', () => {
  const plan = planCategoryTree(LEGACY);
  const final = apply(LEGACY, plan);
  const byId = new Map(final.map((c) => [c.id, c]));
  const nameOf = (name, type) =>
    final.filter((c) => c.name === name && c.type === type).map((c) => c.id);

  // 老 id 全部保留，历史流水的外键不失效
  for (const legacy of LEGACY) assert.ok(byId.has(legacy.id), `${legacy.id} 丢失`);

  // 餐饮：老行升级为父分类，不再新建同名分类
  assert.deepEqual(nameOf('餐饮', 'expense'), ['cat-e0']);
  assert.equal(byId.get('cat-e0').parentId, null);

  // 水果：老的一级分类被挂到餐饮下面
  assert.deepEqual(nameOf('水果', 'expense'), ['cat-e4']);
  assert.equal(byId.get('cat-e4').parentId, 'cat-e0');

  // 教育：挂到“学习”下面
  assert.equal(byId.get('cat-e9').parentId, 'cat-e-study');

  // 新插入的子分类也挂在正确的父节点
  assert.equal(byId.get('cat-e-food-meals').parentId, 'cat-e0');
  assert.equal(byId.get('cat-e-food-vegetable').parentId, 'cat-e0');

  // 改名只发生在内置且未自定义的分类上
  assert.equal(byId.get('cat-e11').name, '美妆');
  assert.equal(byId.get('cat-i2').name, '投资');
  assert.equal(byId.get('cat-i5').name, '其他');

  // 没有任何重名分类
  const keys = final.map((c) => `${c.type}:${c.name}`);
  assert.equal(new Set(keys).size, keys.length, '同一类型下出现重名分类');
});

test('用户改过名的内置分类不会被覆盖', () => {
  const renamed = LEGACY.map((c) =>
    c.id === 'cat-e11' ? { ...c, name: '化妆品' } : c
  );
  const final = apply(renamed, planCategoryTree(renamed));
  const custom = final.find((c) => c.id === 'cat-e11');
  assert.equal(custom.name, '化妆品');
  assert.equal(custom.parentId, null);
  // 树里仍然会补出一个“美妆”，但不会抢走用户的自定义分类
  assert.ok(final.some((c) => c.name === '美妆' && c.id !== 'cat-e11'));
});

test('重复执行是幂等的', () => {
  const first = planCategoryTree(LEGACY);
  const final = apply(LEGACY, first);
  const second = planCategoryTree(final);
  assert.equal(second.inserts.length, 0, '第二次不应再插入');
  assert.equal(second.updates.length, TOTAL_NODES, '只做位置/图标对齐');
  const third = planCategoryTree(apply(final, second));
  assert.equal(third.inserts.length, 0);
});

test('已带图标的分类不会被默认图标覆盖', () => {
  const withIcon = LEGACY.map((c) =>
    c.id === 'cat-e0' ? { ...c, iconImage: 'custom-icon' } : c
  );
  const update = planCategoryTree(withIcon).updates.find((u) => u.id === 'cat-e0');
  assert.equal(update.iconImage, 'custom-icon');
});
