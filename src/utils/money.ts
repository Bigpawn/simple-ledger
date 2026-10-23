/** 金额统一以「分」(整数) 存储，展示时转为元 */

/** 分 -> 带千分位的元字符串，如 123456 -> "1,234.56" */
export function formatFen(fen: number): string {
  const neg = fen < 0;
  const abs = Math.abs(fen);
  const yuan = Math.floor(abs / 100);
  const cents = abs % 100;
  const yuanStr = yuan.toLocaleString('en-US');
  const centStr = cents === 0 ? '00' : String(cents).padStart(2, '0');
  return `${neg ? '-' : ''}${yuanStr}.${centStr}`;
}

/** 分 -> 简洁元字符串（整数位无千分位），用于键盘等紧凑展示 */
export function fenToPlain(fen: number): string {
  const neg = fen < 0;
  const abs = Math.abs(fen);
  return `${neg ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** 键盘输入字符串（如 "12.3"、"0.05"）-> 分；非法返回 0 */
export function keypadToFen(input: string): number {
  const n = Number(input);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

/** 键盘输入规则：追加一个字符，保持合法金额格式 */
export function keypadAppend(input: string, ch: string): string {
  if (/[0-9]/.test(ch)) {
    const [, dec = ''] = input.split('.');
    if (input.includes('.') && dec.length >= 2) return input;
    const intPart = input.split('.')[0];
    if (intPart.replace(/^0+/, '').length >= 9) return input; // 亿元级上限
    if (intPart === '0' && !input.includes('.')) return ch; // 前导 0 替换
    return input + ch;
  }
  if (ch === '.') {
    if (input.includes('.')) return input;
    return input + '.';
  }
  if (ch === 'del') {
    return input.length <= 1 ? '0' : input.slice(0, -1);
  }
  return input;
}

/** 元字符串（用户输入）-> 分，用于预算/余额输入框 */
export function yuanToFen(input: string): number {
  const n = Number(input);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}
