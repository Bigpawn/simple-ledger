import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { useRef, useState } from 'react';
import { C } from '@/constants/theme';

interface Props {
  visible: boolean;
  title: string;
  placeholder?: string;
  initial?: string;
  maxLength?: number;
  onClose: () => void;
  onSubmit: (text: string) => void | Promise<void>;
  keyboardType?: KeyboardTypeOptions;
}

export function TextPromptSheet({
  visible,
  title,
  placeholder,
  initial = '',
  maxLength = 50,
  onClose,
  onSubmit,
  keyboardType,
}: Props) {
  const [text, setText] = useState(initial);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const close = () => { if (!busy.current) onClose(); };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={close}
      onShow={() => { setText(initial); setError(''); }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.mask}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{title}</Text>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder={placeholder}
            placeholderTextColor={C.text3}
            maxLength={maxLength}
            accessibilityLabel={title}
            keyboardType={keyboardType}
            editable={!saving}
            autoFocus
          />
          {!!error && <Text accessibilityRole="alert" style={{ color: C.danger, marginTop: 10 }}>{error}</Text>}
          <View style={styles.btnRow}>
            <Pressable accessibilityRole="button" style={styles.btn} disabled={saving} onPress={close}>
              <Text style={styles.btnText}>取消</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnPrimary]}
              accessibilityRole="button"
              disabled={saving}
              onPress={async () => {
                if (busy.current) return;
                busy.current = true;
                setSaving(true);
                setError('');
                try {
                  await onSubmit(text.trim());
                  onClose();
                } catch (e) {
                  setError(e instanceof Error ? e.message : '保存失败，请重试');
                } finally {
                  busy.current = false;
                  setSaving(false);
                }
              }}
            >
              <Text style={styles.btnTextPrimary}>{saving ? '保存中…' : '保存'}</Text>
            </Pressable>
          </View>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mask: {
    flex: 1,
    backgroundColor: C.mask,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 44,
    fontSize: 15,
    color: C.text,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  btn: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    backgroundColor: C.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: {
    backgroundColor: C.primary,
  },
  btnText: {
    fontSize: 15,
    color: C.text2,
  },
  btnTextPrimary: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
  },
});
