import { Image, StyleSheet, Text, View } from 'react-native';
import { CATEGORY_ICONS } from '@/constants/categoryIcons';
import type { Category } from '@/db/types';

/**
 * 分类图标：优先用图标包（iconImage 对应 assets/icons/categories/<key>.png），
 * 老数据没有图标时回退到 emoji。
 */
export function CategoryIcon({
  category,
  size = 26,
}: {
  category: Pick<Category, 'icon' | 'iconImage'>;
  size?: number;
}) {
  const source = category.iconImage ? CATEGORY_ICONS[category.iconImage] : undefined;
  if (source) {
    return <Image source={source} style={{ width: size, height: size }} resizeMode="contain" />;
  }
  return (
    <View style={[styles.fallback, { width: size, height: size }]}>
      <Text style={{ fontSize: Math.round(size * 0.82), lineHeight: size }}>{category.icon || '🧾'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
});
