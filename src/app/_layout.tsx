import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useStore } from '@/store/useStore';
import { createAutoSnapshot } from '@/utils/backup';

/**
 * 启动 URL 守卫：
 * Expo Go 会记住并重放上次打开项目用的深链。若本次启动直接落在记账页、
 * 且 URL 没带时间戳 t、也不是编辑已有记录（id），说明是旧链接重放，直接回首页。
 *
 * 用真实启动 URL 判断，而不是路由栈 canGoBack——冷启动深链时栈里可能自带首页垫底，
 * canGoBack 不可靠。
 */
function BootUrlGuard() {
  const router = useRouter();

  useEffect(() => {
    let alive = true;
    Linking.getInitialURL()
      .then((url) => {
        if (!alive || !url) return;
        const [pathPart, queryPart = ''] = url.split('?');
        const path = pathPart.replace(/\/$/, '');
        const isTransaction = path.endsWith('/transaction') || path.endsWith('/--/transaction');
        const hasTimestamp = /(^|&)t=/.test(queryPart);
        const isEdit = /(^|&)id=/.test(queryPart);
        if (isTransaction && !hasTimestamp && !isEdit) {
          router.replace('/');
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [router]);

  return null;
}

export default function RootLayout() {
  const init = useStore((s) => s.init);
  const ready = useStore((s) => s.ready);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (ready) void createAutoSnapshot().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <BootUrlGuard />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#F6F7FA' },
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="transaction"
            options={{ presentation: 'modal', gestureEnabled: false }}
          />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
