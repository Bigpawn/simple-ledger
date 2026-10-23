import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/Icon';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { C } from '@/constants/theme';
import { formatFen } from '@/utils/money';
import type { Txn } from '@/db/types';
import { accountById, categoryById } from '@/store/useStore';

interface Props {
  txn: Txn;
  onPress: (txn: Txn) => void;
  onDelete: (txn: Txn) => void;
  /** 当天分组内最后一行：不画分隔线 */
  last?: boolean;
}

const TYPE_COLOR: Record<Txn['type'], string> = {
  expense: C.expense,
  income: C.income,
  transfer: C.transfer,
};

export function TxnRow({ txn, onPress, onDelete, last }: Props) {
  const cat = categoryById(txn.categoryId);
  const account = accountById(txn.accountId);
  const toAccount = accountById(txn.toAccountId);
  const color = TYPE_COLOR[txn.type];

  const icon =
    txn.type === 'transfer' ? '🔁' : (cat?.icon ?? '❓');
  const title =
    txn.type === 'transfer'
      ? `${account?.name ?? '？'} → ${toAccount?.name ?? '？'}`
      : (cat?.name ?? '未分类');
  const badges = [
    txn.claimStatus === 'pending' ? '待报销' : txn.claimStatus === 'done' ? '已报销' : null,
    txn.refundOf ? '退款' : null,
    (txn.fee ?? 0) > 0 ? `手续费 ¥${formatFen(txn.fee ?? 0)}` : null,
    (txn.discount ?? 0) > 0 ? `优惠 ¥${formatFen(txn.discount ?? 0)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const amountText =
    txn.type === 'income'
      ? `+${formatFen(txn.amount)}`
      : txn.type === 'transfer'
        ? formatFen(txn.amount)
        : `-${formatFen(txn.amount)}`;

  const confirmDelete = () => {
    Alert.alert('删除这笔记录？', `${title}  ¥${formatFen(txn.amount)}\n删除后 7 秒内可以撤销`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => onDelete(txn) },
    ]);
  };

  const row = (
    <Pressable
      style={({ pressed }) => [styles.row, !last && styles.rowBordered, pressed && { opacity: 0.7 }]}
      onPress={() => onPress(txn)}
      onLongPress={Platform.OS === 'web' ? confirmDelete : undefined}
    >
      <View style={styles.iconWrap}>
        <Text style={styles.icon}>{icon}</Text>
      </View>
      <View style={styles.mid}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {[account?.name, badges, txn.note].filter(Boolean).join(' · ') || '转账'}
        </Text>
      </View>
      <Text style={[styles.amount, { color }]} numberOfLines={1} adjustsFontSizeToFit>{amountText}</Text>
    </Pressable>
  );

  // ReanimatedSwipeable 在浏览器上有渲染兼容问题（删除按钮常驻展开），仅在原生平台启用
  if (Platform.OS === 'web') {
    return row;
  }

  return (
    <ReanimatedSwipeable
      friction={2}
      overshootRight={false}
      renderRightActions={() => (
        <Pressable style={styles.deleteBtn} onPress={confirmDelete}>
          <Icon name="trash-outline" size={20} color="#fff" />
        </Pressable>
      )}
    >
      {row}
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  deleteBtn: {
    width: 68,
    marginLeft: 8,
    borderRadius: 12,
    backgroundColor: C.expense,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingRight: 4,
    gap: 12,
    // 行自身不透明，盖住滑动操作层的删除按钮（RNGH 3.x 不再用 opacity 隐藏未展开的动作）
    backgroundColor: C.card,
  },
  rowBordered: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F2F4F8',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 20,
  },
  mid: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: 15,
    color: C.text,
    fontWeight: '500',
  },
  sub: {
    fontSize: 12,
    color: C.text3,
  },
  amount: {
    maxWidth: '50%',
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
