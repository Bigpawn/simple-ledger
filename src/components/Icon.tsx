import { Ionicons } from '@expo/vector-icons';
import type { StyleProp, TextStyle } from 'react-native';

/**
 * 统一图标封装：图标字体在部分真机上因默认行高产生垂直/水平偏移，
 * 这里强制 lineHeight 与 size 一致并居中文本，保证所有图标渲染居中。
 */
export function Icon({
  name,
  size = 20,
  color,
  style,
}: {
  name: keyof typeof Ionicons.glyphMap;
  size?: number;
  color: string;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Ionicons
      name={name}
      size={size}
      color={color}
      style={[{ lineHeight: size, textAlign: 'center' }, style]}
    />
  );
}
