import { Tabs, router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { C } from '@/constants/theme';

function TabIcon({
  name,
  focused,
  color,
}: {
  name: Parameters<typeof Icon>[0]['name'];
  focused: boolean;
  color: string;
}) {
  return (
    <Icon
      name={focused ? name : (`${name}-outline` as Parameters<typeof Icon>[0]['name'])}
      size={22}
      color={color}
    />
  );
}

interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void };
  insets: { bottom: number };
}

function CustomTabBar({ state, navigation, insets }: TabBarProps) {
  const routes = state.routes;
  // 布局：明细、图表、＋（中央缺口按钮）、资产、我的
  const order = [0, 1, -1, 2, 3];

  const labelFor = (name: string) => {
    if (name === 'index') return '明细';
    if (name === 'stats') return '图表';
    if (name === 'assets') return '资产';
    return '我的';
  };
  const iconFor = (name: string) =>
    name === 'index'
      ? 'document-text'
      : name === 'stats'
        ? 'pie-chart'
        : name === 'assets'
          ? 'wallet'
          : 'person';

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
      {/* 中央缺口：页面背景色大圆，让按钮嵌在洞里 */}
      <View style={styles.notch} pointerEvents="none" />

      {order.map((idx, pos) => {
        if (idx === -1) {
          return (
            <Pressable
              key="add"
              style={styles.addSlot}
              onPress={() => router.push('/transaction')}
              accessibilityLabel="记一笔"
              accessibilityRole="button"
              hitSlop={8}
            >
              <View style={styles.addBtn}>
                {/* 自绘十字，避免图标字体在真机上的居中偏移 */}
                <View style={styles.crossV} />
                <View style={styles.crossH} />
              </View>
            </Pressable>
          );
        }
        const route = routes[idx];
        const focused = state.index === idx;
        const label = labelFor(route.name);
        return (
          <Pressable
            key={route.key}
            style={styles.tab}
            onPress={() => navigation.navigate(route.name)}
            accessibilityLabel={label}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
          >
            <TabIcon
              name={iconFor(route.name) as Parameters<typeof Icon>[0]['name']}
              focused={focused}
              color={focused ? C.primary : C.text3}
            />
            <Text style={[styles.tabText, focused && styles.tabTextOn]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const NOTCH = 64; // 缺口圆直径
const FAB = 50; // 按钮直径

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    paddingTop: 8,
    shadowColor: '#1C2333',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 10,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 2,
  },
  tabText: {
    fontSize: 12,
    color: C.text3,
    fontWeight: '500',
  },
  tabTextOn: {
    color: C.primary,
    fontWeight: '700',
  },
  addSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  notch: {
    position: 'absolute',
    top: -(NOTCH / 2) + 10,
    left: '50%',
    marginLeft: -NOTCH / 2,
    width: NOTCH,
    height: NOTCH,
    borderRadius: NOTCH / 2,
    backgroundColor: C.bg,
    zIndex: 0,
  },
  addBtn: {
    width: FAB,
    height: FAB,
    borderRadius: FAB / 2,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    // 与缺口圆同心：notch 圆心位于 bar 顶边下方 10px，FAB 顶部需在 -15，即 marginTop = -15-8
    marginTop: -23,
    zIndex: 1,
    shadowColor: C.primary,
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  crossV: {
    position: 'absolute',
    width: 2.5,
    height: 20,
    borderRadius: 1.25,
    backgroundColor: '#fff',
  },
  crossH: {
    position: 'absolute',
    width: 20,
    height: 2.5,
    borderRadius: 1.25,
    backgroundColor: '#fff',
  },
});

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="stats" />
      <Tabs.Screen name="assets" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
