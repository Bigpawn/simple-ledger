import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import {
  Alert,
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { usePreventRemove, type NavigationAction } from 'expo-router/react-navigation';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { CategoryIcon } from '@/components/CategoryIcon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '@/constants/theme';
import {
  categoryStats,
  deleteTxn,
  getTxn,
  createRefund,
  insertTxn,
  listCommonBills,
  listTags,
  newId,
  setClaimStatus,
  setTxnTags,
  tagsForTxn,
  updateTxn,
} from '@/db/repo';
import type { CommonBill } from '@/utils/commonBills';
import type { ClaimStatus, Tag, Txn, TxType } from '@/db/types';
import { useStore } from '@/store/useStore';
import { formatFen, keypadAppend, keypadToFen, yuanToFen } from '@/utils/money';
import { dateKey, dayLabel, monthKey } from '@/utils/date';
import { CalendarSheet } from '@/components/CalendarSheet';
import { consumeQuickLink, hasQuickParams, sanitizeToken } from '@/utils/quicklink';

const TYPES: { key: TxType; label: string; color: string }[] = [
  { key: 'expense', label: '支出', color: C.expense },
  { key: 'income', label: '收入', color: C.income },
  { key: 'transfer', label: '转账', color: C.transfer },
];

/** 直接通过 URL 进入本页时栈里没有历史，退回首页 */
function exitForm(router: ReturnType<typeof useRouter>) {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/');
  }
}

