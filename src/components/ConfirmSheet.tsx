import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { C } from '@/constants/theme';

export function ConfirmSheet({ visible, title, message, confirmLabel = '放弃修改', onCancel, onConfirm }: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.mask}>
        <View style={styles.card} accessibilityViewIsModal>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" style={styles.button} onPress={onCancel}>
              <Text style={{ color: C.primary, fontWeight: '600' }}>继续编辑</Text>
            </Pressable>
            <Pressable accessibilityRole="button" style={[styles.button, { backgroundColor: C.expenseSoft }]} onPress={onConfirm}>
              <Text style={{ color: C.danger, fontWeight: '600' }}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mask: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: C.mask },
  card: { backgroundColor: C.card, borderRadius: 20, padding: 24, gap: 12, width: '100%', maxWidth: 420, alignSelf: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: C.text },
  message: { fontSize: 15, lineHeight: 23, color: C.text2 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  button: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primarySoft, borderRadius: 12 },
});
