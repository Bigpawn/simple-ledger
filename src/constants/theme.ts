export const C = {
  bg: '#F6F7FA',
  card: '#FFFFFF',
  text: '#1C2333',
  text2: '#596579',
  text3: '#677389',
  border: '#EEF0F5',
  primary: '#3169DC',
  primarySoft: '#EAF0FF',
  expense: '#C83D39',
  expenseSoft: '#FDEDEC',
  income: '#138252',
  incomeSoft: '#E4F6EE',
  transfer: '#9A6208',
  warn: '#9A6208',
  danger: '#C83D39',
  keypadBg: '#FFFFFF',
  keypadKey: '#F3F4F8',
  chip: '#F3F4F8',
  mask: 'rgba(0,0,0,0.45)',
} as const;

export const R = {
  card: 16,
  btn: 12,
} as const;

/** 白卡片浮起阴影（iOS） */
export const CARD_SHADOW = {
  shadowColor: '#1C2333',
  shadowOpacity: 0.025,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;

export const FONT = 'System';

/** 图表用调色板（环图/占比条） */
export const PIE_COLORS = [
  '#3D7BFF', '#F0554F', '#1FB473', '#F5A623', '#8A6CF0',
  '#00B8D9', '#FF7A9E', '#7C8DB0', '#26C6A6', '#E8630A',
] as const;
