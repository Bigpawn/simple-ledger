import { useRouter } from 'expo-router';
import { monthKey } from '@/utils/date';
import { useCallback, useEffect, useState } from 'react';
import {
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
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { C, CARD_SHADOW, PIE_COLORS } from '@/constants/theme';
import { DonutChart } from '@/components/Charts';
import { EmojiPickerSheet } from '@/components/EmojiPickerSheet';
import {
  accountBalances,
  insertAccount,
  newId,
  tryDeleteAccount,
  updateAccount,
} from '@/db/repo';
import type { Account, AccountBalance } from '@/db/types';
import { useStore } from '@/store/useStore';
import { formatFen, yuanToFen } from '@/utils/money';

export default function AssetsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const dataVersion = useStore((s) => s.dataVersion);
  const refresh = useStore((s) => s.refresh);
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [editor, setEditor] = useState<'closed' | 'new' | Account>('closed');

  const load = useCallback(async () => {
    setBalances(await accountBalances());
  }, []);

  useEffect(() => {
    load();
  }, [load, dataVersion]);

  const netTotal = balances.reduce((s, a) => s + a.balance, 0);
  const positives = balances.filter((a) => a.balance > 0);
  const grossTotal = positives.reduce((s, a) => s + a.balance, 0);

  const slices = positives.map((a, i) => ({
    value: a.balance,
    color: PIE_COLORS[i % PIE_COLORS.length],
  }));

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 32, gap: 14 }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>资产</Text>

      {/* 总资产卡 */}
      <LinearGradient
        colors={[C.primary, C.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Text style={styles.heroLabel}>净资产（{balances.length} 个账户）</Text>
        <Text style={styles.heroValue} adjustsFontSizeToFit numberOfLines={1}>
          ¥{formatFen(netTotal)}
        </Text>
        {balances.some((a) => a.balance < 0) && (
          <Text style={styles.heroSub}>
            含负债 ¥{formatFen(-balances.filter((a) => a.balance < 0).reduce((s, a) => s + a.balance, 0))}
          </Text>
        )}
      </LinearGradient>

      {/* 资产构成 */}
      {slices.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>资产构成</Text>
          <View style={styles.pieWrap}>
            <DonutChart
              slices={slices}
              size={160}
              stroke={24}
              centerLabel="正资产合计"
              centerValue={grossTotal}
              centerColor={C.text}
            />
          </View>
          <View style={styles.legendRow}>
            {positives.map((a, i) => {
              const pct = grossTotal > 0 ? (a.balance / grossTotal) * 100 : 0;
              return (
                <View key={a.id} style={styles.legendItem}>
                  <View
                    style={[styles.legendDot, { backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }]}
                  />
                  <Text style={styles.legendIcon}>{a.icon}</Text>
                  <Text style={styles.legendName}>{a.name}</Text>
                  <Text style={styles.legendPct}>{pct.toFixed(1)}%</Text>
                </View>
              );
            })}
            {balances.length !== positives.length && (
              <Text style={styles.legendNote}>负债账户不计入构成图，仅在净资产中扣减</Text>
            )}
          </View>
        </View>
      )}

      {/* 账户列表 */}
      <View style={styles.card}>
        <View style={styles.cardHeadRow}>
          <Text style={styles.cardTitle}>我的账户</Text>
          <Pressable style={styles.cardAction} onPress={() => setEditor('new')}>
            <Text style={styles.cardActionText}>+ 添加</Text>
          </Pressable>
        </View>
        {balances.map((a) => (
          <View key={a.id} style={styles.accountRow}>
          <Pressable style={styles.accountLink} accessibilityRole="button" accessibilityLabel={`查看${a.name}本月明细`}
            onPress={() => router.push({ pathname: '/', params: { filterAccount: a.id, filterMonth: monthKey(), filterRequest: String(Date.now()) } })}>
            <View style={styles.accountIconWrap}>
              <Text style={styles.accountIcon}>{a.icon}</Text>
            </View>
            <View style={styles.accountMid}>
              <Text style={styles.accountName} numberOfLines={1}>{a.name}</Text>
              <Text style={styles.accountInitial}>
                期初 ¥{formatFen(a.initialBalance)}
              </Text>
            </View>
            <Text
              style={[styles.accountBalance, { color: a.balance < 0 ? C.expense : C.text }]}
            >
              ¥{formatFen(a.balance)}
            </Text>
            <Icon name="chevron-forward" size={16} color={C.text3} />
          </Pressable>
          <Pressable style={styles.editAccount} accessibilityRole="button" accessibilityLabel={`编辑${a.name}账户`} onPress={() => setEditor(a)}><Text style={{ color: C.primary, fontSize: 13 }}>编辑</Text></Pressable>
          </View>
        ))}
        <Text style={styles.tip}>余额 = 期初 + 收入 − 支出 + 转入 − 转出</Text>
      </View>

      {editor !== 'closed' && (
        <AccountEditor
          value={editor === 'new' ? null : editor}
          onClose={() => setEditor('closed')}
          onSaved={async () => {
            await refresh();
            await load();
          }}
        />
      )}
    </ScrollView>
  );
}

