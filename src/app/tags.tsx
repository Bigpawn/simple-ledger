import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { C } from '@/constants/theme';
import { deleteTag, listTags, newId, upsertTag } from '@/db/repo';
import type { Tag } from '@/db/types';

export default function TagsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tags, setTags] = useState<Tag[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setTags(await listTags());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('请输入标签名');
      return;
    }
    if (tags.some((tag) => tag.name === trimmed)) {
      setError('标签已存在');
      return;
    }
    await upsertTag({ id: newId(), name: trimmed, color: null, sort: tags.length });
    setName('');
    setError('');
    await load();
  };

  const remove = (tag: Tag) => {
    Alert.alert('删除标签？', `「${tag.name}」会从所有账单上移除`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await deleteTag(tag.id);
          await load();
        },
      },
    ]);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.back} accessibilityRole="button" accessibilityLabel="返回" onPress={() => router.back()}>
          <Icon name="chevron-back" size={24} color={C.text} />
        </Pressable>
        <Text style={styles.title}>标签</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 24 }}>
        <View style={styles.card}>
          <Text style={styles.section}>新建标签</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="例如：出差、装修、孩子"
              placeholderTextColor={C.text3}
              maxLength={12}
              onSubmitEditing={() => void add()}
              returnKeyType="done"
            />
            <Pressable style={styles.addButton} accessibilityRole="button" onPress={() => void add()}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>添加</Text>
            </Pressable>
          </View>
          {!!error && <Text style={{ color: C.danger, fontSize: 12 }}>{error}</Text>}
          <Text style={styles.hint}>标签可在记账页的「更多」里选择，也可用于筛选账单。</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>已有标签</Text>
          {tags.length === 0 ? (
            <Text style={styles.hint}>还没有标签</Text>
          ) : (
            tags.map((tag) => (
              <View key={tag.id} style={styles.tagRow}>
                <View style={styles.tagDot} />
                <Text style={styles.tagName}>{tag.name}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`删除标签${tag.name}`}
                  onPress={() => remove(tag)}
                  hitSlop={8}
                >
                  <Icon name="trash-outline" size={16} color={C.text3} />
                </Pressable>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 8 },
  back: { minWidth: 40, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '700', color: C.text },
  card: { padding: 18, backgroundColor: C.card, borderRadius: 16, gap: 12 },
  section: { fontSize: 16, fontWeight: '700', color: C.text },
  inputRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: C.chip,
    color: C.text,
    fontSize: 15,
  },
  addButton: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { fontSize: 12, color: C.text3, lineHeight: 18 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  tagDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.primary },
  tagName: { flex: 1, fontSize: 15, color: C.text },
});
