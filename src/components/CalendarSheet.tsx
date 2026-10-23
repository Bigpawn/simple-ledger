import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { C } from '@/constants/theme';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

interface Props {
  visible: boolean;
  value: string; // YYYY-MM-DD
  onClose: () => void;
  onPick: (date: string) => void;
}

export function CalendarSheet({ visible, value, onClose, onPick }: Props) {
  const [viewMonth, setViewMonth] = useState(value.slice(0, 7));
  useEffect(() => {
    if (visible) setViewMonth(value.slice(0, 7));
  }, [visible, value]);
  const first = dayjs(`${viewMonth}-01`);
  const daysInMonth = first.daysInMonth();
  const leading = first.day(); // 该月 1 号是周几
  const today = dayjs().format('YYYY-MM-DD');

  const cells: (string | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      first.add(i, 'day').format('YYYY-MM-DD')
    ),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const shiftMonth = (delta: number) => {
    const next = dayjs(`${viewMonth}-01`)
      .add(delta, 'month')
      .format('YYYY-MM');
    setViewMonth(next);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.mask} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Pressable style={styles.navButton} onPress={() => shiftMonth(-1)} accessibilityRole="button" accessibilityLabel="日历上一月">
              <Icon name="chevron-back" size={22} color={C.text2} />
            </Pressable>
            <Text style={styles.title}>
              {first.year()}年{first.month() + 1}月
            </Text>
            <Pressable style={styles.navButton} disabled={viewMonth >= today.slice(0, 7)} onPress={() => shiftMonth(1)} accessibilityRole="button" accessibilityLabel="日历下一月">
              <Icon name="chevron-forward" size={22} color={C.text2} />
            </Pressable>
          </View>
          <View style={styles.weekRow}>
            {WEEKDAYS.map((w) => (
              <Text key={w} style={styles.weekText}>
                {w}
              </Text>
            ))}
          </View>
          <View style={styles.grid}>
            {cells.map((d, i) => {
              if (!d) return <View key={i} style={styles.cell} />;
              const selected = d === value;
              const isToday = d === today;
              const isFuture = d > today;
              return (
                <Pressable
                  key={i}
                  style={styles.cell}
                  disabled={isFuture}
                  accessibilityRole="button"
                  accessibilityLabel={d}
                  accessibilityState={{ selected, disabled: isFuture }}
                  onPress={() => {
                    onPick(d);
                    onClose();
                  }}
                >
                  <View style={[styles.dayBtn, selected && styles.daySelected]}>
                    <Text
                      style={[
                        styles.dayText,
                        isToday && !selected && styles.dayToday,
                        isFuture && styles.dayFuture,
                        selected && styles.dayTextSelected,
                      ]}
                    >
                      {Number(d.slice(8))}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Pressable style={styles.closeButton} accessibilityRole="button" onPress={onClose}>
            <Text style={{ color: C.text2, fontSize: 14 }}>取消</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  navButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  closeButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  mask: {
    flex: 1,
    backgroundColor: C.mask,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    color: C.text3,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: '14.2857%',
    alignItems: 'center',
    paddingVertical: 4,
  },
  dayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  daySelected: {
    backgroundColor: C.primary,
  },
  dayText: {
    fontSize: 15,
    color: C.text,
  },
  dayToday: {
    color: C.primary,
    fontWeight: '700',
  },
  dayFuture: {
    color: C.text3,
    opacity: 0.5,
  },
  dayTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
});
