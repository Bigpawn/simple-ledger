import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C } from '@/constants/theme';

export function UndoBanner({
  message,
  onUndo,
  onDismiss,
  bottom = 92,
}: {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  bottom?: number;
}) {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const timer = setTimeout(() => dismissRef.current(), 7000);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <View style={[styles.wrap, { bottom }]} accessibilityLiveRegion="polite">
      <Text style={styles.message} numberOfLines={2}>
        {message}
      </Text>
      <Pressable
        style={styles.action}
        accessibilityRole="button"
        accessibilityLabel="撤销删除"
        onPress={onUndo}
      >
        <Text style={styles.actionText}>撤销</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    minHeight: 54,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    backgroundColor: '#243047',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  message: { flex: 1, color: '#FFFFFF', fontSize: 14, lineHeight: 20 },
  action: { minWidth: 52, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  actionText: { color: '#BFD2FF', fontSize: 15, fontWeight: '700' },
});
