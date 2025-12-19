// File: app/(auth)/_layout.tsx
import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthContext';

export default function AuthLayout() {
  const { session, isLoading } = useAuth();

  // 1. Chờ load thông tin user
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  // 2. NẾU ĐÃ CÓ SESSION (Đăng nhập thành công) -> Tự động chuyển vào Home
  if (session) {
    return <Redirect href="/(app)/home" />;
  }

  // 3. Nếu chưa đăng nhập -> Hiển thị màn hình Login
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
    </Stack>
  );
}