/* ---------- 账户编辑弹层 ---------- */

function AccountEditor({
  value,
  onClose,
  onSaved,
}: {
  value: Account | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(value?.name ?? '');
  const [icon, setIcon] = useState(value?.icon ?? '💰');
  const [initial, setInitial] = useState(value ? (value.initialBalance / 100).toString() : '');
  const [emojiOpen, setEmojiOpen] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      Alert.alert('提示', '请输入账户名称');
      return;
    }
    const acc: Account = {
      id: value?.id ?? newId(),
      name: name.trim(),
      icon,
      initialBalance: yuanToFen(initial),
      sort: value?.sort ?? 9999,
    };
    if (value) {
      await updateAccount(acc);
    } else {
      await insertAccount(acc);
    }
    await onSaved();
    onClose();
  };

  const remove = () => {
    if (!value) return;
    Alert.alert('删除账户？', `${value.name} 将被删除`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          const ok = await tryDeleteAccount(value.id);
          if (!ok) {
            Alert.alert('无法删除', '该账户已有流水或周期账单，为保护数据不能删除');
            return;
          }
          await onSaved();
          onClose();
        },
      },
    ]);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.editorMask}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Pressable style={styles.editorSheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.editorTitle}>{value ? '编辑账户' : '添加账户'}</Text>
          <View style={styles.formRow}>
            <Pressable style={styles.iconBtn} onPress={() => setEmojiOpen(true)}>
              <Text style={{ fontSize: 26 }}>{icon}</Text>
            </Pressable>
            <TextInput
              style={styles.inputFlex}
              value={name}
              onChangeText={setName}
              placeholder="账户名称"
              placeholderTextColor={C.text3}
              maxLength={10}
            />
          </View>
          <Text style={styles.fieldLabel}>期初余额（元）</Text>
          <TextInput
            style={styles.input}
            value={initial}
            onChangeText={setInitial}
            placeholder="0"
            placeholderTextColor={C.text3}
            keyboardType="decimal-pad"
          />
          <View style={styles.btnRow}>
            {value && (
              <Pressable style={styles.deleteBtn} onPress={remove}>
                <Text style={styles.deleteText}>删除</Text>
              </Pressable>
            )}
            <Pressable style={styles.saveBtn} onPress={save}>
              <Text style={styles.saveText}>保存</Text>
            </Pressable>
          </View>
          <EmojiPickerSheet
            visible={emojiOpen}
            onClose={() => setEmojiOpen(false)}
            onPick={setIcon}
          />
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  accountLink: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56 },
  editAccount: { minHeight: 44, paddingHorizontal: 4, justifyContent: 'center' },
  screen: {
    flex: 1,
    backgroundColor: C.bg,
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: C.text,
    marginBottom: 2,
  },
  hero: {
    borderRadius: 20,
    padding: 20,
    gap: 6,
  },
  heroLabel: {
    fontSize: 12,
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  heroValue: {
    fontSize: 34,
    fontWeight: '800',
    color: '#fff',
    fontVariant: ['tabular-nums'],
  },
  heroSub: {
    fontSize: 12,
    color: '#FFFFFF',
  },
  card: {
    ...CARD_SHADOW,
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
  },
  cardHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text,
  },
  cardAction: {
    paddingVertical: 4,
    paddingLeft: 12,
  },
  cardActionText: {
    fontSize: 13,
    color: C.primary,
    fontWeight: '600',
  },
  pieWrap: {
    alignItems: 'center',
    marginVertical: 10,
  },
  legendRow: {
    gap: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendIcon: {
    fontSize: 15,
  },
  legendName: {
    flex: 1,
    fontSize: 13,
    color: C.text,
  },
  legendPct: {
    fontSize: 12,
    color: C.text2,
    fontVariant: ['tabular-nums'],
  },
  legendNote: {
    fontSize: 12,
    color: C.text3,
    marginTop: 2,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  accountIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountIcon: {
    fontSize: 20,
  },
  accountMid: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  accountName: {
    fontSize: 15,
    color: C.text,
    fontWeight: '500',
  },
  accountInitial: {
    fontSize: 12,
    color: C.text3,
  },
  accountBalance: {
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  tip: {
    fontSize: 12,
    color: C.text3,
    marginTop: 8,
  },
  editorMask: {
    flex: 1,
    backgroundColor: C.mask,
    justifyContent: 'flex-end',
  },
  editorSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    gap: 6,
  },
  editorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
    textAlign: 'center',
    marginBottom: 10,
  },
  formRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBtn: {
    width: 54,
    height: 54,
    borderRadius: 14,
    backgroundColor: C.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputFlex: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    height: 54,
    paddingHorizontal: 14,
    fontSize: 16,
    color: C.text,
  },
  input: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    height: 46,
    paddingHorizontal: 14,
    fontSize: 16,
    color: C.text,
  },
  fieldLabel: {
    fontSize: 13,
    color: C.text2,
    marginTop: 8,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  deleteBtn: {
    height: 46,
    paddingHorizontal: 24,
    borderRadius: 23,
    backgroundColor: C.expenseSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: {
    color: C.expense,
    fontSize: 15,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
