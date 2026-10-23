import { useRouter } from 'expo-router';
import { categoryChartData } from '@/utils/chartData';
import { PIE_COLORS } from '@/constants/theme';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, CARD_SHADOW } from '@/constants/theme';
import { DayBarChart, DonutChart } from '@/components/Charts';
import { accountBalances, categoryStats, dailyStats } from '@/db/repo';
import { CategoryIcon } from '@/components/CategoryIcon';
import { rollupCategoryStats } from '@/utils/categories';
import type { AccountBalance, CategoryStat, DailyStat } from '@/db/types';
import { useStore } from '@/store/useStore';
import { formatFen } from '@/utils/money';
import { addMonth, dateKey, daysInMonth, monthKey, monthLabel } from '@/utils/date';
import { MonthSwitcher } from '@/components/MonthSwitcher';
import { buildMonthlyInsight } from '@/utils/insights';

export default function StatsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const dataVersion = useStore((s) => s.dataVersion);
  const categories = useStore((s) => s.categories);
  const [month, setMonth] = useState(monthKey());
  const [mode, setMode] = useState<'expense' | 'income'>('expense');
  const [daily, setDaily] = useState<DailyStat[]>([]);
  const [previousDaily, setPreviousDaily] = useState<DailyStat[]>([]);
  const [cats, setCats] = useState<CategoryStat[]>([]);
  const [accounts, setAccounts] = useState<AccountBalance[]>([]);

  const load = useCallback(async () => {
    const [d, c, a, previous] = await Promise.all([
      dailyStats(month),
      categoryStats(month, mode),
      accountBalances(),
      dailyStats(addMonth(month, -1)),
    ]);
    setDaily(d);
    setPreviousDaily(previous);
    setCats(rollupCategoryStats(c, categories));
    setAccounts(a);
  }, [month, mode, categories]);

  useEffect(() => {
    load();
  }, [load, dataVersion]);

  const accent = mode === 'expense' ? C.expense : C.income;
  const total = cats.reduce((s, c) => s + c.total, 0);
  const days = daysInMonth(month);
  const isCurrentMonth = month === monthKey();
  const compareDays = isCurrentMonth ? Number(dateKey().slice(8)) : days;
  const insight = buildMonthlyInsight({
    current: daily,
    previous: previousDaily,
    mode,
    compareDays,
    projectionDays: isCurrentMonth ? days : undefined,
  });
  const modeLabel = mode === 'expense' ? '支出' : '收入';
  const comparisonText =
    insight.currentTotal === 0
      ? `${isCurrentMonth ? '本月' : '这个月'}还没有${modeLabel}记录`
      : insight.previousComparable === 0
        ? `${isCurrentMonth ? '上月同期' : '前一个月'}暂无${modeLabel}记录`
        : insight.delta === 0
          ? '与上月同期持平'
          : `比上月同期${insight.delta > 0 ? '多' : '少'} ¥${formatFen(Math.abs(insight.delta))}${
              insight.percent === null ? '' : `（${insight.delta > 0 ? '+' : ''}${insight.percent.toFixed(1)}%）`
            }`;
  const comparisonColor =
    insight.currentTotal === 0 || insight.previousComparable === 0 || insight.delta === 0
      ? C.text2
      : mode === 'expense'
        ? insight.delta > 0 ? C.expense : C.income
        : insight.delta > 0 ? C.income : C.expense;

  const barData = Array.from({ length: days }, (_, i) => {
    const day = i + 1;
    const stat = daily.find((d) => d.day === day);
    const value = Math.round((mode === 'expense' ? stat?.expense : stat?.income) ?? 0) / 100;
    return { day, value };
  });

  const chartCategories = categoryChartData(cats, PIE_COLORS);
  const pieData = chartCategories.map((c) => ({ value: c.total, color: c.color }));
  const openBills = (filter: { filterCategory?: string; filterDate?: string }) => router.push({ pathname: '/', params: { filterMonth: month, filterType: mode, filterRequest: String(Date.now()), ...filter } });

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>图表</Text>
        <MonthSwitcher month={month} onChange={setMonth} canNext={month < monthKey()} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* 每日趋势 */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>每日{mode === 'expense' ? '支出' : '收入'}</Text>
            <View style={styles.seg}>
              {(['expense', 'income'] as const).map((m) => (
                <Pressable
                  key={m}
                  style={[styles.segItem, mode === m && { backgroundColor: '#fff' }]}
                  onPress={() => setMode(m)}
                >
                  <Text style={[styles.segText, mode === m && { color: C.text, fontWeight: '600' }]}>
                    {m === 'expense' ? '支出' : '收入'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          {total === 0 ? (
            <Text style={styles.emptyLine}>当月暂无{mode === 'expense' ? '支出' : '收入'}记录</Text>
          ) : (
            <DayBarChart key={`${month}-${mode}`} bars={barData} color={accent} onSelectDay={(day) => openBills({ filterDate: `${month}-${String(day).padStart(2, '0')}` })} />
          )}
        </View>

        {/* 月度洞察 */}
        <View style={styles.card}>
          <View style={styles.insightHead}>
            <Text style={styles.cardTitle}>
              {isCurrentMonth ? `本月${modeLabel}概览` : `${monthLabel(month)}${modeLabel}概览`}
            </Text>
            <Text style={styles.insightCompare}>
              {isCurrentMonth ? `与上月 1—${compareDays} 日同期比较` : '与前一个完整月比较'}
            </Text>
          </View>
          <Text style={[styles.insightDelta, { color: comparisonColor }]}>{comparisonText}</Text>
          <View style={styles.metricsRow}>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>日均{modeLabel}</Text>
              <Text style={styles.metricValue}>¥{formatFen(Math.round(insight.dailyAverage))}</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>
                {isCurrentMonth ? '按当前速度预计月底' : `有${modeLabel}天数`}
              </Text>
              <Text style={styles.metricValue}>
                {isCurrentMonth
                  ? `¥${formatFen(insight.projectedTotal ?? 0)}`
                  : `${insight.recordedDays} 天`}
              </Text>
            </View>
          </View>
        </View>

        {/* 分类占比 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            分类占比 · {mode === 'expense' ? '支出' : '收入'}
          </Text>
          {total === 0 ? (
            <Text style={styles.emptyLine}>暂无数据</Text>
          ) : (
            <>
              <View style={styles.pieWrap}>
                <DonutChart
                  slices={pieData}
                  centerLabel={`当月${mode === 'expense' ? '支出' : '收入'}`}
                  centerValue={total}
                  centerColor={accent}
                />
              </View>
              {cats.length > 10 && <Text style={{ color: C.text2, fontSize: 12, lineHeight: 18 }}>其他分类 ¥{formatFen(chartCategories[9].total)} · 合并第 10 名及以后的分类</Text>}
              <View style={styles.rankList}>
                {cats.map((c, i) => {
                  const pct = total > 0 ? (c.total / total) * 100 : 0;
                  const color = chartCategories.find((item) => item.categoryId === c.categoryId)?.color ?? '#677389';
                  return (
                    <Pressable key={c.categoryId} style={styles.rankRow} accessibilityRole="button" accessibilityLabel={`查看${c.name}明细`} onPress={() => openBills({ filterCategory: c.categoryId })}>
                      <View style={[styles.rankDot, { backgroundColor: color }]} />
                      <View style={styles.rankIcon}>
                        <CategoryIcon category={{ icon: c.icon, iconImage: c.iconImage ?? null }} size={18} />
                      </View>
                      <View style={styles.rankMid}>
                        <View style={styles.rankTextRow}>
                          <Text style={styles.rankName} numberOfLines={1}>{c.name}</Text>
                          <Text style={styles.rankAmount}>
                            ¥{formatFen(c.total)} · {pct.toFixed(1)}%
                          </Text>
                        </View>
                        <View style={styles.rankBarBg}>
                          <View
                            style={[styles.rankBarFill, { width: `${pct}%`, backgroundColor: color }]}
                          />
                        </View>
                      </View>
                      <Text style={styles.rankCount}>{c.count}笔</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
        </View>

        {/* 账户余额 */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>当前账户余额</Text>
            <Text style={styles.totalBalance}>净资产 ¥{formatFen(totalBalance)}</Text>
          </View>
          {accounts.map((a) => (
            <View key={a.id} style={styles.accountRow}>
              <Text style={styles.accountIcon}>{a.icon}</Text>
              <Text style={styles.accountName} numberOfLines={1}>{a.name}</Text>
              <Text
                style={[
                  styles.accountBalance,
                  { color: a.balance < 0 ? C.expense : C.text },
                ]}
              >
                ¥{formatFen(a.balance)}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: C.text,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 88,
    gap: 12,
  },
  card: {
    ...CARD_SHADOW,
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text,
    marginBottom: 8,
  },
  insightHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  insightCompare: {
    color: C.text2,
    fontSize: 12,
    textAlign: 'right',
    flexShrink: 1,
  },
  insightDelta: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '700',
    marginTop: 2,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  metric: {
    flex: 1,
    gap: 5,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  metricLabel: {
    fontSize: 12,
    color: C.text2,
  },
  metricValue: {
    fontSize: 17,
    fontWeight: '700',
    color: C.text,
    fontVariant: ['tabular-nums'],
  },
  seg: {
    flexDirection: 'row',
    backgroundColor: C.chip,
    borderRadius: 14,
    padding: 2,
  },
  segItem: {
    paddingHorizontal: 12,
    minHeight: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segText: {
    fontSize: 12,
    color: C.text2,
  },
  emptyLine: {
    textAlign: 'center',
    color: C.text3,
    fontSize: 13,
    paddingVertical: 28,
  },
  pieWrap: {
    alignItems: 'center',
    marginVertical: 8,
  },
  pieCenter: {
    alignItems: 'center',
  },
  pieCenterLabel: {
    fontSize: 11,
    color: C.text3,
  },
  pieCenterValue: {
    fontSize: 17,
    fontWeight: '800',
    marginTop: 2,
  },
  rankList: {
    marginTop: 10,
    gap: 12,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
  },
  rankDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rankIcon: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankMid: {
    flex: 1,
    gap: 5,
  },
  rankTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rankName: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    color: C.text,
  },
  rankAmount: {
    fontSize: 12,
    color: C.text2,
    fontVariant: ['tabular-nums'],
  },
  rankBarBg: {
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    overflow: 'hidden',
  },
  rankBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  rankCount: {
    fontSize: 11,
    color: C.text3,
    width: 34,
    textAlign: 'right',
  },
  totalBalance: {
    fontSize: 13,
    color: C.text2,
    fontVariant: ['tabular-nums'],
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  accountIcon: {
    fontSize: 18,
  },
  accountName: {
    flex: 1,
    fontSize: 15,
    color: C.text,
  },
  accountBalance: {
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
