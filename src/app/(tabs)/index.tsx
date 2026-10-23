import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '@/constants/theme';
import { Icon } from '@/components/Icon';
import {
  completeRecurringOccurrence,
  deleteTxn,
  insertTxn,
  listDueRecurringBills,
  listTxnsByMonth,
  monthSummary,
  skipRecurringOccurrence,
  syncRecurringOccurrences,
} from '@/db/repo';
import type { DueRecurringBill, MonthSummary, Txn, TxType } from '@/db/types';
import { useStore } from '@/store/useStore';
import { formatFen } from '@/utils/money';
import { dateKey, dayLabel, monthKey } from '@/utils/date';
import { MonthSwitcher } from '@/components/MonthSwitcher';
import { TxnRow } from '@/components/TxnRow';
import { CategoryChips } from '@/components/CategoryChips';
import { FilterOptions } from '@/components/FilterOptions';
import { UndoBanner } from '@/components/UndoBanner';
import { hasQuickParams, toForwardQuery } from '@/utils/quicklink';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const TYPE_LABELS: Record<TxType, string> = { expense: '支出', income: '收入', transfer: '转账' };

export default function BillsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dataVersion = useStore((s) => s.dataVersion);
  const refresh = useStore((s) => s.refresh);
  const monthlyBudget = useStore((s) => s.settings.monthlyBudget);
  const accounts = useStore((s) => s.accounts);
  const categories = useStore((s) => s.categories);
  const notice = useStore((s) => s.notice);
  const params = useLocalSearchParams<{
    amount?: string; save?: string; type?: string; note?: string; category?: string; form?: string; t?: string;
    filterMonth?: string; filterType?: string; filterAccount?: string; filterCategory?: string; filterDate?: string; filterRequest?: string;
  }>();
  useEffect(() => {
    if (!hasQuickParams(params)) return;
    const qs = toForwardQuery(params);
    if (qs) router.push(`/transaction?${qs}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => useStore.setState({ notice: null }), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.filterMonth ?? '') && params.filterMonth! <= monthKey() ? params.filterMonth! : monthKey();
  const type = params.filterType && ['expense', 'income', 'transfer'].includes(params.filterType) ? params.filterType as TxType : undefined;
  const [query, setQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => {
    if (params.filterRequest) { setQuery(''); setFiltersOpen(false); }
  }, [params.filterRequest]);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [summary, setSummary] = useState<MonthSummary>({ expense: 0, income: 0, balance: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [undoTxn, setUndoTxn] = useState<Txn | null>(null);
  const [dueBills, setDueBills] = useState<DueRecurringBill[]>([]);
  const [dueBusy, setDueBusy] = useState<string | null>(null);
  const [dueError, setDueError] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([listTxnsByMonth(month), monthSummary(month)]).then(([items, totals]) => {
      if (active) { setTxns(items); setSummary(totals); setError(''); }
    }).catch(() => { if (active) setError('账单加载失败，请重试'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [month, dataVersion, retry]);
  useEffect(() => {
    let active = true;
    const loadDue = async () => {
      try {
        await syncRecurringOccurrences();
        const items = await listDueRecurringBills();
        if (active) {
          setDueBills(items);
          setDueError('');
        }
      } catch {
        if (active) setDueBills([]);
      }
    };
    void loadDue();
    return () => { active = false; };
  }, [dataVersion]);

  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const filterCategory = params.filterCategory ? categoryMap.get(params.filterCategory) : undefined;
  // 选中一级分类时，明细里包含它所有子分类，文案里说明一下
  const filterCategoryLabel = filterCategory
    ? categories.some((c) => c.parentId === filterCategory.id)
      ? `${filterCategory.name}（含子类）`
      : filterCategory.name
    : undefined;
  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return txns.filter((t) => {
      if (type && t.type !== type) return false;
      if (params.filterAccount && t.accountId !== params.filterAccount && t.toAccountId !== params.filterAccount) return false;
      if (params.filterCategory) {
        const cat = categoryMap.get(t.categoryId ?? '');
        if (t.categoryId !== params.filterCategory && cat?.parentId !== params.filterCategory) return false;
      }
      if (params.filterDate && t.date !== params.filterDate) return false;
      return !search || [t.note, categoryMap.get(t.categoryId ?? '')?.name, accountMap.get(t.accountId)?.name,
        accountMap.get(t.toAccountId ?? '')?.name, (t.amount / 100).toFixed(2), TYPE_LABELS[t.type]]
        .some((value) => value?.toLocaleLowerCase().includes(search));
    });
  }, [txns, type, params.filterAccount, params.filterCategory, params.filterDate, query, accountMap, categoryMap]);
  const sections = useMemo(() => {
    const groups = new Map<string, Txn[]>();
    for (const txn of filtered) { const group = groups.get(txn.date) ?? []; group.push(txn); groups.set(txn.date, group); }
    return [...groups].map(([date, data]) => ({ date, data, expense: data.reduce((sum, t) => sum + (t.type === 'expense' ? t.amount : 0), 0) }));
  }, [filtered]);
  const activeFilters = !!(type || params.filterAccount || params.filterCategory || params.filterDate || query.trim());
  const clearFilters = () => {
    setQuery('');
    router.setParams({ filterType: undefined, filterAccount: undefined, filterCategory: undefined, filterDate: undefined });
  };
  const remove = async (txn: Txn) => {
    try {
      await deleteTxn(txn.id);
      setUndoTxn(txn);
    } catch {
      setError('删除失败，请重试');
      return;
    }
    try {
      await refresh();
    } catch {
      setError('账单已删除，但列表刷新失败，请重新打开应用');
    }
  };
  const undo = async () => {
    const txn = undoTxn;
    if (!txn) return;
    setUndoTxn(null);
    try {
      await insertTxn(txn);
      useStore.setState({ notice: '已撤销删除' });
    } catch {
      setError('撤销失败，请重新录入这笔账单');
      return;
    }
    try {
      await refresh();
    } catch {
      setError('账单已恢复，但列表刷新失败，请重新打开应用');
    }
  };
  const confirmDue = async (bill: DueRecurringBill) => {
    setDueBusy(bill.occurrenceId);
    setDueError('');
    try {
      const txn = await completeRecurringOccurrence(bill.occurrenceId);
      if (!txn) throw new Error('ALREADY_HANDLED');
    } catch {
      setDueError(`“${bill.title}”确认失败，请重试`);
      setDueBusy(null);
      return;
    }
    setDueBills((items) => items.filter((item) => item.occurrenceId !== bill.occurrenceId));
    useStore.setState({ notice: `已记账 · ${bill.title} ¥${formatFen(bill.amount)}` });
    try {
      await refresh();
    } catch {
      setDueError('账单已入账，但列表刷新失败，请重新打开应用');
    } finally {
      setDueBusy(null);
    }
  };
  const skipDue = async (bill: DueRecurringBill) => {
    setDueBusy(bill.occurrenceId);
    setDueError('');
    try {
      await skipRecurringOccurrence(bill.occurrenceId);
    } catch {
      setDueError(`“${bill.title}”跳过失败，请重试`);
      setDueBusy(null);
      return;
    }
    setDueBills((items) => items.filter((item) => item.occurrenceId !== bill.occurrenceId));
    useStore.setState({ notice: `已跳过 · ${bill.title}` });
    try {
      await refresh();
    } catch {
      setDueError('已跳过，但列表刷新失败，请重新打开应用');
    } finally {
      setDueBusy(null);
    }
  };
  const budgetRatio = monthlyBudget > 0 ? summary.expense / monthlyBudget : 0;
  const budgetOver = budgetRatio > 1;
  const header = <>
    <View style={styles.summaryCard}>
      <Text style={styles.heroLabel}>本月支出 · ¥</Text>
      <Text style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit>{loading ? '—' : formatFen(summary.expense)}</Text>
      <View style={styles.summaryRow}>
        <View style={styles.stat}><Text style={styles.statLabel}>本月收入</Text><Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>¥{formatFen(summary.income)}</Text></View>
        <View style={styles.stat}><Text style={styles.statLabel}>本月结余</Text><Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>¥{formatFen(summary.balance)}</Text></View>
      </View>
      <Pressable style={styles.budgetBox} accessibilityRole="button" accessibilityLabel="查看预算详情" onPress={() => router.push('/budgets')}>
        <View style={styles.budgetTextRow}>
          <Text style={styles.budgetLabel}>{monthlyBudget > 0 ? `预算 ¥${formatFen(monthlyBudget)}` : '设置每月预算'}</Text>
          <Text style={styles.budgetLabel}>{monthlyBudget > 0 ? `${budgetOver ? '超支' : '剩余'} ¥${formatFen(Math.abs(monthlyBudget - summary.expense))} ›` : '规划本月支出 ›'}</Text>
        </View>
        {monthlyBudget > 0 && <View style={styles.barBg}><View style={[styles.barFill, { width: `${Math.min(100, budgetRatio * 100)}%`, backgroundColor: budgetOver ? '#FFD8D5' : '#FFFFFF' }]} /></View>}
      </Pressable>
    </View>
    {(dueBills.length > 0 || !!dueError) && (
      <View style={styles.dueCard}>
        <View style={styles.dueHeader}>
          <View>
            <Text style={styles.dueTitle}>待确认周期账单</Text>
            <Text style={styles.dueHint}>确认后才写入流水</Text>
          </View>
          <Pressable
            style={styles.dueManage}
            accessibilityRole="button"
            onPress={() => router.push('/recurring')}
          >
            <Text style={styles.dueManageText}>管理</Text>
          </Pressable>
        </View>
        {!!dueError && (
          <Text style={styles.dueError} accessibilityRole="alert">{dueError}</Text>
        )}
        {dueBills.slice(0, 2).map((bill) => {
          const category = categoryMap.get(bill.categoryId ?? '');
          const account = accountMap.get(bill.accountId);
          return (
            <View key={bill.occurrenceId} style={styles.dueRow}>
              <View style={styles.dueInfoRow}>
                <View style={styles.dueIcon}>
                  <Text style={styles.dueEmoji}>
                    {bill.type === 'transfer' ? '🔁' : category?.icon ?? '🧾'}
                  </Text>
                </View>
                <View style={styles.dueMid}>
                  <Text style={styles.dueName} numberOfLines={1}>{bill.title}</Text>
                  <Text style={styles.dueMeta} numberOfLines={1}>
                    {dayLabel(bill.dueDate)} · {account?.name ?? '账户'}
                  </Text>
                </View>
                <Text style={[
                  styles.dueAmount,
                  { color: bill.type === 'income' ? C.income : bill.type === 'transfer' ? C.transfer : C.expense },
                ]}>¥{formatFen(bill.amount)}</Text>
              </View>
              <View style={styles.dueActions}>
                <Pressable
                  style={styles.dueSkip}
                  disabled={dueBusy === bill.occurrenceId}
                  accessibilityRole="button"
                  onPress={() => skipDue(bill)}
                >
                  <Text style={styles.dueSkipText}>跳过</Text>
                </Pressable>
                <Pressable
                  style={styles.dueConfirm}
                  disabled={dueBusy === bill.occurrenceId}
                  accessibilityRole="button"
                  onPress={() => confirmDue(bill)}
                >
                  {dueBusy === bill.occurrenceId ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.dueConfirmText}>确认记账</Text>
                  )}
                </Pressable>
              </View>
            </View>
          );
        })}
        {dueBills.length > 2 && (
          <Text style={styles.dueMore}>还有 {dueBills.length - 2} 笔待确认</Text>
        )}
      </View>
    )}
    <View style={styles.searchRow}>
      <Icon name="search-outline" size={19} color={C.text2} />
      <TextInput style={styles.searchInput} accessibilityLabel="搜索本月账单" placeholder="搜索本月备注、分类或金额" placeholderTextColor={C.text3} value={query} onChangeText={setQuery} returnKeyType="search" />
      {!!query && <Pressable style={styles.smallButton} accessibilityRole="button" accessibilityLabel="清空搜索" onPress={() => setQuery('')}><Icon name="close" size={18} color={C.text2} /></Pressable>}
      <Pressable
        style={styles.smallButton}
        accessibilityRole="button"
        accessibilityLabel="搜索全部月份"
        onPress={() => router.push({ pathname: '/search', params: query.trim() ? { q: query.trim() } : {} })}
      >
        <Text style={{ color: C.primary, fontSize: 14 }}>全库</Text>
      </Pressable>
      <Pressable style={styles.smallButton} accessibilityRole="button" accessibilityState={{ expanded: filtersOpen }} onPress={() => setFiltersOpen((v) => !v)}><Text style={{ color: C.primary, fontSize: 14 }}>筛选</Text></Pressable>
    </View>
    {filtersOpen && <View style={styles.filterCard}>
      <FilterOptions label="类型" options={[{ id: '', name: '全部类型' }, ...Object.entries(TYPE_LABELS).map(([id, name]) => ({ id, name }))]} selected={type} onChange={(value) => router.setParams({ filterType: value || undefined, filterCategory: undefined })} />
      <FilterOptions label="账户" options={[{ id: '', name: '全部账户' }, ...accounts]} selected={params.filterAccount} onChange={(value) => router.setParams({ filterAccount: value || undefined })} />
      <CategoryChips
        allLabel="全部分类"
        categories={categories.filter((c) => !type || c.type === type)}
        selected={params.filterCategory ?? ''}
        onChange={(value) => router.setParams({ filterCategory: value || undefined })}
      />
    </View>}
    {activeFilters && <View style={styles.filterSummary}>
      <Text style={styles.filterDescription}>{[type && TYPE_LABELS[type], accountMap.get(params.filterAccount ?? '')?.name, filterCategoryLabel, params.filterDate, query.trim() && `“${query.trim()}”`].filter(Boolean).join(' · ')} · {filtered.length} 笔</Text>
      <Pressable accessibilityRole="button" style={styles.smallButton} onPress={clearFilters}><Text style={{ color: C.primary }}>重置</Text></Pressable>
    </View>}
    <View style={styles.listHeading}><Text style={styles.sectionTitle}>账单明细</Text><Text style={styles.hint}>汇总卡展示整月收支</Text></View>
  </>;

  return <View style={styles.screen}>
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}><Text style={styles.appTitle}>简账</Text>
      <MonthSwitcher month={month} onChange={(value) => router.setParams({ filterMonth: value, filterDate: undefined })} canNext={month < monthKey()} />
    </View>
    {!!notice && <Text style={styles.notice} accessibilityLiveRegion="polite">{notice}</Text>}
    <SectionList sections={loading || error ? [] : sections} keyExtractor={(txn) => txn.id} contentContainerStyle={styles.content} stickySectionHeadersEnabled={false} keyboardShouldPersistTaps="handled"
      ListHeaderComponent={header}
      renderSectionHeader={({ section }) => <View style={styles.dayHeader}><Text style={styles.dayTitle}>{Number(section.date.slice(8))}日 <Text style={styles.hint}>{section.date === dateKey() ? '今天' : `周${WEEKDAYS[new Date(`${section.date}T00:00:00`).getDay()]}`}</Text></Text>
        {section.expense > 0 && <Text style={styles.hint}>支出 ¥{formatFen(section.expense)}</Text>}</View>}
      renderItem={({ item, index, section }) => <View style={styles.txnWrap}><TxnRow txn={item} last={index === section.data.length - 1} onPress={() => router.push(`/transaction?id=${item.id}`)} onDelete={remove} /></View>}
      ListEmptyComponent={<View style={styles.empty}>
        <Text style={{ fontSize: 34 }}>{error ? '⚠️' : activeFilters ? '🔎' : '🧾'}</Text>
        <Text style={styles.emptyText}>{error || (loading ? '正在加载账单…' : activeFilters ? '没有符合条件的记录' : '这个月还没有记录')}</Text>
        {!loading && <Pressable accessibilityRole="button" style={styles.emptyAction} onPress={error ? () => setRetry((v) => v + 1) : activeFilters ? clearFilters : () => router.push('/transaction')}><Text style={{ color: C.primary, fontWeight: '600' }}>{error ? '重新加载' : activeFilters ? '清除筛选' : '记第一笔'}</Text></Pressable>}
      </View>}
    />
    {undoTxn && (
      <UndoBanner
        message={`已删除“${categoryMap.get(undoTxn.categoryId ?? '')?.name ?? accountMap.get(undoTxn.accountId)?.name ?? '这笔账单'}”`}
        onUndo={undo}
        onDismiss={() => setUndoTxn(null)}
        bottom={insets.bottom + 88}
      />
    )}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  appTitle: { fontSize: 24, fontWeight: '800', color: C.text },
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  summaryCard: { backgroundColor: C.primary, borderRadius: 20, padding: 20, marginBottom: 16 },
  dueCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    gap: 10,
  },
  dueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dueTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  dueHint: { fontSize: 12, color: C.text2, marginTop: 2 },
  dueManage: { minWidth: 48, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  dueManageText: { color: C.primary, fontSize: 14 },
  dueError: { color: C.danger, fontSize: 13, lineHeight: 19 },
  dueRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    paddingTop: 10,
    gap: 8,
  },
  dueInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dueIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: C.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dueEmoji: { fontSize: 18 },
  dueMid: { flex: 1, minWidth: 0, gap: 2 },
  dueName: { fontSize: 15, fontWeight: '600', color: C.text },
  dueMeta: { fontSize: 12, color: C.text2 },
  dueAmount: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  dueActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  dueSkip: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: C.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dueSkipText: { color: C.text2, fontSize: 13 },
  dueConfirm: {
    minWidth: 92,
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dueConfirmText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  dueMore: { fontSize: 12, color: C.text2, textAlign: 'center' },
  heroLabel: { color: '#FFFFFF', fontSize: 14 },
  heroAmount: { color: '#FFFFFF', fontSize: 36, fontWeight: '800', fontVariant: ['tabular-nums'], marginTop: 6, marginBottom: 20 },
  summaryRow: { flexDirection: 'row', gap: 16 },
  stat: { flex: 1, gap: 6 },
  statLabel: { color: '#FFFFFF', fontSize: 13 },
  statValue: { color: '#FFFFFF', fontSize: 18, fontWeight: '600', fontVariant: ['tabular-nums'] },
  budgetBox: { marginTop: 18, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.4)', gap: 10, minHeight: 44 },
  budgetTextRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  budgetLabel: { color: '#FFFFFF', fontSize: 13 },
  barBg: { height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 14, paddingLeft: 12, paddingRight: 4, gap: 8, minHeight: 48 },
  searchInput: { flex: 1, minWidth: 0, fontSize: 14, color: C.text, paddingVertical: 12 },
  smallButton: { minWidth: 40, minHeight: 44, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  filterCard: { padding: 14, backgroundColor: C.card, borderRadius: 14, gap: 14, marginTop: 8 },
  filterSummary: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  filterDescription: { flex: 1, fontSize: 13, lineHeight: 20, color: C.text2 },
  listHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  hint: { fontSize: 12, color: C.text2 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.bg, paddingVertical: 12 },
  dayTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  txnWrap: { backgroundColor: C.card, paddingHorizontal: 12 },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyText: { color: C.text2, fontSize: 15 },
  emptyAction: { backgroundColor: C.primarySoft, borderRadius: 12, paddingHorizontal: 24, minHeight: 44, justifyContent: 'center' },
  notice: { fontSize: 14, color: C.income, backgroundColor: C.incomeSoft, padding: 12 },
});
