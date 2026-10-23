import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
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
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { CategoryIcon } from '@/components/CategoryIcon';
import { C, CARD_SHADOW } from '@/constants/theme';
import {
  exportAll,
  importAll,
  newId,
  tryDeleteCategory,
  upsertCategory,
  type BackupData,
} from '@/db/repo';
import type { Category } from '@/db/types';
import { useStore } from '@/store/useStore';
import { formatFen, yuanToFen } from '@/utils/money';
import { EmojiPickerSheet } from '@/components/EmojiPickerSheet';
import {
  createAutoSnapshot,
  getBackupHealth,
  readAutoSnapshot,
  recordExternalBackup,
  type BackupHealth,
} from '@/utils/backup';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [managerOpen, setManagerOpen] = useState(false);
  const [backupHealth, setBackupHealth] = useState<BackupHealth | null>(null);
  const refresh = useStore((s) => s.refresh);
  const monthlyBudget = useStore((s) => s.settings.monthlyBudget);
  const [categoryEditor, setCategoryEditor] = useState<
    'closed' | { type: 'expense' | 'income' } | Category
  >('closed');

  const loadBackupHealth = useCallback(async () => {
    try {
      setBackupHealth(await getBackupHealth());
    } catch {
      setBackupHealth(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadBackupHealth();
    }, [loadBackupHealth])
  );

  /* ---------- 备份 ---------- */

  const exportJson = async () => {
    try {
      const data = await exportAll();
      const json = JSON.stringify(data, null, 2);
      const name = `jianzhang-backup-${new Date().toISOString().slice(0, 10)}.json`;
      if (Platform.OS === 'web') {
        webDownload(name, json, 'application/json');
        await recordExternalBackup();
        await loadBackupHealth();
        return;
      }
      const file = new File(Paths.cache, name);
      file.create({ overwrite: true, intermediates: true });
      file.write(json);
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json' });
      await recordExternalBackup();
      await loadBackupHealth();
    } catch (e) {
      Alert.alert('导出失败', String(e));
    }
  };

  const exportCsv = async () => {
    try {
      const data = await exportAll();
      const catName = (id: unknown) =>
        (data.categories as { id: string; name: string }[]).find((c) => c.id === id)?.name ?? '';
      const accName = (id: unknown) =>
        (data.accounts as { id: string; name: string }[]).find((a) => a.id === id)?.name ?? '';
      const typeLabel: Record<string, string> = {
        expense: '支出',
        income: '收入',
        transfer: '转账',
      };
      const tagName = new Map(
        ((data.tags ?? []) as { id: string; name: string }[]).map((tag) => [tag.id, tag.name])
      );
      const txnTagNames = new Map<string, string[]>();
      for (const rel of (data.transactionTags ?? []) as { transaction_id: string; tag_id: string }[]) {
        const name = tagName.get(rel.tag_id);
        if (!name) continue;
        txnTagNames.set(rel.transaction_id, [...(txnTagNames.get(rel.transaction_id) ?? []), name]);
      }
      const claimLabel: Record<string, string> = { pending: '待报销', done: '已报销' };
      const rows = [
        '日期,类型,金额,手续费,优惠,分类,账户,转入账户,报销,标签,备注',
        ...(data.transactions as {
          id: string; date: string; type: string; amount: number; category_id: string | null;
          account_id: string; to_account_id: string | null; note: string;
          fee?: number; discount?: number; claim_status?: string | null;
        }[]).map((t) =>
          [
            t.date,
            typeLabel[t.type] ?? t.type,
            (t.amount / 100).toFixed(2),
            ((t.fee ?? 0) / 100).toFixed(2),
            ((t.discount ?? 0) / 100).toFixed(2),
            catName(t.category_id),
            accName(t.account_id),
            accName(t.to_account_id),
            claimLabel[t.claim_status ?? ''] ?? '',
            (txnTagNames.get(t.id) ?? []).join('|'),
            (t.note ?? '').replace(/[",\n]/g, ' '),
          ].join(',')
        ),
      ];
      const csv = '\ufeff' + rows.join('\n');
      const name = `jianzhang-${new Date().toISOString().slice(0, 10)}.csv`;
      if (Platform.OS === 'web') return webDownload(name, csv, 'text/csv');
      const file = new File(Paths.cache, name);
      file.create({ overwrite: true, intermediates: true });
      file.write(csv);
      await Sharing.shareAsync(file.uri, { mimeType: 'text/csv' });
    } catch (e) {
      Alert.alert('导出失败', String(e));
    }
  };

  const restore = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('提示', '请在手机上使用该功能');
      return;
    }
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: 'application/json' });
      if (res.canceled) return;
      const file = new File(res.assets[0].uri);
      const text = await file.text();
      const data = JSON.parse(text) as BackupData;
      if (!data.accounts || !data.transactions) {
        Alert.alert('文件格式不正确', '请选择由本应用导出的备份文件');
        return;
      }
      Alert.alert('恢复备份？', '当前所有数据将被备份文件中的数据覆盖', [
        { text: '取消', style: 'cancel' },
        {
          text: '恢复',
          style: 'destructive',
          onPress: async () => {
            await importAll(data);
            await refresh();
            await createAutoSnapshot(true);
            await loadBackupHealth();
            Alert.alert('完成', '数据已恢复');
          },
        },
      ]);
    } catch {
      Alert.alert('恢复失败', '无法读取所选文件');
    }
  };

  const snapshotNow = async () => {
    try {
      await createAutoSnapshot(true);
      await loadBackupHealth();
      Alert.alert('完成', '已创建设备内安全快照');
    } catch {
      Alert.alert('快照失败', '请检查本机存储空间后重试');
    }
  };

  const restoreSnapshot = async () => {
    const data = await readAutoSnapshot();
    if (!data) {
      Alert.alert('没有可用快照', '请先创建一次安全快照');
      return;
    }
    Alert.alert('恢复最近快照？', '当前数据将被设备内快照覆盖，已入账记录也会被替换。', [
      { text: '取消', style: 'cancel' },
      {
        text: '恢复',
        style: 'destructive',
        onPress: async () => {
          try {
            await importAll(data);
            await refresh();
            await createAutoSnapshot(true);
            await loadBackupHealth();
            Alert.alert('完成', '已恢复设备内安全快照');
          } catch {
            Alert.alert('恢复失败', '快照读取成功，但写入数据库失败');
          }
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 96, gap: 12 }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>我的</Text>

      <Text style={styles.subtitle}>管理分类、预算与本机数据</Text>
      <Card title="记账设置">
        <ActionRow icon="pricetags-outline" tint={{ bg: C.primarySoft, fg: C.primary }} label="分类管理" onPress={() => setManagerOpen(true)} />
        <ActionRow icon="repeat-outline" tint={{ bg: '#EAF7F1', fg: C.income }} label="周期账单" onPress={() => router.push('/recurring')} />
        <ActionRow icon="pricetag-outline" tint={{ bg: '#FFF3E4', fg: '#B4690E' }} label="标签管理" onPress={() => router.push('/tags')} />
        <ActionRow icon="card-outline" tint={{ bg: '#F1EEFF', fg: '#6B52D6' }} label="分期管理" onPress={() => router.push('/installments')} />
        <Pressable style={styles.lineRow} accessibilityRole="button" onPress={() => router.push('/budgets')}>
          <View style={[styles.iconBadge, { backgroundColor: C.primarySoft }]}><Icon name="speedometer-outline" size={17} color={C.primary} /></View>
          <Text style={styles.lineName}>预算设置</Text>
          <Text style={styles.lineValue}>{monthlyBudget > 0 ? `¥${formatFen(monthlyBudget)}` : '未设置'}</Text>
          <Icon name="chevron-forward" size={16} color={C.text3} />
        </Pressable>
      </Card>

      {/* 备份 */}
      <Card title="备份与恢复">
        <View style={styles.healthGrid}>
          <View style={styles.healthItem}>
            <View style={styles.healthLabelRow}>
              <View style={[
                styles.healthDot,
                { backgroundColor: backupHealth?.snapshotStale === false ? C.income : C.warn },
              ]} />
              <Text style={styles.healthLabel}>设备内快照</Text>
            </View>
            <Text style={styles.healthValue}>
              {backupHealth?.hasSnapshot
                ? relativeTime(backupHealth.lastSnapshotAt)
                : '尚无可用快照'}
            </Text>
          </View>
          <View style={styles.healthItem}>
            <View style={styles.healthLabelRow}>
              <View style={[
                styles.healthDot,
                { backgroundColor: backupHealth?.exportStale === false ? C.income : C.warn },
              ]} />
              <Text style={styles.healthLabel}>导出到外部</Text>
            </View>
            <Text style={styles.healthValue}>
              {backupHealth?.lastExportAt
                ? relativeTime(backupHealth.lastExportAt)
                : '尚未导出'}
            </Text>
          </View>
        </View>
        <Text style={styles.exportHint}>
          设备内快照用于撤销误操作，卸载 App 后会丢失；换机前请导出 JSON。
        </Text>
        <ActionRow
          icon="shield-checkmark-outline"
          tint={{ bg: C.primarySoft, fg: C.primary }}
          label="立即创建安全快照"
          onPress={snapshotNow}
        />
        {!!backupHealth?.hasSnapshot && (
          <ActionRow
            icon="time-outline"
            tint={{ bg: '#F3F0FF', fg: '#6952B8' }}
            label="恢复最近快照"
            onPress={restoreSnapshot}
          />
        )}
        <ActionRow
          icon="download-outline"
          tint={{ bg: C.incomeSoft, fg: C.income }}
          label="导出备份（JSON）"
          onPress={exportJson}
        />
        <ActionRow
          icon="grid-outline"
          tint={{ bg: '#FFF3E0', fg: '#E8860C' }}
          label="导出明细（CSV）"
          onPress={exportCsv}
        />
        <ActionRow
          icon="cloud-upload-outline"
          tint={{ bg: C.expenseSoft, fg: C.expense }}
          label="恢复备份"
          onPress={restore}
          danger
        />
      </Card>

      <Text style={styles.tip}>
        数据保存在本机 Expo Go 沙盒中，卸载 Expo Go 会清空数据，请定期导出备份。
      </Text>

      <Modal visible={managerOpen} animationType="slide" onRequestClose={() => setManagerOpen(false)}>
        <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
          <View style={styles.managerHeader}>
            <Text style={styles.title}>分类管理</Text>
            <Pressable style={styles.managerClose} accessibilityRole="button" onPress={() => setManagerOpen(false)}><Text style={{ color: C.primary, fontSize: 16 }}>完成</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 14 }}>
            <View style={styles.card}>
              <View style={styles.cardHeadRow}>
                <Text style={styles.cardTitle}>我的分类</Text>
                <Pressable style={styles.managerClose} accessibilityRole="button" onPress={() => setCategoryEditor({ type: 'expense' })}><Text style={styles.cardActionText}>+ 支出</Text></Pressable>
                <Pressable style={styles.managerClose} accessibilityRole="button" onPress={() => setCategoryEditor({ type: 'income' })}><Text style={styles.cardActionText}>+ 收入</Text></Pressable>
              </View>
              <CategoryList onEdit={setCategoryEditor} />
            </View>
          </ScrollView>
          {categoryEditor !== 'closed' && <CategoryEditor
            value={'id' in categoryEditor ? categoryEditor : null}
            defaultType={'id' in categoryEditor ? undefined : categoryEditor.type}
            onClose={() => setCategoryEditor('closed')} onSaved={refresh} />}
        </View>
      </Modal>
    </ScrollView>
  );
}

