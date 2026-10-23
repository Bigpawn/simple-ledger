import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C } from '@/constants/theme';

export function FilterOptions({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { id: string; name: string }[];
  selected?: string;
  onChange: (id: string) => void;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {options.map((option) => {
          const active = option.id === (selected ?? '');
          return (
            <Pressable
              key={option.id}
              accessibilityRole="button"
              accessibilityLabel={`${label}：${option.name}`}
              accessibilityState={{ selected: active }}
              onPress={() => onChange(option.id)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.text, active && styles.textActive]}>{option.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  row: { gap: 8 },
  label: { fontSize: 12, color: C.text2 },
  chip: {
    minHeight: 40,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipActive: { backgroundColor: C.primarySoft, borderColor: C.primary },
  text: { color: C.text2, fontSize: 14 },
  textActive: { color: C.primary },
});
