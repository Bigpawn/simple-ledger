import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CategoryIcon } from '@/components/CategoryIcon';
import { Icon } from '@/components/Icon';
import { MonthSwitcher } from '@/components/MonthSwitcher';
import { TextPromptSheet } from '@/components/TextPromptSheet';
import { C } from '@/constants/theme';
import {
  ensureCurrentBudgetSnapshot,
  expenseByCategoryWithBudget,
  loadBudgetMonth,
  saveBudgetAmount,
  TOTAL_BUDGET_KEY,
} from '@/db/repo';
import { useStore } from '@/store/useStore';
import { groupBudgets, type BudgetLeaf } from '@/utils/budgetTree';
import { monthKey } from '@/utils/date';
import { formatFen, yuanToFen } from '@/utils/money';

type Target = 'total' | BudgetLeaf | null;

export default function BudgetsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [month, setMonth] = useState(monthKey());
  const [rows, setRows] = useState<BudgetLeaf[]>([]);
  const [budget, setBudget] = useState(0);
  const [hasSnapshot, setHasSnapshot] = useState(false);
  const [target, setTarget] = useState<Target>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const version = useStore((s) => s.dataVersion);
  const refresh = useStore((s) => s.refresh);

  const load = useCallback(async () => {
    try {
      if (month === monthKey()) await ensureCurrentBudgetSnapshot();
      const [items, snapshot] = await Promise.all([
        expenseByCategoryWithBudget(month),
        loadBudgetMonth(month),
      ]);
      setRows(
        items.map((item) => ({
          category: item,
          spent: item.spent,
          budget: item.monthlyBudget ?? 0,
        }))
      );
      setBudget(snapshot.total);
      setHasSnapshot(snapshot.exists);
      setError('');
    } catch {
      setError('预算加载失败，请重试');
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load, version]);

  const groups = useMemo(() => groupBudgets(rows), [rows]);
  // 一级分类的“已用”已包含子分类，直接相加不会重复计算
  const spent = groups.reduce((sum, group) => sum + group.spent, 0);
  const initial = target === 'total' ? budget : target?.budget ?? 0;
  const targetName = target === 'total' ? '每月总预算' : target?.category.name ?? '';

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.back} accessibilityRole="button" accessibilityLabel="返回" onPress={() => router.back()}>
          <Icon name="chevron-back" size={24} color={C.text} />
        </Pressable>
        <Text style={styles.title}>预算</Text>
        <MonthSwitcher month={month} onChange={setMonth} canNext={month < monthKey()} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        {!!error && (
          <Pressable onPress={load}>
            <Text style={{ color: C.danger }}>{error}</Text>
          </Pressable>
        )}
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.section}>每月总预算</Text>
            <Pressable accessibilityRole="button" style={styles.action} onPress={() => setTarget('total')}>
              <Text style={{ color: C.primary }}>设置预算</Text>
            </Pressable>
          </View>
          <BudgetProgress budget={budget} spent={spent} />
        </View>
        <Text style={styles.note}>
          {hasSnapshot
            ? '预算已按月份保存。新月份会沿用最近一期预算，修改历史月份不会影响其他月份。'
            : '这个月还没有预算快照。设置任意预算后，会保留为当月记录；分类预算不会自动修改总预算。'}
        </Text>
        <Text style={styles.section}>分类预算</Text>
        {groups.map(({ parent, children, budget: groupBudget, spent: groupSpent, derived }) => {
          const open = expanded.has(parent.category.id);
          const hasChildren = children.length > 0;
          return (
            <Pressable
              key={parent.category.id}
              accessibilityRole="button"
              accessibilityLabel={hasChildren ? `展开${parent.category.name}子分类预算` : `设置${parent.category.name}预算`}
              style={styles.card}
              onPress={() => {
                if (hasChildren) toggle(parent.category.id);
                else setTarget(parent);
              }}
            >
              <View style={styles.row}>
                <View style={styles.nameRow}>
                  <CategoryIcon category={parent.category} size={20} />
                  <Text style={styles.name}>{parent.category.name}</Text>
                </View>
                <View style={styles.rowActions}>
                  {hasChildren && (
                    <Text style={styles.deriveHint}>按子分类合计</Text>
                  )}
                  <Icon name={open ? 'chevron-up' : 'chevron-forward'} size={16} color={C.text2} />
                </View>
              </View>
              <BudgetProgress budget={groupBudget} spent={groupSpent} />
              {derived && parent.budget > 0 && (
                <Text style={styles.legacyHint}>
                  原父分类预算 ¥{formatFen(parent.budget)} 已停用，请改到子分类设置
                </Text>
              )}
              {open &&
                children.map((child) => (
                  <Pressable
                    key={child.category.id}
                    accessibilityRole="button"
                    accessibilityLabel={`设置${child.category.name}预算`}
                    style={styles.childRow}
                    onPress={(event) => {
                      event.stopPropagation();
                      setTarget(child);
                    }}
                  >
                    <CategoryIcon category={child.category} size={16} />
                    <Text style={styles.childName} numberOfLines={1}>{child.category.name}</Text>
                    <Text style={styles.childMeta}>
                      {child.budget > 0 ? `预算 ¥${formatFen(child.budget)}` : '未设预算'} · 已用 ¥
                      {formatFen(child.spent)}
                    </Text>
                  </Pressable>
                ))}
            </Pressable>
          );
        })}
      </ScrollView>
      <TextPromptSheet
        key={target === 'total' ? 'total' : target?.category.id ?? 'closed'}
        visible={target !== null}
        title={`${targetName}（元）`}
        placeholder="输入金额，0 表示不设预算"
        keyboardType="decimal-pad"
        initial={initial > 0 ? String(initial / 100) : ''}
        onClose={() => setTarget(null)}
        onSubmit={async (text) => {
          if (text !== '' && (!/^\d+(\.\d{1,2})?$/.test(text) || !Number.isSafeInteger(yuanToFen(text)))) {
            throw new Error('请输入有效金额，最多两位小数');
          }
          const amount = yuanToFen(text);
          if (target === 'total') await saveBudgetAmount(month, TOTAL_BUDGET_KEY, amount);
          else if (target) await saveBudgetAmount(month, target.category.id, amount);
          await refresh();
          await load();
        }}
      />
    </View>
  );
}

