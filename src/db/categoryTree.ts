/**
 * 两级分类树（借鉴 iCost 默认分类结构）。
 *
 * 设计约束：
 * - 纯数据 + 纯函数，不依赖 expo-sqlite，可直接被 node --test 使用；
 * - 旧数据只做“挂靠”（设置 parent_id），不改 id，不搬动流水；
 * - 迁移必须幂等：重复执行不会产生重复分类。
 */

export type CategoryType = 'expense' | 'income';

export interface SeedNode {
  /** 稳定标识，用于生成分类 id 与图标文件名 */
  key: string;
  name: string;
  /** 没有图标资源时的兜底显示 */
  emoji: string;
  /** 图标资源键（与分类 key 对应），null 表示只用 emoji */
  icon: string | null;
  children?: SeedNode[];
}

export interface ExistingCategory {
  id: string;
  name: string;
  type: CategoryType;
  parentId: string | null;
  /** 已绑定的图标资源键，非空时不再覆盖 */
  iconImage: string | null;
}

export interface PlannedUpdate {
  id: string;
  name: string;
  parentId: string | null;
  sort: number;
  iconImage: string;
}

export interface PlannedInsert {
  id: string;
  name: string;
  emoji: string;
  type: CategoryType;
  parentId: string | null;
  sort: number;
  iconImage: string;
}

export interface TreePlan {
  updates: PlannedUpdate[];
  inserts: PlannedInsert[];
}

export const CATEGORY_TREE_VERSION = '3';

export const EXPENSE_TREE: SeedNode[] = [
  {
    key: 'food', name: '餐饮', emoji: '🍜', icon: '餐饮', children: [
      { key: 'meals', name: '三餐', emoji: '🍚', icon: 'food_17' },
      { key: 'snack', name: '零食', emoji: '🍿', icon: 'food_14' },
      { key: 'fruit', name: '水果', emoji: '🍎', icon: 'icon_26' },
      { key: 'vegetable', name: '蔬菜', emoji: '🥬', icon: 'food_7' },
    ],
  },
  { key: 'shop', name: '购物', emoji: '🛒', icon: 'shop_3' },
  { key: 'apparel', name: '服饰', emoji: '👕', icon: 'icon_146' },
  { key: 'daily', name: '日用', emoji: '🧴', icon: 'icon_45' },
  { key: 'digital', name: '数码', emoji: '💻', icon: 'digital_6' },
  { key: 'beauty', name: '美妆', emoji: '💄', icon: 'icon_46' },
  { key: 'skincare', name: '护肤', emoji: '🧼', icon: '护肤' },
  { key: 'app', name: '应用软件', emoji: '📱', icon: 'digital_1' },
  {
    key: 'housing', name: '住房', emoji: '🏠', icon: '住房', children: [
      { key: 'rent', name: '房租', emoji: '🏡', icon: 'finance_3' },
      { key: 'repair', name: '维修', emoji: '🔧', icon: '维修' },
      { key: 'utility', name: '水电费', emoji: '💡', icon: 'daily_5' },
    ],
  },
  {
    key: 'transport', name: '交通', emoji: '🚌', icon: 'icon_83', children: [
      { key: 'bus', name: '公交', emoji: '🚌', icon: 'icon_151' },
      { key: 'subway', name: '地铁', emoji: '🚇', icon: 'icon_86' },
      { key: 'train', name: '火车', emoji: '🚄', icon: 'icon_84' },
      { key: 'flight', name: '飞机', emoji: '✈️', icon: 'travel_4' },
      { key: 'taxi', name: '打车', emoji: '🚕', icon: 'icon_83' },
    ],
  },
  { key: 'fun', name: '娱乐', emoji: '🎮', icon: 'icon_115' },
  {
    key: 'medical', name: '医疗', emoji: '💊', icon: 'health_7', children: [
      { key: 'clinic', name: '门诊', emoji: '🩺', icon: 'health_9' },
      { key: 'hospital', name: '住院', emoji: '🏥', icon: 'icon_112' },
      { key: 'vaccine', name: '疫苗', emoji: '💉', icon: 'icon_113' },
      { key: 'checkup', name: '体检', emoji: '📋', icon: 'health_3' },
      { key: 'insurance', name: '保险', emoji: '🛡️', icon: 'health_12' },
    ],
  },
  { key: 'telecom', name: '通讯', emoji: '📱', icon: '通讯' },
  { key: 'car', name: '汽车', emoji: '🚗', icon: 'icon_80' },
  {
    key: 'study', name: '学习', emoji: '📚', icon: 'icon_76', children: [
      { key: 'book', name: '书籍', emoji: '📖', icon: '书籍' },
      { key: 'education', name: '教育', emoji: '🎓', icon: '教育' },
    ],
  },
  { key: 'office', name: '办公', emoji: '🗂️', icon: 'icon_71' },
  { key: 'sports', name: '运动', emoji: '⚽', icon: 'icon_98' },
  { key: 'social', name: '社交', emoji: '💬', icon: '社交' },
  {
    key: 'favor', name: '人情', emoji: '🧧', icon: 'icon_127', children: [
      { key: 'family', name: '家人', emoji: '👨‍👩‍👧', icon: '家人' },
      { key: 'giftmoney', name: '礼金', emoji: '💰', icon: '礼金' },
      { key: 'gift', name: '礼物', emoji: '🎁', icon: '礼物' },
      { key: 'donation', name: '捐赠', emoji: '🤝', icon: '捐赠' },
    ],
  },
  { key: 'childcare', name: '育儿', emoji: '🍼', icon: 'icon_124' },
  { key: 'pet', name: '宠物', emoji: '🐶', icon: 'icon_144' },
  { key: 'travel', name: '旅行', emoji: '✈️', icon: 'icon_96' },
  { key: 'vacation', name: '度假', emoji: '🏖️', icon: '度假' },
  { key: 'tobacco', name: '烟酒', emoji: '🚬', icon: 'icon_35' },
  { key: 'lottery', name: '彩票', emoji: '🎫', icon: '彩票' },
];

