// File: app/(app)/_layout.tsx
import { Redirect, Tabs } from 'expo-router';
import { BarChart4, History, Home, NotebookText, Settings, User, Utensils } from 'lucide-react-native';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthContext';

type TabConfig = {
  name: string;
  title: string;
  icon: React.ElementType; 
  isHidden: boolean; // Thay vì condition, dùng isHidden để rõ nghĩa hơn
};

export default function AppLayout() {
  const { session, role, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  // Nếu chưa đăng nhập -> Đá về Login
  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  const isAdmin = role === 'admin';

  // Định nghĩa cấu hình cho TẤT CẢ các màn hình trong thư mục (app)
  // Bắt buộc phải liệt kê hết để tránh Expo tự tạo tab rác
  const allTabs: TabConfig[] = [
    // 1. Home: Luôn hiện
    { name: "home", title: "Bàn", icon: Home, isHidden: false },
    
    // 2. Order: Luôn ẩn khỏi thanh Tab (chỉ vào bằng code)
    { name: "order", title: "Order", icon: NotebookText, isHidden: true },
    
    // 3. Các Tab Admin: Ẩn nếu không phải admin
    { name: "menu", title: "Menu", icon: Utensils, isHidden: !isAdmin },
    { name: "report", title: "Báo cáo", icon: BarChart4, isHidden: !isAdmin },
    { name: "history", title: "Lịch sử", icon: History, isHidden: !isAdmin },
    { name: "staff", title: "Nhân viên", icon: User, isHidden: !isAdmin },
    { name: "settings", title: "Cài đặt", icon: Settings, isHidden: !isAdmin }
  ];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#FF6B35',
      }}
    >
      {allTabs.map(tab => {
        const Icon = tab.icon;
        return (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: tab.title,
              // QUAN TRỌNG: href = null sẽ ẩn tab đi nhưng vẫn giữ route tồn tại
              // href = undefined (mặc định) sẽ hiện tab bình thường
              href: tab.isHidden ? null : undefined,
              tabBarIcon: ({ color }) => <Icon color={color} />,
            }}
          />
        );
      })}
    </Tabs>
  );
}