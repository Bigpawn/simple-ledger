import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { C } from '@/constants/theme';
import { formatFen } from '@/utils/money';

/* ---------- 环形占比图 ---------- */

export interface DonutSlice {
  value: number;
  color: string;
}

export function DonutChart({
  slices,
  size = 172,
  stroke = 26,
  centerLabel,
  centerValue,
  centerColor,
}: {
  slices: DonutSlice[];
  size?: number;
  stroke?: number;
  centerLabel: string;
  centerValue: number;
  centerColor: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`${centerLabel}，${formatFen(centerValue)}元，占比详见下方列表`} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        {/* 底环 */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={C.border}
          strokeWidth={stroke}
          fill="none"
        />
        {total > 0 &&
          slices.map((s, i) => {
            const len = (s.value / total) * circumference;
            const dashOffset = -offset;
            offset += len;
            return (
              <Circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                stroke={s.color}
                strokeWidth={stroke}
                fill="none"
                strokeDasharray={`${Math.max(len - 2, 0)} ${circumference}`}
                strokeDashoffset={dashOffset}
                strokeLinecap="butt"
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            );
          })}
      </Svg>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={styles.centerLabel}>{centerLabel}</Text>
          <Text style={[styles.centerValue, { color: centerColor }]}>
            ¥{formatFen(centerValue)}
          </Text>
        </View>
      </View>
    </View>
  );
}

/* ---------- 每日柱状图 ---------- */

export interface DayBar {
  day: number;
  value: number; // 元
}

export function DayBarChart({ bars, color, onSelectDay }: { bars: DayBar[]; color: string; onSelectDay?: (day: number) => void }) {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const selected = bars.find((bar) => bar.day === selectedDay);
  const max = Math.max(...bars.map((b) => b.value), 0.01);
  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
        <Text style={{ fontSize: 12, color: C.text2 }}>最高 ¥{formatFen(Math.round(max * 100))}</Text>
        <Text accessibilityLiveRegion="polite" style={{ fontSize: 12, color: C.text2 }}>
          {selected ? `${selected.day}日 ¥${formatFen(Math.round(selected.value * 100))}` : '点按柱形查看金额'}
        </Text>
      </View>
      <View style={styles.barWrap}>
        {bars.map((b) => {
          const pct = (b.value / max) * 100;
          const showLabel = b.day === 1 || b.day % 5 === 0;
          return (
            <Pressable key={b.day} accessibilityRole="button" accessibilityLabel={`${b.day}日，${b.value.toFixed(2)}元`} accessibilityState={{ selected: b.day === selectedDay }}
              onPress={() => setSelectedDay(b.day)} style={styles.barCol}>
              <View style={styles.barTrack}>
                <View style={[styles.bar, { backgroundColor: b.value > 0 ? color : C.border,
                  opacity: selectedDay && selectedDay !== b.day ? 0.45 : 1,
                  height: b.value > 0 ? `${Math.max(pct, 1)}%` : 2 }]} />
              </View>
              <Text style={[styles.barLabel, { opacity: showLabel || selectedDay === b.day ? 1 : 0 }]}>{b.day}</Text>
            </Pressable>
          );
        })}
      </View>
      {selected && onSelectDay && <Pressable style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" onPress={() => onSelectDay(selected.day)}>
        <Text style={{ color: C.primary, fontSize: 14 }}>查看 {selected.day} 日明细 →</Text>
      </Pressable>}
    </View>
  );
}

const styles = StyleSheet.create({
  centerLabel: {
    fontSize: 12,
    color: C.text3,
  },
  centerValue: {
    fontSize: 17,
    fontWeight: '800',
    marginTop: 2,
  },
  barWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 150,
    marginTop: 8,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
  },
  barTrack: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: {
    width: 7,
  },
  barLabel: {
    fontSize: 11,
    color: C.text3,
    marginTop: 4,
    height: 16,
  },
});