export const INCOME_TREE: SeedNode[] = [
  { key: 'salary', name: '工资', emoji: '💼', icon: '工资' },
  { key: 'bonus', name: '奖金', emoji: '🏆', icon: '奖金' },
  { key: 'overtime', name: '加班', emoji: '🌙', icon: 'digital_12' },
  { key: 'welfare', name: '福利', emoji: '🎁', icon: '福利' },
  { key: 'fund', name: '公积金', emoji: '🏦', icon: 'finance_3' },
  { key: 'redenvelope', name: '红包', emoji: '🧧', icon: '红包' },
  { key: 'parttime', name: '兼职', emoji: '🧰', icon: '兼职' },
  { key: 'sideline', name: '副业', emoji: '💼', icon: 'work_12' },
  { key: 'taxrefund', name: '退税', emoji: '🧾', icon: '退款' },
  { key: 'investment', name: '投资', emoji: '📈', icon: '投资' },
  { key: 'windfall', name: '意外收入', emoji: '✨', icon: 'icon_12' },
  { key: 'other', name: '其他', emoji: '💰', icon: 'icon_2' },
];

/** 旧版（v1）内置分类：id -> 默认名，用于判断能否安全改名 */
const LEGACY_DEFAULTS: Record<string, string> = {
  'cat-e0': '餐饮', 'cat-e1': '交通', 'cat-e2': '购物', 'cat-e3': '日用',
  'cat-e4': '水果', 'cat-e5': '娱乐', 'cat-e6': '医疗', 'cat-e7': '住房',
  'cat-e8': '通讯', 'cat-e9': '教育', 'cat-e10': '服饰', 'cat-e11': '美容',
  'cat-e12': '运动', 'cat-e13': '旅行', 'cat-e14': '宠物', 'cat-e15': '人情',
  'cat-e16': '数码', 'cat-e17': '其他支出',
  'cat-i0': '工资', 'cat-i1': '奖金', 'cat-i2': '理财', 'cat-i3': '红包',
  'cat-i4': '兼职', 'cat-i5': '其他收入',
};