function relativeTime(value: string | null): string {
  if (!value) return '时间未知';
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return '时间未知';
  const diff = Math.max(0, Date.now() - time);
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`;
  return `${Math.floor(diff / 86400000)} 天前`;
}

function webDownload(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function CategoryList({
  onEdit,
}: {
  onEdit: (c: Category) => void;
}) {
  const categories = useStore((s) => s.categories);
  const renderGroup = (type: 'expense' | 'income') => {
    const list = categories.filter((c) => c.type === type);
    const tops = list.filter((c) => !c.parentId);
    // 父分类被删掉的历史子分类不能丢，单独提上来展示
    const orphans = list.filter((c) => c.parentId && !list.some((p) => p.id === c.parentId));
    return (
      <View style={styles.catGroup}>
        <Text style={styles.catGroupTitle}>{type === 'expense' ? '支出分类' : '收入分类'}</Text>
        <View style={{ gap: 12 }}>
          {[...tops, ...orphans].map((parent) => {
            const kids = list.filter((c) => c.parentId === parent.id);
            return (
              <View key={parent.id} style={{ gap: 8 }}>
                <Pressable style={styles.catRow} onPress={() => onEdit(parent)}>
                  <CategoryIcon category={parent} size={22} />
                  <Text style={styles.catRowName} numberOfLines={1}>{parent.name}</Text>
                  {kids.length > 0 && <Text style={styles.catRowMeta}>{kids.length} 个子类</Text>}
                  <Icon name="chevron-forward" size={14} color={C.text3} />
                </Pressable>
                {kids.length > 0 && (
                  <View style={styles.catKids}>
                    {kids.map((kid) => (
                      <Pressable key={kid.id} style={styles.catKid} onPress={() => onEdit(kid)}>
                        <CategoryIcon category={kid} size={14} />
                        <Text style={styles.catKidName}>{kid.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </View>
    );
  };
  return (
    <View style={{ gap: 14 }}>
      {renderGroup('expense')}
      {renderGroup('income')}
    </View>
  );
}

function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: { label: string; onPress: () => void };
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeadRow}>
        <Text style={styles.cardTitle}>{title}</Text>
        {action && (
          <Pressable style={styles.cardAction} onPress={action.onPress}>
            <Text style={styles.cardActionText}>+ {action.label}</Text>
          </Pressable>
        )}
      </View>
      {children}
    </View>
  );
}

function ActionRow({
  icon,
  tint,
  label,
  onPress,
  danger,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  tint: { bg: string; fg: string };
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.lineRow, pressed && { opacity: 0.6 }]}
      onPress={onPress}
    >
      <View style={[styles.iconBadge, { backgroundColor: tint.bg }]}>
        <Icon name={icon} size={17} color={tint.fg} />
      </View>
      <Text style={[styles.lineName, danger && { color: C.expense }]}>{label}</Text>
      <Icon name="chevron-forward" size={16} color={C.text3} />
    </Pressable>
  );
}

/* ---------- 分类编辑 ---------- */

function CategoryEditor({
  value,
  defaultType,
  onClose,
  onSaved,
}: {
  value: Category | null;
  defaultType?: 'expense' | 'income';
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(value?.name ?? '');
  const [icon, setIcon] = useState(value?.icon ?? '🏷️');
  const [type, setType] = useState<'expense' | 'income'>(value?.type ?? defaultType ?? 'expense');
  const [budget, setBudget] = useState(
    value?.monthlyBudget != null ? (value.monthlyBudget / 100).toString() : ''
  );
  const [emojiOpen, setEmojiOpen] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      Alert.alert('提示', '请输入分类名称');
      return;
    }
    const fen = yuanToFen(budget);
    const cat: Category = {
      id: value?.id ?? newId(),
      name: name.trim(),
      icon,
      type,
      parentId: value?.parentId ?? null,
      iconImage: value?.iconImage ?? null,
      monthlyBudget: fen > 0 ? fen : null,
      sort: value?.sort ?? 9999,
    };
    await upsertCategory(cat);
    await onSaved();
    onClose();
  };

  const remove = () => {
    if (!value) return;
    Alert.alert('删除分类？', `${value.name} 将被删除`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          const ok = await tryDeleteCategory(value.id);
          if (!ok) {
            Alert.alert('无法删除', '该分类已有流水、周期账单或子分类，为保护数据不能删除');
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
        style={editorStyles.mask}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Pressable style={editorStyles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={editorStyles.title}>{value ? '编辑分类' : '添加分类'}</Text>
          <View style={editorStyles.formRow}>
            <Pressable style={editorStyles.iconBtn} onPress={() => setEmojiOpen(true)}>
              <Text style={{ fontSize: 26 }}>{icon}</Text>
            </Pressable>
            <TextInput
              style={editorStyles.inputFlex}
              value={name}
              onChangeText={setName}
              placeholder="分类名称"
              placeholderTextColor={C.text3}
              maxLength={6}
            />
            <View style={editorStyles.miniSeg}>
              {(['expense', 'income'] as const).map((t) => (
                <Pressable
                  key={t}
                  style={[editorStyles.miniSegItem, type === t && { backgroundColor: C.primary }]}
                  onPress={() => !value && setType(t)}
                  disabled={!!value}
                >
                  <Text
                    style={[
                      editorStyles.miniSegText,
                      type === t && { color: '#fff', fontWeight: '600' },
                    ]}
                  >
                    {t === 'expense' ? '支出' : '收入'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          {type === 'expense' && (
            <>
              <Text style={editorStyles.fieldLabel}>每月预算（元，可留空）</Text>
              <TextInput
                style={editorStyles.input}
                value={budget}
                onChangeText={setBudget}
                placeholder="不设预算"
                placeholderTextColor={C.text3}
                keyboardType="decimal-pad"
              />
            </>
          )}
          <View style={editorStyles.btnRow}>
            {value && (
              <Pressable style={editorStyles.deleteBtn} onPress={remove}>
                <Text style={editorStyles.deleteText}>删除</Text>
              </Pressable>
            )}
            <Pressable style={editorStyles.saveBtn} onPress={save}>
              <Text style={editorStyles.saveText}>保存</Text>
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
  subtitle: { fontSize: 14, color: C.text2, marginBottom: 10 },
  exportHint: { fontSize: 13, color: C.text2, lineHeight: 20, marginBottom: 6 },
  healthGrid: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  healthItem: {
    flex: 1,
    minWidth: 0,
    backgroundColor: C.bg,
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  healthLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  healthDot: { width: 7, height: 7, borderRadius: 4 },
  healthLabel: { fontSize: 12, color: C.text2 },
  healthValue: { fontSize: 13, lineHeight: 19, fontWeight: '600', color: C.text },
  managerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  managerClose: { minHeight: 48, paddingHorizontal: 10, justifyContent: 'center' },
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
    marginBottom: 6,
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
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    gap: 12,
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineIcon: {
    fontSize: 20,
  },
  lineName: {
    flex: 1,
    fontSize: 15,
    color: C.text,
  },
  lineValue: {
    fontSize: 15,
    fontWeight: '600',
    color: C.text2,
    fontVariant: ['tabular-nums'],
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  catRowName: { flex: 1, fontSize: 15, fontWeight: '600', color: C.text },
  catRowMeta: { fontSize: 12, color: C.text3 },
  catKids: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingLeft: 32 },
  catKid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: C.chip,
  },
  catKidName: { fontSize: 12, color: C.text2, fontWeight: '500' },
  catGroup: {
    gap: 8,
  },
  catGroupTitle: {
    fontSize: 12,
    color: C.text3,
  },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: C.chip,
    borderRadius: 14,
    paddingHorizontal: 10,
    minHeight: 44,
    maxWidth: 150,
  },
  catChipIcon: {
    fontSize: 14,
  },
  catChipName: {
    fontSize: 14,
    color: C.text2,
  },
  tip: {
    fontSize: 12,
    color: C.text3,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 18,
  },
});

const editorStyles = StyleSheet.create({
  mask: {
    flex: 1,
    backgroundColor: C.mask,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    gap: 6,
  },
  title: {
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
  miniSeg: {
    flexDirection: 'row',
    backgroundColor: C.chip,
    borderRadius: 12,
    padding: 2,
  },
  miniSegItem: {
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 10,
    justifyContent: 'center',
  },
  miniSegText: {
    fontSize: 12,
    color: C.text2,
  },
});