function BudgetProgress({ budget, spent }: { budget: number; spent: number }) {
  const over = budget > 0 && spent > budget;
  const color = over ? C.danger : budget > 0 && spent / budget > 0.8 ? C.warn : C.primary;
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.row}>
        <Text style={{ color: C.text2, fontSize: 14 }}>已用 ¥{formatFen(spent)}</Text>
        <Text style={{ color: C.text2, fontSize: 14 }}>
          {budget > 0 ? `预算 ¥${formatFen(budget)}` : '未设置预算'}
        </Text>
      </View>
      {budget > 0 && (
        <>
          <View style={styles.track}>
            <View style={{ height: '100%', width: `${Math.min(100, (spent / budget) * 100)}%`, backgroundColor: color }} />
          </View>
          <Text style={{ color, fontSize: 14, fontWeight: '600' }}>
            {over ? `已超支 ¥${formatFen(spent - budget)}` : `剩余 ¥${formatFen(budget - spent)}`} · 已用{' '}
            {Math.round((spent / budget) * 100)}%
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 8 },
  back: { minWidth: 40, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '700', color: C.text },
  content: { padding: 16, gap: 14 },
  card: { padding: 18, backgroundColor: C.card, borderRadius: 16, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  section: { fontSize: 16, fontWeight: '700', color: C.text },
  name: { fontSize: 16, fontWeight: '600', color: C.text },
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  childName: { flex: 1, fontSize: 14, color: C.text, fontWeight: '500' },
  childMeta: { fontSize: 12, color: C.text2 },
  deriveHint: { fontSize: 12, color: C.text3 },
  legacyHint: { fontSize: 12, color: C.warn, lineHeight: 18 },
  note: { fontSize: 13, lineHeight: 21, color: C.text2 },
  action: { minHeight: 44, justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, backgroundColor: C.border, overflow: 'hidden' },
});
