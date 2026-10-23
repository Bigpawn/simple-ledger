import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { CategoryChips } from '@/components/CategoryChips';
import { FilterOptions } from '@/components/FilterOptions';
import { TxnRow } from '@/components/TxnRow';
import { UndoBanner } from '@/components/UndoBanner';
import { C } from '@/constants/theme';
import { deleteTxn, insertTxn, searchTxns } from '@/db/repo';
import type { Txn, TxType } from '@/db/types';
import { useStore } from '@/store/useStore';
import { dayLabel } from '@/utils/date';
import { formatFen } from '@/utils/money';

const TYPE_LABELS: Record<TxType, string> = {
  expense: '支出',
  income: '收入',
  transfer: '转账',
};

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ q?: string }>();
  const accounts = useStore((state) => state.accounts);
  const categories = useStore((state) => state.categories);
  const dataVersion = useStore((state) => state.dataVersion);
  const refresh = useStore((state) => state.refresh);
  const [query, setQuery] = useState(typeof params.q === 'string' ? params.q : '');
  const [type, setType] = useState<TxType | undefined>();
  const [accountId, setAccountId] = useState<string | undefined>();
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [items, setItems] = useState<Txn[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [undoTxn, setUndoTxn] = useState<Txn | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const result = await searchTxns(query, { type, accountId, categoryId }, 500);
      if (currentRequest !== requestId.current) return;
      setItems(result.items);
      setTruncated(result.truncated);
    } catch {
      if (currentRequest !== requestId.current) return;
      setItems([]);
      setTruncated(false);
      setError('搜索失败，请重试');
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [query, type, accountId, categoryId, retry]);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => void load(), query.trim() ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, dataVersion, query]);

  const sections = useMemo(() => {
    const groups = new Map<string, Txn[]>();
    for (const txn of items) {
      const list = groups.get(txn.date) ?? [];
      list.push(txn);
      groups.set(txn.date, list);
    }
    return [...groups].map(([date, data]) => ({ date, data }));
  }, [items]);

  const totals = useMemo(
    () =>
      items.reduce(
        (sum, txn) => ({
          expense: sum.expense + (txn.type === 'expense' ? txn.amount : 0),
          income: sum.income + (txn.type === 'income' ? txn.amount : 0),
        }),
        { expense: 0, income: 0 }
      ),
    [items]
  );

  const hasFilters = !!type || !!accountId || !!categoryId;
  const hasCriteria = hasFilters || !!query.trim();
  const accountMap = useMemo(() => new Map(accounts.map((item) => [item.id, item])), [accounts]);
  const categoryMap = useMemo(
    () => new Map(categories.map((item) => [item.id, item])),
    [categories]
  );

  const reset = () => {
    setQuery('');
    setType(undefined);
    setAccountId(undefined);
    setCategoryId(undefined);
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
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

  const header = (
    <>
      <View style={styles.searchRow}>
        <Icon name="search-outline" size={19} color={C.text2} />
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="搜索备注、分类、账户或金额"
          placeholderTextColor={C.text3}
          accessibilityLabel="搜索所有月份账单"
          returnKeyType="search"
          autoFocus
        />
        {!!query && (
          <Pressable
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel="清空搜索"
            onPress={() => setQuery('')}
          >
            <Icon name="close" size={18} color={C.text2} />
          </Pressable>
        )}
      </View>

      <View style={styles.toolbar}>
        <Text style={styles.resultCount}>
          {loading ? '搜索中…' : `${hasCriteria ? '找到' : '最近'} ${items.length} 笔`}
          {truncated ? '（仅显示最近 500 条）' : ''}
        </Text>
        <Pressable
          style={styles.filterButton}
          accessibilityRole="button"
          accessibilityLabel={filtersOpen ? '收起筛选' : '展开筛选'}
          accessibilityState={{ expanded: filtersOpen }}
          onPress={() => setFiltersOpen((value) => !value)}
        >
          <Text style={styles.filterButtonText}>{hasFilters ? '筛选已启用' : '筛选'}</Text>
          <Icon name={filtersOpen ? 'chevron-up' : 'chevron-down'} size={16} color={C.primary} />
        </Pressable>
      </View>

      {filtersOpen && (
        <View style={styles.filterCard}>
          <FilterOptions
            label="类型"
            options={[
              { id: '', name: '全部类型' },
              ...Object.entries(TYPE_LABELS).map(([id, name]) => ({ id, name })),
            ]}
            selected={type}
            onChange={(value) => {
              setType(value ? (value as TxType) : undefined);
              setCategoryId(undefined);
            }}
          />
          <FilterOptions
            label="账户"
            options={[{ id: '', name: '全部账户' }, ...accounts]}
            selected={accountId}
            onChange={(value) => setAccountId(value || undefined)}
          />
          <CategoryChips
            allLabel="全部分类"
            categories={categories.filter((item) => !type || item.type === type)}
            selected={categoryId ?? ''}
            onChange={(value) => setCategoryId(value || undefined)}
          />
        </View>
      )}

      {(hasCriteria || items.length > 0) && (
        <View style={styles.summary}>
          <Text style={styles.summaryText}>
            支出 ¥{formatFen(totals.expense)} · 收入 ¥{formatFen(totals.income)}
          </Text>
          {hasCriteria && (
            <Pressable style={styles.resetButton} accessibilityRole="button" onPress={reset}>
              <Text style={styles.resetText}>清除条件</Text>
            </Pressable>
          )}
        </View>
      )}

      {!!error && (
        <Pressable style={styles.error} accessibilityRole="button" onPress={() => setRetry((v) => v + 1)}>
          <Text style={styles.errorText}>{error} · 点此重试</Text>
        </Pressable>
      )}
    </>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="返回"
          onPress={goBack}
        >
          <Icon name="chevron-back" size={24} color={C.text} />
        </Pressable>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>搜索全部账单</Text>
          <Text style={styles.subtitle}>跨月份查找备注、分类和账户</Text>
        </View>
        {loading ? <ActivityIndicator color={C.primary} style={styles.loading} /> : <View style={styles.loading} />}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(txn) => txn.id}
        ListHeaderComponent={header}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 88 }]}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <View style={styles.dayHeader}>
            <Text style={styles.dayTitle}>{dayLabel(section.date)}</Text>
            <Text style={styles.dayCount}>{section.data.length} 笔</Text>
          </View>
        )}
        renderItem={({ item, index, section }) => (
          <View style={styles.txnWrap}>
            <TxnRow
              txn={item}
              last={index === section.data.length - 1}
              onPress={() => router.push(`/transaction?id=${item.id}`)}
              onDelete={remove}
            />
          </View>
        )}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>{hasCriteria ? '🔎' : '🧾'}</Text>
              <Text style={styles.emptyTitle}>
                {hasCriteria ? '没有找到符合条件的账单' : '还没有账单'}
              </Text>
              <Text style={styles.emptyHint}>
                {hasCriteria
                  ? '试试其他关键词，或调整类型、账户和分类筛选'
                  : '记账后就可以在这里跨月份查找'}
              </Text>
              {hasCriteria && (
                <Pressable style={styles.emptyAction} accessibilityRole="button" onPress={reset}>
                  <Text style={styles.emptyActionText}>清除搜索条件</Text>
                </Pressable>
              )}
            </View>
          ) : undefined
        }
      />

      {undoTxn && (
        <UndoBanner
          message={`已删除“${categoryMap.get(undoTxn.categoryId ?? '')?.name ?? accountMap.get(undoTxn.accountId)?.name ?? '这笔账单'}”`}
          onUndo={undo}
          onDismiss={() => setUndoTxn(null)}
          bottom={insets.bottom + 16}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 8 },
  back: { width: 44, height: 48, alignItems: 'center', justifyContent: 'center' },
  titleWrap: { flex: 1 },
  title: { fontSize: 20, fontWeight: '800', color: C.text },
  subtitle: { fontSize: 12, color: C.text2, marginTop: 2 },
  loading: { width: 40 },
  content: { paddingHorizontal: 16 },
  searchRow: {
    minHeight: 50,
    paddingLeft: 12,
    paddingRight: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.card,
    borderRadius: 14,
  },
  input: { flex: 1, minWidth: 0, fontSize: 15, color: C.text, paddingVertical: 12 },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  resultCount: { flex: 1, color: C.text2, fontSize: 13 },
  filterButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: 12 },
  filterButtonText: { color: C.primary, fontSize: 14 },
  filterCard: { padding: 14, backgroundColor: C.card, borderRadius: 14, gap: 14, marginBottom: 8 },
  summary: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  summaryText: { flex: 1, fontSize: 13, color: C.text2, fontVariant: ['tabular-nums'] },
  resetButton: { minWidth: 68, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  resetText: { color: C.primary, fontSize: 13 },
  error: { backgroundColor: C.expenseSoft, padding: 12, borderRadius: 10, marginVertical: 8 },
  errorText: { color: C.danger, fontSize: 13 },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    backgroundColor: C.bg,
  },
  dayTitle: { color: C.text, fontSize: 15, fontWeight: '700' },
  dayCount: { color: C.text2, fontSize: 12 },
  txnWrap: { backgroundColor: C.card, paddingHorizontal: 12 },
  empty: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 24, gap: 10 },
  emptyIcon: { fontSize: 36 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.text, textAlign: 'center' },
  emptyHint: { fontSize: 13, lineHeight: 20, color: C.text2, textAlign: 'center' },
  emptyAction: {
    minHeight: 44,
    paddingHorizontal: 22,
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: C.primarySoft,
  },
  emptyActionText: { color: C.primary, fontWeight: '600' },
});
