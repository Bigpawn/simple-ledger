import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C } from '@/constants/theme';

const EMOJIS = [
  '💰', '💵', '💳', '🏦', '💚', '💙', '🐧', '🧧', '📈', '🪙', '👛', '🔖',
  '🍜', '🍲', '🥗', '🍱', '🍞', '🍟', '🍕', '🍰', '☕', '🧋', '🍺', '🎂',
  '🥕', '🍎', '🍉', '🍇', '🥩', '🍳', '🛒', '🧻', '🧴', '🧹', '📦', '🛍️',
  '👕', '👗', '👟', '🎒', '⌚', '💍', '👓', '🎮', '🎬', '🎤', '📺', '📷',
  '🎣', '⚽', '🏀', '🏊', '🏃', '🎯', '🎸', '💊', '🩺', '🏥', '🦷', '🌡️',
  '🏠', '🛏️', '🚿', '💡', '🔧', '🧰', '📱', '💻', '⌨️', '🖥️', '🔌', '🚌',
  '🚕', '🚗', '⛽', '🚄', '🚲', '🛵', '✈️', '🚢', '📚', '✏️', '🎓', '📖',
  '🐶', '🐱', '🐟', '🐰', '🦜', '🎁', '💐', '🎉', '👶', '💼', '🏆', '🧾',
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onPick: (emoji: string) => void;
}

export function EmojiPickerSheet({ visible, onClose, onPick }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.mask} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>选择图标</Text>
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
            <View style={styles.grid}>
              {EMOJIS.map((e) => (
                <Pressable
                  key={e}
                  style={({ pressed }) => [styles.item, pressed && { backgroundColor: C.chip }]}
                  onPress={() => {
                    onPick(e);
                    onClose();
                  }}
                >
                  <Text style={styles.emoji}>{e}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mask: {
    flex: 1,
    backgroundColor: C.mask,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 34,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  item: {
    width: '12.5%',
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 24,
  },
});
