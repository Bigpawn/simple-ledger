import type { Account, Category } from './types';

export const DEFAULT_ACCOUNTS: Omit<Account, 'sort'>[] = [
  { id: 'acc-cash', name: '现金', icon: '💰', initialBalance: 0 },
  { id: 'acc-wechat', name: '微信', icon: '💚', initialBalance: 0 },
  { id: 'acc-alipay', name: '支付宝', icon: '💙', initialBalance: 0 },
];

const EXPENSE: [string, string][] = [
  ['餐饮', '🍜'],
  ['交通', '🚌'],
  ['购物', '🛒'],
  ['日用', '🧻'],
  ['水果', '🍎'],
  ['娱乐', '🎮'],
  ['医疗', '💊'],
  ['住房', '🏠'],
  ['通讯', '📱'],
  ['教育', '📚'],
  ['服饰', '👕'],
  ['美容', '💄'],
  ['运动', '⚽'],
  ['旅行', '✈️'],
  ['宠物', '🐶'],
  ['人情', '🧧'],
  ['数码', '💻'],
  ['其他支出', '📦'],
];

const INCOME: [string, string][] = [
  ['工资', '💼'],
  ['奖金', '🏆'],
  ['理财', '📈'],
  ['红包', '🧧'],
  ['兼职', '🧰'],
  ['其他收入', '💰'],
];

export const DEFAULT_CATEGORIES: Omit<Category, 'sort'>[] = [
  ...EXPENSE.map(([name, icon], i) => ({
    id: `cat-e${i}`,
    name,
    icon,
    type: 'expense' as const,
    parentId: null,
    iconImage: null,
    monthlyBudget: null,
  })),
  ...INCOME.map(([name, icon], i) => ({
    id: `cat-i${i}`,
    name,
    icon,
    type: 'income' as const,
    parentId: null,
    iconImage: null,
    monthlyBudget: null,
  })),
];
