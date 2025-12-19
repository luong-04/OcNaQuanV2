// File: app/index.tsx
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../src/auth/AuthContext';

export default function Index() {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  // Nếu đã đăng nhập -> Vào Home
  if (session) {
    return <Redirect href="/(app)/home" />;
  }

  // Nếu chưa -> Vào Login
  return <Redirect href="/(auth)/login" />;
}