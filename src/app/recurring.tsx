import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
  deleteRecurringRule,
  insertRecurringRule,
  listRecurringRules,
  newId,
  setRecurringRuleActive,
  syncRecurringOccurrences,
  updateRecurringRule,
} from '@/db/repo';
import type { RecurringRule, TxType } from '@/db/types';
import { useStore } from '@/store/useStore';
import { monthKey } from '@/utils/date';
import { formatFen, yuanToFen } from '@/utils/money';

const TYPE_LABELS: Record<TxType, string> = {
  expense: '支出',
  income: '收入',
  transfer: '转账',
};

export default function RecurringScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const accounts = useStore((state) => state.accounts);
  const categories = useStore((state) => state.categories);
  const dataVersion = useStore((state) => state.dataVersion);
  const refresh = useStore((state) => state.refresh);
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [editor, setEditor] = useState<'closed' | 'new' | RecurringRule>('closed');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await syncRecurringOccurrences();
      setRules(await listRecurringRules());
      setError('');
    } catch {
      setError('周期账单加载失败，请重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, dataVersion]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const toggle = async (rule: RecurringRule) => {
    setBusyId(rule.id);
    try {
      await setRecurringRuleActive(rule.id, !rule.active);
      await refresh();
      await load();
    } catch {
      setError(rule.active ? '停用失败，请重试' : '启用失败，请重试');
    } finally {
      setBusyId(null);
    }
  };

  const remove = (rule: RecurringRule) => {
    Alert.alert(
      '删除周期账单？',
      `${rule.title} 将不再生成待确认账单，已入账的记录不受影响。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            setBusyId(rule.id);
            try {
              await deleteRecurringRule(rule.id);
              await refresh();
              await load();
            } catch {
              setError('删除失败，请重试');
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel="返回"
          onPress={goBack}
        >
          <Icon name="chevron-back" size={24} color={C.text} />
        </Pressable>
        <View style={styles.headerTitle}>
          <Text style={styles.title}>周期账单</Text>
          <Text style={styles.subtitle}>到期后由你确认入账</Text>
        </View>
        <Pressable
          style={styles.addButton}
          accessibilityRole="button"
          onPress={() => setEditor('new')}
        >
          <Text style={styles.addText}>+ 新建</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.explainCard}>
          <Text style={styles.explainTitle}>每月固定账单，不自动扣账</Text>
          <Text style={styles.explainText}>
            房租、工资、订阅等账单到达日期后会出现在首页。你确认后才写入流水，也可以跳过某个月。
          </Text>
        </View>

        {!!error && (
          <Pressable style={styles.errorBox} accessibilityRole="button" onPress={load}>
            <Text style={styles.errorText}>{error} · 点此重试</Text>
          </Pressable>
        )}

        {loading && rules.length === 0 ? (
          <ActivityIndicator color={C.primary} style={{ paddingVertical: 36 }} />
        ) : rules.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🔁</Text>
            <Text style={styles.emptyTitle}>还没有周期账单</Text>
            <Text style={styles.emptyText}>把每月重复出现的收支设成规则，记一笔会更快。</Text>
            <Pressable
              style={styles.emptyAction}
              accessibilityRole="button"
              onPress={() => setEditor('new')}
            >
              <Text style={styles.emptyActionText}>新建周期账单</Text>
            </Pressable>
          </View>
        ) : (
          rules.map((rule) => {
            const category = categories.find((item) => item.id === rule.categoryId);
            const from = accounts.find((item) => item.id === rule.accountId)?.name;
            const to = accounts.find((item) => item.id === rule.toAccountId)?.name;
            const accountText =
              rule.type === 'transfer'
                ? `${from ?? '账户'} → ${to ?? '账户'}`
                : `${TYPE_LABELS[rule.type]} · ${from ?? '账户'}`;
            return (
              <View key={rule.id} style={styles.ruleCard}>
                <Pressable
                  style={styles.ruleMain}
                  accessibilityRole="button"
                  accessibilityLabel={`编辑${rule.title}`}
                  onPress={() => setEditor(rule)}
                >
                  <View style={styles.ruleIcon}>
                    <Text style={styles.ruleEmoji}>
                      {rule.type === 'transfer' ? '🔁' : category?.icon ?? '🧾'}
                    </Text>
                  </View>
                  <View style={styles.ruleMid}>
                    <View style={styles.ruleTitleRow}>
                      <Text style={styles.ruleTitle} numberOfLines={1}>{rule.title}</Text>
                      {!rule.active && <Text style={styles.pausedBadge}>已停用</Text>}
                      {!!rule.pendingCount && rule.pendingCount > 0 && (
                        <Text style={styles.pendingBadge}>{rule.pendingCount} 待确认</Text>
                      )}
                    </View>
                    <Text style={styles.ruleMeta} numberOfLines={1}>
                      每月 {rule.dayOfMonth} 日 · {category?.name ?? accountText}
                    </Text>
                    <Text style={styles.ruleAccount} numberOfLines={1}>{accountText}</Text>
                  </View>
                  <Text style={styles.ruleAmount}>¥{formatFen(rule.amount)}</Text>
                </Pressable>
                <View style={styles.ruleActions}>
                  <Pressable
                    style={styles.secondaryAction}
                    disabled={busyId === rule.id}
                    accessibilityRole="button"
                    onPress={() => toggle(rule)}
                  >
                    <Text style={styles.secondaryActionText}>
                      {rule.active ? '暂停生成' : '继续生成'}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={styles.deleteAction}
                    disabled={busyId === rule.id}
                    accessibilityRole="button"
                    onPress={() => remove(rule)}
                  >
                    <Text style={styles.deleteActionText}>删除</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {editor !== 'closed' && (
        <RecurringEditor
          key={editor === 'new' ? 'new' : editor.id}
          value={editor === 'new' ? null : editor}
          onClose={() => setEditor('closed')}
          onSaved={async () => {
            try {
              await refresh();
            } catch {}
            await load();
            setEditor('closed');
          }}
        />
      )}
    </View>
  );
}

function RecurringEditor({
  value,
  onClose,
  onSaved,
}: {
  value: RecurringRule | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const accounts = useStore((state) => state.accounts);
  const categories = useStore((state) => state.categories);
  const [title, setTitle] = useState(value?.title ?? '');
  const [amount, setAmount] = useState(value ? String(value.amount / 100) : '');
  const [type, setType] = useState<TxType>(value?.type ?? 'expense');
  const [categoryId, setCategoryId] = useState<string | undefined>(
    value?.categoryId ??
      categories.find((item) => item.type === (value?.type ?? 'expense') && !item.parentId)?.id
  );
  const [accountId, setAccountId] = useState<string | undefined>(
    value?.accountId ?? accounts[0]?.id
  );
  const [toAccountId, setToAccountId] = useState<string | undefined>(
    value?.toAccountId ?? accounts.find((item) => item.id !== (value?.accountId ?? accounts[0]?.id))?.id
  );
  const [note, setNote] = useState(value?.note ?? '');
  const [day, setDay] = useState(String(value?.dayOfMonth ?? 1));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    const amountValue = yuanToFen(amount);
    const dayValue = Number(day);
    if (!title.trim()) return setError('请输入账单名称');
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || amountValue <= 0) {
      return setError('请输入大于 0 的有效金额');
    }
    if (!Number.isInteger(dayValue) || dayValue < 1 || dayValue > 31) {
      return setError('日期需为 1 至 31');
    }
    if (!accountId) return setError('请选择账户');
    if (type !== 'transfer' && !categoryId) return setError('请选择分类');
    if (type === 'transfer' && (!toAccountId || toAccountId === accountId)) {
      return setError('请选择不同的转入账户');
    }
    setSaving(true);
    setError('');
    const rule: RecurringRule = {
      id: value?.id ?? newId(),
      title: title.trim(),
      type,
      amount: amountValue,
      categoryId: type === 'transfer' ? null : categoryId ?? null,
      accountId,
      toAccountId: type === 'transfer' ? toAccountId ?? null : null,
      note: note.trim(),
      dayOfMonth: dayValue,
      startMonth: value?.startMonth ?? monthKey(),
      active: value?.active ?? true,
      createdAt: value?.createdAt ?? Date.now(),
    };
    try {
      if (value) await updateRecurringRule(rule);
      else await insertRecurringRule(rule);
    } catch {
      setError('保存失败，请重试');
      setSaving(false);
      return;
    }
    try {
      await syncRecurringOccurrences();
    } catch {}
    await onSaved();
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.editorScreen, { paddingTop: insets.top }]}
      >
        <View style={styles.editorHeader}>
          <Pressable style={styles.headerButton} accessibilityRole="button" onPress={onClose}>
            <Text style={styles.cancelText}>取消</Text>
          </Pressable>
          <Text style={styles.editorTitle}>{value ? '编辑周期账单' : '新建周期账单'}</Text>
          <Pressable
            style={styles.headerButton}
            disabled={saving}
            accessibilityRole="button"
            onPress={save}
          >
            {saving ? (
              <ActivityIndicator color={C.primary} />
            ) : (
              <Text style={styles.saveText}>保存</Text>
            )}
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={[styles.editorContent, { paddingBottom: insets.bottom + 28 }]}
          keyboardShouldPersistTaps="handled"
        >
          {!!error && <Text style={styles.editorError} accessibilityRole="alert">{error}</Text>}

          <Text style={styles.fieldLabel}>账单名称</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="如：房租、工资、视频会员"
            placeholderTextColor={C.text3}
            maxLength={20}
            accessibilityLabel="账单名称"
          />

          <Text style={styles.fieldLabel}>金额（元）</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            placeholderTextColor={C.text3}
            keyboardType="decimal-pad"
            accessibilityLabel="周期账单金额"
          />

          <FilterOptions
            label="类型"
            options={Object.entries(TYPE_LABELS).map(([id, name]) => ({ id, name }))}
            selected={type}
            onChange={(next) => {
              const nextType = next as TxType;
              setType(nextType);
              setCategoryId(
                nextType === 'transfer'
                  ? undefined
                  : categories.find((item) => item.type === nextType && !item.parentId)?.id
              );
            }}
          />

          {type !== 'transfer' && (
            <CategoryChips
              categories={categories.filter((item) => item.type === type)}
              selected={categoryId}
              onChange={setCategoryId}
            />
          )}

          <FilterOptions
            label={type === 'expense' ? '付款账户' : type === 'income' ? '收款账户' : '转出账户'}
            options={accounts}
            selected={accountId}
            onChange={(next) => {
              setAccountId(next);
              if (next === toAccountId) {
                setToAccountId(accounts.find((item) => item.id !== next)?.id);
              }
            }}
          />

          {type === 'transfer' && (
            <FilterOptions
              label="转入账户"
              options={accounts.filter((item) => item.id !== accountId)}
              selected={toAccountId}
              onChange={setToAccountId}
            />
          )}

          <View style={styles.inlineFields}>
            <View style={styles.inlineField}>
              <Text style={styles.fieldLabel}>每月日期</Text>
              <TextInput
                style={styles.input}
                value={day}
                onChangeText={setDay}
                keyboardType="number-pad"
                maxLength={2}
                accessibilityLabel="每月记账日期"
              />
            </View>
            <View style={styles.inlineHint}>
              <Text style={styles.fieldHint}>31 日遇到小月时自动使用月底。</Text>
            </View>
          </View>

          <Text style={styles.fieldLabel}>备注（可选）</Text>
          <TextInput
            style={styles.input}
            value={note}
            onChangeText={setNote}
            placeholder="确认后会写入账单备注"
            placeholderTextColor={C.text3}
            maxLength={50}
            accessibilityLabel="周期账单备注"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  headerButton: { minWidth: 52, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1 },
  title: { fontSize: 20, fontWeight: '800', color: C.text },
  subtitle: { fontSize: 12, color: C.text2, marginTop: 2 },
  addButton: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
  addText: { fontSize: 15, color: C.primary, fontWeight: '600' },
  content: { paddingHorizontal: 16, gap: 12 },
  explainCard: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: C.primarySoft,
    gap: 6,
  },
  explainTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  explainText: { fontSize: 13, lineHeight: 20, color: C.text2 },
  errorBox: { backgroundColor: C.expenseSoft, borderRadius: 12, padding: 12 },
  errorText: { color: C.danger, fontSize: 13 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 50, paddingHorizontal: 24 },
  emptyIcon: { fontSize: 36 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: C.text },
  emptyText: { fontSize: 13, lineHeight: 20, color: C.text2, textAlign: 'center' },
  emptyAction: {
    minHeight: 44,
    paddingHorizontal: 22,
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: C.primarySoft,
  },
  emptyActionText: { color: C.primary, fontWeight: '600' },
  ruleCard: { backgroundColor: C.card, borderRadius: 16, overflow: 'hidden' },
  ruleMain: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  ruleIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: C.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ruleEmoji: { fontSize: 21 },
  ruleMid: { flex: 1, minWidth: 0, gap: 3 },
  ruleTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  ruleTitle: { flexShrink: 1, fontSize: 16, fontWeight: '700', color: C.text },
  pausedBadge: {
    fontSize: 11,
    color: C.text2,
    backgroundColor: C.chip,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  pendingBadge: {
    fontSize: 11,
    color: C.primary,
    backgroundColor: C.primarySoft,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ruleMeta: { fontSize: 13, color: C.text2 },
  ruleAccount: { fontSize: 12, color: C.text3 },
  ruleAmount: { fontSize: 16, fontWeight: '700', color: C.text, fontVariant: ['tabular-nums'] },
  ruleActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  secondaryAction: {
    minHeight: 40,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: C.chip,
  },
  secondaryActionText: { color: C.text2, fontSize: 13 },
  deleteAction: {
    minHeight: 40,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: C.expenseSoft,
  },
  deleteActionText: { color: C.danger, fontSize: 13 },
  editorScreen: { flex: 1, backgroundColor: C.bg },
  editorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  editorTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: C.text },
  cancelText: { color: C.text2, fontSize: 15 },
  saveText: { color: C.primary, fontSize: 15, fontWeight: '700' },
  editorContent: { padding: 16, gap: 12 },
  editorError: {
    color: C.danger,
    backgroundColor: C.expenseSoft,
    borderRadius: 10,
    padding: 12,
  },
  fieldLabel: { fontSize: 13, color: C.text2, fontWeight: '600' },
  fieldHint: { fontSize: 12, lineHeight: 18, color: C.text3 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: C.text,
    backgroundColor: C.card,
  },
  inlineFields: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  inlineField: { width: 120, gap: 8 },
  inlineHint: { flex: 1, paddingBottom: 10 },
});