/** 新名 -> 旧名列表，仅在确认是内置且未被改名时生效 */
const LEGACY_ALIAS: Record<string, string[]> = {
  '美妆': ['美容'],
  '投资': ['理财'],
  '其他': ['其他收入'],
};

export function treeFor(type: CategoryType): SeedNode[] {
  return type === 'expense' ? EXPENSE_TREE : INCOME_TREE;
}

export function parentIdOf(type: CategoryType, parentKey: string): string {
  return type === 'expense' ? `cat-e-${parentKey}` : `cat-i-${parentKey}`;
}

export function childIdOf(type: CategoryType, parentKey: string, childKey: string): string {
  return `${parentIdOf(type, parentKey)}-${childKey}`;
}

/**
 * 计算把现有分类库对齐到两级树所需的变更。
 * 只返回增量操作，不删除任何行；已有分类优先被“挂靠”而不是新建。
 */
export function planCategoryTree(existing: ExistingCategory[]): TreePlan {
  const byId = new Map(existing.map((c) => [c.id, c]));
  const byName = new Map(existing.map((c) => [`${c.type}:${c.name}`, c]));
  const claimed = new Set<string>();
  const updates: PlannedUpdate[] = [];
  const inserts: PlannedInsert[] = [];

  const find = (type: CategoryType, canonicalId: string, name: string) => {
    const canonical = byId.get(canonicalId);
    if (canonical) return canonical;
    const sameName = byName.get(`${type}:${name}`);
    if (sameName) return sameName;
    for (const legacy of LEGACY_ALIAS[name] ?? []) {
      const hit = byName.get(`${type}:${legacy}`);
      if (hit) return hit;
    }
    return undefined;
  };

  const adopt = (
    type: CategoryType,
    node: SeedNode,
    canonicalId: string,
    sort: number,
    parentDbId: string | null,
    hit: ExistingCategory | undefined,
    parentKey?: string
  ): string => {
    // 图标文件名与分类 key 对应：一级用 key，二级用 父key-子key
    const iconKey = parentKey ? `${parentKey}-${node.key}` : node.key;
    if (hit && !claimed.has(hit.id)) {
      claimed.add(hit.id);
      const defaultName = LEGACY_DEFAULTS[hit.id];
      const renameSafe = defaultName !== undefined && hit.name === defaultName && hit.name !== node.name;
      updates.push({
        id: hit.id,
        name: renameSafe ? node.name : hit.name,
        parentId: parentDbId,
        sort,
        iconImage: hit.iconImage ?? iconKey,
      });
      return hit.id;
    }
    inserts.push({
      id: canonicalId,
      name: node.name,
      emoji: node.emoji,
      type,
      parentId: parentDbId,
      sort,
      iconImage: iconKey,
    });
    return canonicalId;
  };

  for (const type of ['expense', 'income'] as CategoryType[]) {
    treeFor(type).forEach((parent, pi) => {
      const canonicalParentId = parentIdOf(type, parent.key);
      const parentDbId = adopt(
        type,
        parent,
        canonicalParentId,
        pi * 100,
        null,
        find(type, canonicalParentId, parent.name)
      );
      (parent.children ?? []).forEach((child, ci) => {
        const canonicalChildId = childIdOf(type, parent.key, child.key);
        adopt(
          type,
          child,
          canonicalChildId,
          pi * 100 + ci + 1,
          parentDbId,
          find(type, canonicalChildId, child.name),
          parent.key
        );
      });
    });
  }

  return { updates, inserts };
}
