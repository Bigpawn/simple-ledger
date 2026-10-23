import { getSetting, saveSetting } from '@/db/repo';

/**
 * 快捷指令深链的「一次性消费」机制。
 *
 * 背景：Expo Go 会记住上次打开项目所用的深链 URL，并在下次打开时重放，
 * 导致旧链接（如上次的记账参数）被再次执行。这里做两层保护：
 * 1. 快捷指令 URL 带 `t`（格式化时间戳），命中已消费的 t 视为过期；
 * 2. 未带 t 的旧链接，90 秒内出现完全相同的参数组合视为重放。
 *
 * 过期链接：不预填、不自动记账，直接回首页。
 */

export interface QuickLinkParams {
  form?: string;
  amount?: string;
  save?: string;
  type?: string;
  note?: string;
  category?: string;
  t?: string;
  handled?: string;
  id?: string;
}

const CONTENT_KEYS = ['amount', 'save', 'type', 'note', 'category', 'form'] as const;
const REPLAY_WINDOW_MS = 90_000;
const STATE_KEY = 'quickLinkState';

/** 时间戳洗净：短路指令变量可能带「2026年10月17日 19:05」这类字符，只保留字母数字 */
export function sanitizeToken(v?: string): string {
  return (v ?? '').replace(/[^0-9a-zA-Z]/g, '').slice(0, 32);
}

/** 是否携带快捷指令参数（排除 id / channel-name 等无关参数） */
export function hasQuickParams(p: QuickLinkParams): boolean {
  if (p.id) return false;
  return CONTENT_KEYS.some((k) => typeof p[k] === 'string' && p[k]) || !!sanitizeToken(p.t);
}

/** 消费这次深链；返回 true=新鲜的用户意图，false=Expo Go 重放的旧链接 */
export async function consumeQuickLink(p: QuickLinkParams): Promise<boolean> {
  const t = sanitizeToken(p.t);
  const hash = JSON.stringify(CONTENT_KEYS.map((k) => p[k] ?? null));
  let state: { t?: string; hash?: string; at?: number } = {};
  try {
    state = JSON.parse((await getSetting(STATE_KEY)) ?? '{}') as typeof state;
  } catch {
    // 状态损坏时当作首次
  }
  const now = Date.now();
  const fresh = t
    ? t !== state.t
    : !(state.hash === hash && now - (state.at ?? 0) < REPLAY_WINDOW_MS);
  if (!fresh) return false;
  await saveSetting(
    STATE_KEY,
    JSON.stringify({ t: t || state.t, hash, at: now })
  );
  return true;
}

/** 首页把参数转交记账页时构造 query（连同 t 一起转交，由记账页统一消费） */
export function toForwardQuery(p: QuickLinkParams): string {
  return [...CONTENT_KEYS, 't' as const]
    .filter((k) => typeof p[k] === 'string' && p[k])
    .map((k) => `${k}=${encodeURIComponent(String(p[k]))}`)
    .join('&');
}