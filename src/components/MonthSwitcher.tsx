import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { C } from '@/constants/theme';
import { monthKey, monthLabel } from '@/utils/date';

interface Props {
  month: string;
  onChange: (month: string) => void;
  canNext?: boolean;
}

export function MonthSwitcher({ month, onChange, canNext = true }: Props) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(month.slice(0, 4));
  const yearNumber = Number(year);
  const validYear = /^\d{4}$/.test(year) && yearNumber >= 1900 && yearNumber <= Number(monthKey().slice(0, 4));
  return (
    <View style={styles.wrap}>
      <Pressable style={styles.nav} accessibilityRole="button" onPress={() => onChange(add(month, -1))} accessibilityLabel="上一月">
        <Icon name="chevron-back" size={20} color={C.text2} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="选择年月" onPress={() => { setYear(month.slice(0, 4)); setOpen(true); }}>
        <Text style={styles.text}>{monthLabel(month)}</Text>
      </Pressable>
      <Pressable style={styles.nav} accessibilityRole="button" onPress={() => onChange(add(month, 1))} accessibilityLabel="下一月" disabled={!canNext}>
        <Icon name="chevron-forward" size={20} color={canNext ? C.text2 : C.border} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.mask}>
          <View style={styles.sheet}>
            <Text style={styles.title}>选择月份</Text>
            <View style={styles.yearRow}>
              <Pressable style={styles.nav} accessibilityRole="button" accessibilityLabel="上一年" onPress={() => setYear(String(Math.max(1900, (Number(year) || Number(month.slice(0, 4))) - 1)))}>
                <Icon name="chevron-back" size={22} color={C.text2} />
              </Pressable>
              <TextInput style={styles.year} accessibilityLabel="年份" keyboardType="number-pad" maxLength={4} value={year} onChangeText={setYear} selectTextOnFocus />
              <Pressable style={styles.nav} accessibilityRole="button" accessibilityLabel="下一年" disabled={yearNumber >= Number(monthKey().slice(0, 4))} onPress={() => setYear(String((Number(year) || Number(month.slice(0, 4))) + 1))}>
                <Icon name="chevron-forward" size={22} color={C.text2} />
              </Pressable>
            </View>
            {!validYear && <Text style={{ color: C.danger }}>请输入 1900 至今年之间的四位年份</Text>}
            <View style={styles.grid}>
              {Array.from({ length: 12 }, (_, i) => {
                const key = `${year}-${String(i + 1).padStart(2, '0')}`;
                const disabled = !validYear || key > monthKey();
                return <Pressable key={i} accessibilityRole="button" accessibilityLabel={`${year}年${i + 1}月`} accessibilityState={{ selected: key === month, disabled }} disabled={disabled}
                  style={[styles.month, key === month && { backgroundColor: C.primarySoft }, disabled && { opacity: 0.35 }]}
                  onPress={() => { onChange(key); setOpen(false); }}>
                  <Text style={{ color: key === month ? C.primary : C.text, fontSize: 16 }}>{i + 1}月</Text>
                </Pressable>;
              })}
            </View>
            <Pressable style={styles.cancel} accessibilityRole="button" onPress={() => setOpen(false)}><Text style={{ color: C.text2 }}>取消</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function add(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center' },
  nav: { minWidth: 36, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 15, fontWeight: '700', color: C.text, minWidth: 96, textAlign: 'center', paddingVertical: 12 },
  mask: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: C.mask },
  sheet: { backgroundColor: C.card, borderRadius: 20, padding: 20, width: '100%', maxWidth: 420, alignSelf: 'center', gap: 12 },
  title: { fontSize: 18, fontWeight: '700', color: C.text },
  yearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  year: { width: 110, textAlign: 'center', fontSize: 20, color: C.text, backgroundColor: C.chip, borderRadius: 10, padding: 10, marginHorizontal: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  month: { width: '30%', flexGrow: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  cancel: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
