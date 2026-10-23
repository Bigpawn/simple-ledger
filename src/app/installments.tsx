import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CategoryChips } from '@/components/CategoryChips';
import { FilterOptions } from '@/components/FilterOptions';
import { Icon } from '@/components/Icon';
import { C } from '@/constants/theme';
import {
  createInstallmentPlan,
  deleteInstallmentPlan,
  listInstallments,
  payInstallmentEntry,
} from '@/db/repo';
import type { InstallmentProgress } from '@/db/types';
import { useStore } from '@/store/useStore';
import { formatFen, yuanToFen } from '@/utils/money';
import { monthKey } from '@/utils/date';

export default function InstallmentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const accounts = useStore((s) => s.accounts);
  const categories = useStore((s) => s.categories);
  const refresh = useStore((s) => s.refresh);
  const [plans, setPlans] = useState<InstallmentProgress[]>([]);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [principal, setPrincipal] = useState('');
  const [periods, setPeriods] = useState('12');
  const [fee, setFee] = useState('');
  const [startMonth, setStartMonth] = useState(monthKey());
  const [accountId, setAccountId] = useState<string | undefined>(accounts[0]?.id);
  const [categoryId, setCategoryId] = useState<string | undefined>();

  const load = useCallback(async () => {
    setPlans(await listInstallments());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!accountId && accounts[0]) setAccountId(accounts[0].id);
  }, [accounts, accountId]);

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === 'expense'),
    [categories]
  );

  const submit = async () => {
    const principalFen = yuanToFen(principal);
    const feeFen = yuanToFen(fee);
    const count = Number(periods);
    if (!title.trim()) return setError('请输入分期名称');
    if (principalFen <= 0) return setError('请输入大于 0 的本金');
    if (!Number.isInteger(count) || count < 1 || count > 60) return setError('期数需为 1 至 60');
    if (!accountId) return setError('请选择还款账户');
    if (!/^\d{4}-\d{2}$/.test(startMonth)) return setError('起始月份格式应为 YYYY-MM');
    await createInstallmentPlan({
      title: title.trim(),
      principal: principalFen,
      periods: count,
      fee: feeFen,
      accountId,
      categoryId: categoryId ?? null,
      startMonth,
    });
    setTitle('');
    setPrincipal('');
    setFee('');
    setPeriods('12');
    setCreating(false);
    setError('');
    await load();
  };

  const pay = async (entryId: string) => {
    await payInstallmentEntry(entryId);
    await refresh();
    await load();
  };

  const remove = (plan: InstallmentProgress) => {
    Alert.alert('删除分期？', `「${plan.title}」的计划会删除，已入账的流水保留`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await deleteInstallmentPlan(plan.id);
          await load();
        },
      },
    ]);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.back} accessibilityRole="button" accessibilityLabel="返回" onPress={() => router.back()}>
          <Icon name="chevron-back" size={24} color={C.text} />
        </Pressable>
        <Text style={styles.title}>分期</Text>
        <Pressable
          accessibilityRole="button"
          style={styles.headerAction}
          onPress={() => setCreating((value) => !value)}
        >
          <Text style={{ color: C.primary }}>{creating ? '取消' : '新建'}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 24 }}>
        {!!error && <Text style={{ color: C.danger }}>{error}</Text>}

        {creating && (
          <View style={styles.card}>
            <Text style={styles.section}>新建分期</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="名称，例如：MacBook"
              placeholderTextColor={C.text3}
              maxLength={20}
            />
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.flex]}
                value={principal}
                onChangeText={setPrincipal}
                placeholder="本金（元）"
                placeholderTextColor={C.text3}
                keyboardType="decimal-pad"
              />
              <TextInput
                style={[styles.input, styles.flex]}
                value={fee}
                onChangeText={setFee}
                placeholder="手续费（元）"
                placeholderTextColor={C.text3}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.flex]}
                value={periods}
                onChangeText={setPeriods}
                placeholder="期数"
                placeholderTextColor={C.text3}
                keyboardType="number-pad"
              />
              <TextInput
                style={[styles.input, styles.flex]}
                value={startMonth}
                onChangeText={setStartMonth}
                placeholder="起始月 YYYY-MM"
                placeholderTextColor={C.text3}
                autoCapitalize="none"
              />
            </View>
            <FilterOptions
              label="还款账户"
              options={accounts.map((a) => ({ id: a.id, name: a.name }))}
              selected={accountId}
              onChange={setAccountId}
            />
            <CategoryChips
              label="分类（可选）"
              categories={expenseCategories}
              selected={categoryId}
              onChange={setCategoryId}
            />
            <Pressable style={styles.primaryButton} accessibilityRole="button" onPress={() => void submit()}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>创建计划</Text>
            </Pressable>
          </View>
        )}

        {plans.length === 0 ? (
          <Text style={styles.empty}>还没有分期计划。新建后按月份入账即可。</Text>
        ) : (
          plans.map((plan) => {
            const open = expanded.has(plan.id);
            const total = plan.principal + plan.fee;
            return (
              <View key={plan.id} style={styles.card}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  style={styles.row}
                  onPress={() =>
                    setExpanded((current) => {
                      const next = new Set(current);
                      if (next.has(plan.id)) next.delete(plan.id);
                      else next.add(plan.id);
                      return next;
                    })
                  }
                >
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.name}>{plan.title}</Text>
                    <Text style={styles.meta}>
                      已入账 {plan.paidPeriods}/{plan.periods} 期 · 总额 ¥{formatFen(total)}
                    </Text>
                  </View>
                  <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={C.text2} />
                </Pressable>
                <View style={styles.track}>
                  <View
                    style={[
                      styles.trackFill,
                      { width: `${Math.min(100, (plan.paidPeriods / plan.periods) * 100)}%` },
                    ]}
                  />
                </View>
                {open && (
                  <View style={{ gap: 6 }}>
                    {plan.entries.map((entry) => (
                      <View key={entry.id} style={styles.entryRow}>
                        <Text style={styles.entryIndex}>第 {entry.period} 期</Text>
                        <Text style={styles.entryMonth}>{entry.dueMonth}</Text>
                        <Text style={styles.entryAmount}>¥{formatFen(entry.amount)}</Text>
                        {entry.transactionId ? (
                          <Text style={styles.paid}>已入账</Text>
                        ) : (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`第${entry.period}期入账`}
                            style={styles.payButton}
                            onPress={() => void pay(entry.id)}
                          >
                            <Text style={{ color: C.primary, fontSize: 13 }}>入账</Text>
                          </Pressable>
                        )}
                      </View>
                    ))}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`删除分期${plan.title}`}
                      style={styles.deleteRow}
                      onPress={() => remove(plan)}
                    >
                      <Icon name="trash-outline" size={14} color={C.text3} />
                      <Text style={{ color: C.text3, fontSize: 12 }}>删除计划</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 8 },
  back: { minWidth: 40, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '700', color: C.text },
  headerAction: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  card: { padding: 18, backgroundColor: C.card, borderRadius: 16, gap: 12 },
  section: { fontSize: 16, fontWeight: '700', color: C.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  input: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: C.chip,
    color: C.text,
    fontSize: 15,
  },
  primaryButton: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { fontSize: 13, color: C.text2, paddingHorizontal: 4 },
  name: { fontSize: 16, fontWeight: '600', color: C.text },
  meta: { fontSize: 12, color: C.text2 },
  track: { height: 6, borderRadius: 3, backgroundColor: C.border, overflow: 'hidden' },
  trackFill: { height: '100%', backgroundColor: C.primary },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  entryIndex: { width: 56, fontSize: 13, color: C.text2 },
  entryMonth: { flex: 1, fontSize: 13, color: C.text2 },
  entryAmount: { fontSize: 14, fontWeight: '600', color: C.text },
  paid: { fontSize: 12, color: C.income, width: 48, textAlign: 'right' },
  payButton: { width: 48, alignItems: 'flex-end' },
  deleteRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 8 },
});