export default function TransactionScreen() {
  const params = useLocalSearchParams<{
    id?: string;
    amount?: string;
    type?: string;
    note?: string;
    category?: string;
    save?: string;
    form?: string;
    t?: string;
  }>();
  const id = params.id;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const accounts = useStore((s) => s.accounts);
  const categories = useStore((s) => s.categories);
  const settings = useStore((s) => s.settings);
  const refresh = useStore((s) => s.refresh);

  const [editing, setEditing] = useState<Txn | null>(null);
  const [loaded, setLoaded] = useState(!id);
  const [type, setType] = useState<TxType>('expense');
  const [amountInput, setAmountInput] = useState('0');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [toAccountId, setToAccountId] = useState<string | null>(null);
  const [date, setDate] = useState(dateKey());
  const [note, setNote] = useState('');
  const [noteEditing, setNoteEditing] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);
  const autoSaveFired = useRef(false);
  const saveLock = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [savedExit, setSavedExit] = useState(false);
  const [pendingExit, setPendingExit] = useState<{ action: NavigationAction; repeat: () => void } | null>(null);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [frequentIds, setFrequentIds] = useState<string[]>([]);
  const [commonBills, setCommonBills] = useState<CommonBill[]>([]);
  const [continuedBaseline, setContinuedBaseline] = useState<{ type: TxType; categoryId: string | null; accountId: string | null; toAccountId: string | null; date: string } | null>(null);
  const [expandedParentId, setExpandedParentId] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [feeInput, setFeeInput] = useState('');
  const [discountInput, setDiscountInput] = useState('');
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [claim, setClaim] = useState<ClaimStatus | null>(null);
  const [claimAccount, setClaimAccount] = useState<string | null>(null);
  const dataVersion = useStore((s) => s.dataVersion);
  useEffect(() => {
    let active = true;
    setFrequentIds([]);
    if (type !== 'transfer') void categoryStats(monthKey(), type).then((items) => {
      if (active) setFrequentIds(items.sort((a, b) => b.count - a.count).map((c) => c.categoryId));
    }).catch(() => {});
    return () => { active = false; };
  }, [type, dataVersion]);

  useEffect(() => {
    let active = true;
    if (id) {
      setCommonBills([]);
      return () => { active = false; };
    }
    const since = dateKey(new Date(Date.now() - 180 * 24 * 60 * 60 * 1000));
    void listCommonBills(since, 4).then((items) => {
      if (active) setCommonBills(items);
    }).catch(() => {
      if (active) setCommonBills([]);
    });
    return () => { active = false; };
  }, [id, dataVersion]);

  // 深链消费：区分「用户刚点快捷指令」和「Expo Go 重放旧链接」
  const tToken = sanitizeToken(params.t);
  const [linkState, setLinkState] = useState<'checking' | 'ok' | 'stale'>(() => {
    if (hasQuickParams(params)) return 'checking';
    return 'ok';
  });

  useEffect(() => {
    if (linkState !== 'checking') return;
    let alive = true;
    consumeQuickLink(params).then((fresh) => {
      if (alive) setLinkState(fresh ? 'ok' : 'stale');
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkState]);

  // 过期链接（重放）：直接回首页
  useEffect(() => {
    if (linkState === 'stale') exitForm(router);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkState]);

  // 快捷指令深链：预填参数（金额抹掉"元/块"等杂字符，只留数字和小数点）
  useEffect(() => {
    if (linkState !== 'ok') return;
    if (params.amount) {
      const clean = String(params.amount).replace(/[^\d.]/g, '').slice(0, 12);
      if (clean) setAmountInput(clean);
    }
    if (params.note) setNote(String(params.note).slice(0, 50));
    if (params.type === 'income' || params.type === 'expense' || params.type === 'transfer') {
      setType(params.type);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkState]);

  // 深链指定的分类名
  useEffect(() => {
    if (linkState !== 'ok') return;
    if (!params.category || categories.length === 0) return;
    const match = categories.find(
      (c) => c.name === params.category && (params.type ? c.type === params.type : c.type === type)
    );
    if (match) setCategoryId(match.id);
  }, [linkState, params.category, params.type, categories, type]);

  useEffect(() => {
    if (!id) return;
    getTxn(id).then((txn) => {
      if (txn) {
        setEditing(txn);
        setType(txn.type);
        setAmountInput((txn.amount / 100).toString());
        setCategoryId(txn.categoryId);
        setAccountId(txn.accountId);
        setToAccountId(txn.toAccountId);
        setDate(txn.date);
        setNote(txn.note);
        setFeeInput(txn.fee ? String(txn.fee / 100) : '');
        setDiscountInput(txn.discount ? String(txn.discount / 100) : '');
        setClaim(txn.claimStatus ?? null);
        setClaimAccount(txn.claimAccountId ?? null);
        void tagsForTxn(txn.id).then((tags) => setTagIds(tags.map((t) => t.id))).catch(() => {});
      }
      else setError('这笔记录已不存在，请关闭后重新选择');
      setLoaded(true);
    }).catch(() => {
      setError('记录加载失败，请关闭后重试');
      setLoaded(true);
    });
  }, [id]);

  useEffect(() => {
    void listTags().then(setAllTags).catch(() => {});
  }, []);

  const typeColor = TYPES.find((t) => t.key === type)!.color;
  const visibleCategories = useMemo(
    () => categories.filter((c) => c.type === type),
    [categories, type]
  );
  const topCategories = useMemo(
    () => visibleCategories.filter((c) => !c.parentId),
    [visibleCategories]
  );
  const childrenOf = useMemo(() => {
    const map = new Map<string, typeof visibleCategories>();
    for (const c of visibleCategories) {
      if (!c.parentId) continue;
      const list = map.get(c.parentId) ?? [];
      list.push(c);
      map.set(c.parentId, list);
    }
    return map;
  }, [visibleCategories]);
  const expandedChildren = expandedParentId ? childrenOf.get(expandedParentId) ?? [] : [];

  // 默认选中：第一个分类 / 默认账户
  useEffect(() => {
    if (type !== 'transfer' && !categoryId && topCategories.length > 0) {
      setCategoryId(topCategories[0].id);
    }
  }, [type, categoryId, topCategories]);

  useEffect(() => {
    if (!accountId && accounts.length > 0) {
      const def = accounts.find((a) => a.id === settings.defaultAccountId);
      setAccountId((def ?? accounts[0]).id);
    }
  }, [accounts, accountId, settings.defaultAccountId]);

  // 转账默认对方账户：始终与主账户不同
  useEffect(() => {
    if (accounts.length > 1 && (!toAccountId || toAccountId === accountId)) {
      setToAccountId(accounts.find((a) => a.id !== accountId)?.id ?? null);
    }
  }, [accounts, accountId, toAccountId]);

  const switchType = (t: TxType) => {
    setType(t);
    setShowAllCategories(false);
    if (t !== 'transfer') {
      setCategoryId(categories.find((c) => c.type === t && !c.parentId)?.id ?? null);
      setExpandedParentId(null);
    }
  };

  const amountFen = keypadToFen(amountInput);

  const defaultAccount = accounts.find((a) => a.id === settings.defaultAccountId) ?? accounts[0];
  const baseline = editing ?? continuedBaseline ?? {
    type: 'expense', categoryId: categories.find((c) => c.type === 'expense' && !c.parentId)?.id ?? null,
    accountId: defaultAccount?.id ?? null, toAccountId: null, date: dateKey(),
  };
  const dirty = loaded && !savedBanner && (
    (editing ? amountFen !== editing.amount : amountInput !== '0') || note !== (editing?.note ?? '') ||
    type !== baseline.type || (type !== 'transfer' && categoryId !== baseline.categoryId) ||
    accountId !== baseline.accountId || (type === 'transfer' && toAccountId !== baseline.toAccountId) || date !== baseline.date
  );

  usePreventRemove(!!dirty && !savedExit, ({ data, repeat }) => {
    if (!saveLock.current) setPendingExit({ action: data.action, repeat });
  });

  useEffect(() => {
    if (savedExit) exitForm(router);
  }, [savedExit, router]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !dirty || savedExit) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, savedExit]);

  const validate = (): string | null => {
    if (amountFen <= 0) return '请输入金额';
    if (!accountId) return '请选择账户';
    if (type === 'transfer') {
      if (!toAccountId) return '请选择转入账户';
      if (toAccountId === accountId) return '转入账户不能与转出账户相同';
    } else if (!categoryId) {
      return '请选择分类';
    }
    return null;
  };

  /** 写入和刷新分开处理：已写入的账单不能因刷新失败而再次提交。 */
  const save = async (again = false, automatic = false) => {
    if (saveLock.current || (id && !editing)) return;
    const err = validate();
    if (err) { setError(err); return; }
    saveLock.current = true;
    setSaving(true);
    setError('');
    setFeedback('');
    const txn: Txn = {
      id: editing?.id ?? newId(), type, amount: amountFen,
      categoryId: type === 'transfer' ? null : categoryId,
      accountId: accountId!, toAccountId: type === 'transfer' ? toAccountId : null,
      date, note, createdAt: editing?.createdAt ?? Date.now(),
      fee: yuanToFen(feeInput),
      discount: yuanToFen(discountInput),
      claimStatus: claim,
      claimAccountId: claim === 'done' ? claimAccount : null,
      claimTxnId: editing?.claimTxnId ?? null,
      refundOf: editing?.refundOf ?? null,
    };
    try {
      if (editing) await updateTxn(txn);
      else await insertTxn(txn);
      await setTxnTags(txn.id, tagIds);
    } catch {
      setError('保存失败，输入已保留，请重试');
      saveLock.current = false;
      setSaving(false);
      return;
    }
    let refreshFailed = false;
    try { await refresh(); } catch {
      refreshFailed = true;
      useStore.setState((state) => ({ dataVersion: state.dataVersion + 1 }));
    }
    const label = type === 'transfer'
      ? `${accounts.find((a) => a.id === accountId)?.name ?? ''} → ${accounts.find((a) => a.id === toAccountId)?.name ?? ''}`
      : categories.find((c) => c.id === categoryId)?.name ?? '账单';
    const message = `已保存 · ${label} ¥${formatFen(amountFen)}`;
    if (automatic) {
      setSavedBanner(`${label} · ¥${formatFen(amountFen)}`);
      if (refreshFailed) setError('账单已保存，列表刷新失败，请重新打开应用查看');
    } else if (again && !editing) {
      setAmountInput('0');
      setNote('');
      setContinuedBaseline({ type, categoryId, accountId, toAccountId, date });
      setFeedback(refreshFailed ? `${message}，列表刷新失败，请重新打开应用查看` : message);
    } else {
      useStore.setState({ notice: refreshFailed ? `${message}，请重新打开应用刷新列表` : message });
      setSavedExit(true);
    }
    setSaving(false);
  };

  useEffect(() => {
    if (!saving && !savedExit && !savedBanner) saveLock.current = false;
  }, [saving, savedExit, savedBanner, amountInput]);

  // 自动记账与手动保存共用锁和失败处理，失败后可在表单中重试。
  useEffect(() => {
    if (linkState !== 'ok' || !tToken || params.save !== '1' || id || autoSaveFired.current || !loaded) return;
    if (amountFen <= 0 || !accountId || (type === 'transfer' ? !toAccountId || toAccountId === accountId : !categoryId)) return;
    autoSaveFired.current = true;
    void save(false, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkState, tToken, params.save, id, loaded, amountFen, accountId, toAccountId, categoryId, type]);

  const remove = () => {
    if (!editing) return;
    Alert.alert('删除这笔记录？', '删除后无法恢复', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await deleteTxn(editing.id);
          await refresh();
          setSavedExit(true);
        },
      },
    ]);
  };

  const tapKey = (ch: string) => setAmountInput((s) => keypadAppend(s, ch));
  const applyCommonBill = (bill: CommonBill) => {
    setType(bill.type);
    setCategoryId(bill.categoryId);
    setAccountId(bill.accountId);
    setToAccountId(bill.toAccountId);
    setAmountInput((bill.amount / 100).toFixed(2).replace(/\.00$/, ''));
    setNote(bill.note);
    setDate(dateKey());
    setShowAllCategories(false);
    setError('');
  };

  const toggleTag = (id: string) =>
    setTagIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  const changeClaim = async (next: ClaimStatus | null) => {
    if (!editing) return;
    const target = next === 'done' ? claimAccount ?? accountId : null;
    if (next === 'done' && !target) {
      setError('请先选择报销入账账户');
      return;
    }
    try {
      await setClaimStatus(editing.id, next, target);
      setClaim(next);
      setClaimAccount(target);
      setFeedback(
        next === 'done' ? '已标记已报销，并生成一笔收入' : next === 'pending' ? '已标记待报销' : '已取消报销标记'
      );
      await refresh();
    } catch {
      setError('报销状态更新失败，请重试');
    }
  };

  const applyClaimAccount = async (account: string) => {
    if (!editing) return;
    try {
      await setClaimStatus(editing.id, 'done', account);
      setClaim('done');
      setClaimAccount(account);
      await refresh();
    } catch {
      setError('报销入账失败，请重试');
    }
  };

  const refund = async () => {
    if (!editing || !accountId) return;
    try {
      await createRefund(editing.id, editing.amount, accountId);
      setFeedback('已生成退款收入，可在账单列表查看');
      await refresh();
    } catch {
      setError('退款失败，请重试');
    }
  };

  if (!loaded) return null;

  const dateChipText = date === dateKey() ? '今天' : dayLabel(date);
  const selectedCategory = visibleCategories.find((c) => c.id === categoryId);
  useEffect(() => {
    if (!selectedCategory?.parentId) return;
    setExpandedParentId((current) => current ?? selectedCategory.parentId);
  }, [selectedCategory]);
  const frequentParentIds = [...new Set(frequentIds.map((key) => visibleCategories.find((c) => c.id === key)?.parentId ?? key))];
  const orderedCategories = [...frequentParentIds.map((key) => topCategories.find((c) => c.id === key)).filter((c): c is NonNullable<typeof c> => !!c), ...topCategories.filter((c) => !frequentParentIds.includes(c.id))];
  const compactCategories = orderedCategories.slice(0, 8);
  // 选中的可能是二级分类，常用行里要保证它的一级分类可见
  const selectedTop = selectedCategory?.parentId
    ? topCategories.find((c) => c.id === selectedCategory.parentId)
    : selectedCategory;
  if (selectedTop && !compactCategories.some((c) => c.id === selectedTop.id)) compactCategories[7] = selectedTop;
  const displayedCategories = showAllCategories ? topCategories : compactCategories;

  // 两种进入方式顶部间距不同：
  // - 从首页以卡片弹层进入（有下层页面）：弹层自带顶部偏移，用小间距，否则留白过大
  // - 冷启动深链直达（无下层页面，全屏呈现）：必须避让状态栏，否则叉号被状态栏挡住点不了
  const fromSheet = router.canGoBack();

  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop:
            Platform.OS === 'ios' ? (fromSheet ? 12 : insets.top) : insets.top,
        },
      ]}
    >
      <ConfirmSheet visible={!!pendingExit} title="放弃这次修改？" message="当前输入还没有保存，退出后需要重新填写。"
        onCancel={() => setPendingExit(null)} onConfirm={() => {
          const exit = pendingExit;
          setPendingExit(null);
          exit?.repeat();
        }} />
      {/* 顶部：关闭 / 类型切换 / 删除 */}
      <View style={styles.header} pointerEvents={saving ? 'none' : 'auto'}>
        <Pressable style={styles.closeButton} disabled={saving} onPress={() => exitForm(router)} accessibilityRole="button" accessibilityLabel="关闭">
          <Icon name="close" size={26} color={C.text2} />
        </Pressable>
        <View style={styles.seg}>
          {TYPES.map((t) => (
            <Pressable
              key={t.key}
              accessibilityRole="button"
              accessibilityState={{ selected: type === t.key }}
              style={[styles.segItem, type === t.key && { backgroundColor: t.color }]}
              onPress={() => switchType(t.key)}
            >
              <Text style={[styles.segText, type === t.key && styles.segTextActive]}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {editing ? (
          <Pressable hitSlop={8} onPress={remove} accessibilityLabel="删除">
            <Icon name="trash-outline" size={22} color={C.expense} />
          </Pressable>
        ) : (
          <View style={{ width: 26 }} />
        )}
      </View>

      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!!feedback && <Text accessibilityLiveRegion="polite" style={styles.feedback}>{feedback}</Text>}
      <ScrollView
        style={styles.body}
        pointerEvents={saving ? 'none' : 'auto'}
        contentContainerStyle={{ paddingBottom: 96 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* 金额展示 */}
        <View style={styles.amountRow}>
          <Text style={[styles.currency, { color: typeColor }]}>¥</Text>
          <Text style={[styles.amount, { color: typeColor }]} numberOfLines={1} adjustsFontSizeToFit>
            {amountInput}
          </Text>
        </View>

        {/* 属性 chips：日期 / 备注 */}
        <View style={styles.chipRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="选择日期" style={styles.chip} onPress={() => setCalendarOpen(true)}>
            <Icon name="calendar-outline" size={14} color={C.text2} />
            <Text style={styles.chipText}>{dateChipText}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="编辑备注" style={styles.chip} onPress={() => setNoteEditing(true)}>
            <Icon name="create-outline" size={14} color={C.text2} />
            <Text style={styles.chipText} numberOfLines={1}>
              {note || '备注'}
            </Text>
          </Pressable>
        </View>

        {!editing && commonBills.length > 0 && (
          <View style={styles.commonSection}>
            <View style={styles.commonHeader}>
              <Text style={styles.commonTitle}>常用账单</Text>
              <Text style={styles.commonHint}>点按即可填好</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.commonList}
            >
              {commonBills.map((bill) => {
                const category = categories.find((item) => item.id === bill.categoryId);
                const from = accounts.find((item) => item.id === bill.accountId)?.name;
                const to = accounts.find((item) => item.id === bill.toAccountId)?.name;
                const title =
                  bill.note ||
                  (bill.type === 'transfer'
                    ? `${from ?? '账户'} → ${to ?? '账户'}`
                    : category?.name ?? '未分类');
                return (
                  <Pressable
                    key={bill.key}
                    style={styles.commonBill}
                    accessibilityRole="button"
                    accessibilityLabel={`常用账单：${title}，${formatFen(bill.amount)}元`}
                    onPress={() => applyCommonBill(bill)}
                  >
                    <View style={styles.commonBillTop}>
                      <View style={styles.commonBillIcon}>
                        <Text style={styles.commonBillEmoji}>
                          {bill.type === 'transfer' ? '🔁' : category?.icon ?? '🧾'}
                        </Text>
                      </View>
                      <Text style={styles.commonBillName} numberOfLines={1}>{title}</Text>
                    </View>
                    <Text style={styles.commonBillAmount}>
                      ¥{formatFen(bill.amount)} · {bill.count} 次
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {type === 'transfer' ? (
          <View style={styles.transferBox}>
            <View style={styles.transferRow}>
              <Text style={[styles.transferLabel, { color: C.transfer, fontWeight: '700' }]}>从</Text>
              <AccountChips
                accounts={accounts}
                selectedId={accountId}
                onSelect={setAccountId}
              />
            </View>
            <View style={styles.transferArrowRow}>
              <View style={styles.transferArrowLine} />
              <View style={styles.transferArrowBadge}>
                <Icon name="arrow-down" size={13} color={C.transfer} />
              </View>
              <View style={styles.transferArrowLine} />
            </View>
            <View style={styles.transferRow}>
              <Text style={[styles.transferLabel, { color: C.transfer, fontWeight: '700' }]}>到</Text>
              <AccountChips
                accounts={accounts}
                selectedId={toAccountId}
                onSelect={setToAccountId}
              />
            </View>
            <Text style={styles.transferHint}>
              转账仅在两账户间移动资金，不计入收支统计
            </Text>
          </View>
        ) : (
          <>
            {/* 支出/收入的付款账户 */}
            <View style={styles.accountRow}>
              <Text style={styles.transferLabel}>{type === 'expense' ? '付款' : '收款'}</Text>
              <AccountChips
                accounts={accounts}
                selectedId={accountId}
                onSelect={setAccountId}
              />
            </View>
            <View style={styles.categoryHeader}>
              <Text style={styles.categoryTitle}>{showAllCategories ? '全部分类' : '常用分类'}</Text>
              {topCategories.length > 8 && <Pressable accessibilityRole="button" style={styles.categoryToggle} onPress={() => setShowAllCategories((v) => !v)}>
                <Text style={{ color: C.primary, fontSize: 14 }}>{showAllCategories ? '收起分类' : '全部分类'}</Text>
              </Pressable>}
            </View>
            <View style={styles.grid}>
            {displayedCategories.map((cat) => {
              const selected = cat.id === categoryId;
              return (
                <Pressable
                  key={cat.id}
                  style={styles.gridItem}
                  accessibilityRole="button"
                  accessibilityLabel={cat.name}
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setCategoryId(cat.id);
                    const kids = childrenOf.get(cat.id);
                    if (kids?.length) {
                      setExpandedParentId((current) => (current === cat.id ? null : cat.id));
                    } else {
                      setExpandedParentId(null);
                    }
                  }}
                >
                  <View
                    style={[
                      styles.gridIcon,
                      selected && { backgroundColor: typeColor + '1A', borderColor: typeColor },
                    ]}
                  >
                    <CategoryIcon category={cat} size={24} />
                    {selected && <View style={[styles.selectedBadge, { backgroundColor: typeColor }]}><Icon name="checkmark" size={10} color="#fff" /></View>}
                  </View>
                  <Text
                    style={[styles.gridText, selected && { color: typeColor, fontWeight: '600' }]}
                    numberOfLines={1}
                  >
                    {cat.name}
                  </Text>
                </Pressable>
              );
            })}
            </View>
            {expandedChildren.length > 0 && (
              <View style={styles.subGrid}>
                <Pressable
                  style={[styles.subChip, expandedParentId === categoryId && { borderColor: typeColor, backgroundColor: typeColor + '14' }]}
                  accessibilityRole="button"
                  accessibilityLabel="全部子分类"
                  onPress={() => setCategoryId(expandedParentId)}
                >
                  <Text style={[styles.subChipText, expandedParentId === categoryId && { color: typeColor }]}>全部</Text>
                </Pressable>
                {expandedChildren.map((child) => {
                  const selected = child.id === categoryId;
                  return (
                    <Pressable
                      key={child.id}
                      style={[styles.subChip, selected && { borderColor: typeColor, backgroundColor: typeColor + '14' }]}
                      accessibilityRole="button"
                      accessibilityLabel={child.name}
                      accessibilityState={{ selected }}
                      onPress={() => setCategoryId(child.id)}
                    >
                      <CategoryIcon category={child} size={18} />
                      <Text style={[styles.subChipText, selected && { color: typeColor }]}>{child.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        )}

        <View style={styles.moreSection}>
          <Pressable
            style={styles.moreHeader}
            accessibilityRole="button"
            accessibilityState={{ expanded: moreOpen }}
            onPress={() => setMoreOpen((value) => !value)}
          >
            <Text style={styles.moreTitle}>更多</Text>
            <Text style={styles.moreHint} numberOfLines={1}>
              {[
                yuanToFen(feeInput) > 0 && `手续费 ¥${formatFen(yuanToFen(feeInput))}`,
                yuanToFen(discountInput) > 0 && `优惠 ¥${formatFen(yuanToFen(discountInput))}`,
                tagIds.length > 0 && `${tagIds.length} 个标签`,
                claim === 'pending' && '待报销',
                claim === 'done' && '已报销',
              ]
                .filter(Boolean)
                .join(' · ') || '手续费 / 标签 / 报销'}
            </Text>
            <Icon name={moreOpen ? 'chevron-up' : 'chevron-down'} size={16} color={C.text2} />
          </Pressable>
          {moreOpen && (
            <View style={{ gap: 12, paddingTop: 10 }}>
              <View style={styles.moreRow}>
                <Text style={styles.moreLabel}>手续费</Text>
                <TextInput
                  style={styles.moreInput}
                  value={feeInput}
                  onChangeText={setFeeInput}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={C.text3}
                />
                <Text style={styles.moreLabel}>优惠</Text>
                <TextInput
                  style={styles.moreInput}
                  value={discountInput}
                  onChangeText={setDiscountInput}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={C.text3}
                />
              </View>
              <View style={{ gap: 6 }}>
                <Text style={styles.moreLabel}>标签</Text>
                {allTags.length === 0 ? (
                  <Text style={styles.moreEmpty}>还没有标签，可在「我的 → 标签管理」里添加</Text>
                ) : (
                  <View style={styles.tagRow}>
                    {allTags.map((tag) => {
                      const active = tagIds.includes(tag.id);
                      return (
                        <Pressable
                          key={tag.id}
                          accessibilityRole="button"
                          accessibilityLabel={`标签 ${tag.name}`}
                          accessibilityState={{ selected: active }}
                          onPress={() => toggleTag(tag.id)}
                          style={[styles.tagChip, active && { borderColor: C.primary, backgroundColor: C.primarySoft }]}
                        >
                          <Text style={[styles.tagText, active && { color: C.primary }]}>{tag.name}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
              {type === 'expense' && (
                <View style={{ gap: 6 }}>
                  <Text style={styles.moreLabel}>报销</Text>
                  {editing ? (
                    <>
                      <View style={styles.tagRow}>
                        {([[null, '不报销'], ['pending', '待报销'], ['done', '已报销']] as [ClaimStatus | null, string][]).map(
                          ([value, label]) => {
                            const active = claim === value;
                            return (
                              <Pressable
                                key={label}
                                accessibilityRole="button"
                                accessibilityState={{ selected: active }}
                                onPress={() => void changeClaim(value)}
                                style={[styles.tagChip, active && { borderColor: C.primary, backgroundColor: C.primarySoft }]}
                              >
                                <Text style={[styles.tagText, active && { color: C.primary }]}>{label}</Text>
                              </Pressable>
                            );
                          }
                        )}
                      </View>
                      {claim === 'done' && (
                        <View style={styles.tagRow}>
                          {accounts.map((account) => {
                            const active = claimAccount === account.id;
                            return (
                              <Pressable
                                key={account.id}
                                accessibilityRole="button"
                                accessibilityLabel={`报销到${account.name}`}
                                accessibilityState={{ selected: active }}
                                onPress={() => void applyClaimAccount(account.id)}
                                style={[styles.tagChip, active && { borderColor: C.primary, backgroundColor: C.primarySoft }]}
                              >
                                <Text style={[styles.tagText, active && { color: C.primary }]}>{account.name}</Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      )}
                      {!editing.refundOf && (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="全额退款到当前账户"
                          style={styles.refundButton}
                          onPress={() => void refund()}
                        >
                          <Icon name="return-down-back-outline" size={14} color={C.income} />
                          <Text style={{ color: C.income, fontSize: 13 }}>全额退款到当前账户</Text>
                        </Pressable>
                      )}
                    </>
                  ) : (
                    <Text style={styles.moreEmpty}>保存后可标记报销或退款</Text>
                  )}
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* 数字键盘 */}
      <View style={[styles.keypad, { paddingBottom: Math.max(8, insets.bottom), opacity: saving ? 0.65 : 1 }]}>
        <View style={styles.digitGrid}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'].map((k) => (
            <Pressable
              key={k}
              style={({ pressed }) => [styles.digitKey, pressed && { opacity: 0.55 }]}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel={k === 'del' ? '退格' : k}
              onPress={() => tapKey(k === 'del' ? 'del' : k)}
            >
              {k === 'del' ? (
                <Icon name="backspace-outline" size={24} color={C.text} />
              ) : (
                <Text style={styles.digitText}>{k}</Text>
              )}
            </Pressable>
          ))}
        </View>
        <View style={styles.sideCol}>
          <Pressable
            style={({ pressed }) => [styles.sideKey, pressed && { opacity: 0.55 }]}
            disabled={saving}
            accessibilityRole="button"
            onPress={() => setAmountInput('0')}
          >
            <Text style={styles.sideText}>清零</Text>
          </Pressable>
          {!editing && <Pressable
            accessibilityRole="button" disabled={saving || !!id}
            style={({ pressed }) => [styles.sideKey, styles.againKey,
              { backgroundColor: typeColor + '14', borderColor: typeColor + '55' }, pressed && { opacity: 0.55 }]}
            onPress={() => save(true)}>
            <Text style={[styles.sideText, { color: typeColor, fontWeight: '600', fontSize: 13 }]}>保存并继续</Text>
          </Pressable>}
          <Pressable
            style={({ pressed }) => [
              styles.saveKey,
              { backgroundColor: typeColor },
              pressed && { opacity: 0.8 },
            ]}
            disabled={saving || (!!id && !editing)}
            accessibilityRole="button"
            onPress={() => save(false)}
          >
            {saving ? <ActivityIndicator color="#fff" accessibilityLabel="保存中" /> : <Text style={styles.saveText}>保存</Text>}
          </Pressable>
        </View>
      </View>

      <CalendarSheet
        visible={calendarOpen}
        value={date}
        onClose={() => setCalendarOpen(false)}
        onPick={setDate}
      />
      {noteEditing && (
        <View style={styles.noteWrap}>
          <TextInput
            style={styles.noteInput}
            value={note}
            editable={!saving}
            accessibilityLabel="账单备注"
            onChangeText={setNote}
            placeholder="输入备注（50 字以内）"
            placeholderTextColor={C.text3}
            maxLength={50}
            autoFocus
          />
          <Pressable style={styles.noteDone} onPress={() => setNoteEditing(false)}>
            <Text style={styles.noteDoneText}>收起</Text>
          </Pressable>
        </View>
      )}

      {/* 快捷指令自动记账成功横幅 */}
      {savedBanner && (
        <View style={styles.savedOverlay}>
          <View style={styles.savedCard}>
            <View style={styles.savedIconCircle}>
              <Icon name="checkmark" size={34} color="#fff" />
            </View>
            <Text style={styles.savedTitle}>已记账</Text>
            <Text style={styles.savedDetail}>{savedBanner}</Text>
            <Pressable style={styles.savedBtn} onPress={() => exitForm(router)}>
              <Text style={styles.savedBtnText}>完成</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function AccountChips({
  accounts,
  selectedId,
  onSelect,
}: {
  accounts: { id: string; name: string; icon: string }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {accounts.map((a) => {
          const selected = a.id === selectedId;
          return (
            <Pressable
              key={a.id}
              style={[styles.chip, styles.accountChip, selected && styles.accountChipOn]}
              onPress={() => onSelect(a.id)}
            >
              <Text style={styles.accountIcon}>{a.icon}</Text>
              <Text numberOfLines={1} style={[styles.chipText, selected && { color: C.primary, fontWeight: '600' }]}>
                {a.name}
              </Text>
            </Pressable>
          );
        })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  moreSection: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    gap: 6,
  },
  moreHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 },
  moreTitle: { fontSize: 14, fontWeight: '600', color: C.text },
  moreHint: { flex: 1, fontSize: 12, color: C.text3 },
  moreRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  moreLabel: { fontSize: 13, color: C.text2 },
  moreInput: {
    flex: 1,
    minHeight: 38,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: C.chip,
    color: C.text,
    fontSize: 15,
  },
  moreEmpty: { fontSize: 12, color: C.text3, lineHeight: 18 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  tagText: { fontSize: 13, color: C.text2, fontWeight: '500' },
  refundButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },

  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  error: { color: C.danger, backgroundColor: C.expenseSoft, padding: 12, fontSize: 14, lineHeight: 20 },
  feedback: { color: C.income, backgroundColor: C.incomeSoft, padding: 12, fontSize: 14, lineHeight: 20 },
  categoryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  categoryTitle: { fontSize: 14, color: C.text2, fontWeight: '600' },
  categoryToggle: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  selectedBadge: { position: 'absolute', right: -3, top: -3, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 52,
  },
  seg: {
    flexDirection: 'row',
    backgroundColor: C.chip,
    borderRadius: 20,
    padding: 3,
  },
  segItem: {
    paddingHorizontal: 18,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segText: {
    fontSize: 14,
    color: C.text2,
  },
  segTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 6,
    marginBottom: 10,
  },
  currency: {
    fontSize: 26,
    fontWeight: '700',
    marginRight: 6,
  },
  amount: {
    fontSize: 44,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  commonSection: {
    marginBottom: 14,
  },
  commonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  commonTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: C.text,
  },
  commonHint: {
    fontSize: 12,
    color: C.text2,
  },
  commonList: {
    gap: 8,
  },
  commonBill: {
    width: 150,
    minHeight: 72,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    justifyContent: 'space-between',
  },
  commonBillTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  commonBillIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.chip,
  },
  commonBillEmoji: {
    fontSize: 16,
  },
  commonBillName: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: '600',
    color: C.text,
  },
  commonBillAmount: {
    marginTop: 6,
    color: C.text2,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.chip,
    borderRadius: 14,
    paddingHorizontal: 12,
    minHeight: 40,
    maxWidth: 180,
  },
  chipText: {
    fontSize: 13,
    color: C.text2,
  },
  accountChip: {
    minHeight: 40,
  },
  accountChipOn: {
    backgroundColor: C.primarySoft,
    borderWidth: 1,
    borderColor: C.primary,
  },
  accountIcon: {
    fontSize: 14,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  subGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  subChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  subChipText: { fontSize: 13, color: C.text2, fontWeight: '600' },
  gridItem: {
    width: '25%',
    alignItems: 'center',
    paddingVertical: 8,
  },
  gridIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: C.chip,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridEmoji: {
    fontSize: 26,
  },
  gridText: {
    fontSize: 13,
    color: C.text2,
    marginTop: 5,
  },
  transferBox: {
    backgroundColor: '#FFFBF3',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F7E8CE',
  },
  transferRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  transferLabel: {
    fontSize: 14,
    color: C.text2,
    width: 36,
    flexShrink: 0,
  },
  transferArrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 10,
    paddingLeft: 4,
    paddingRight: 60,
  },
  transferArrowLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#EBD9BC',
  },
  transferArrowBadge: {
    width: 36,
    flexShrink: 0,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFF3DF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  transferHint: {
    fontSize: 11,
    color: C.text3,
    marginTop: 12,
    textAlign: 'center',
  },
  keypad: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    backgroundColor: '#FAFBFD',
    paddingTop: 8,
    gap: 8,
    paddingHorizontal: 8,
  },
  digitGrid: {
    flex: 3,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  digitKey: {
    width: '31.5%',
    height: 46,
    backgroundColor: '#fff',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digitText: {
    fontSize: 22,
    color: C.text,
    fontVariant: ['tabular-nums'],
  },
  sideCol: {
    flex: 1,
    gap: 6,
  },
  sideKey: {
    height: 46,
    backgroundColor: '#fff',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  againKey: {
    borderWidth: 1,
  },
  sideText: {
    fontSize: 15,
    color: C.text2,
  },
  saveKey: {
    flex: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: {
    fontSize: 17,
    color: '#fff',
    fontWeight: '700',
  },
  savedOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  savedCard: {
    alignItems: 'center',
    gap: 10,
  },
  savedIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: C.income,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  savedTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: C.text,
  },
  savedDetail: {
    fontSize: 15,
    color: C.text2,
  },
  savedBtn: {
    marginTop: 22,
    height: 46,
    paddingHorizontal: 56,
    borderRadius: 23,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedBtnText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '700',
  },
  noteWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#fff',
    paddingTop: 120,
    paddingHorizontal: 24,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 14,
    fontSize: 16,
    color: C.text,
  },
  noteDone: {
    alignSelf: 'flex-end',
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  noteDoneText: {
    fontSize: 15,
    color: C.primary,
    fontWeight: '600',
  },
});
