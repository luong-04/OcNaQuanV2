import DateTimePicker from '@react-native-community/datetimepicker';
import { useQuery } from '@tanstack/react-query';
import { Calendar, FileText } from 'lucide-react-native';
import React, { useCallback, useState } from 'react'; // Thêm useCallback
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl // 1. Import RefreshControl
  ,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { fetchOrdersHistory } from '../../src/api/orderApi';
import { Calculations, sharePaymentBill } from '../../src/services/printService';

export default function HistoryScreen() {
  const [date, setDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  
  // 2. Thêm state cho hiệu ứng loading khi vuốt
  const [refreshing, setRefreshing] = useState(false);

  const dateStr = date.toISOString().split('T')[0];

  // Lấy thêm hàm refetch từ useQuery
  const { data: orders, isLoading, refetch } = useQuery({
    queryKey: ['ordersHistory', dateStr],
    queryFn: () => fetchOrdersHistory(dateStr),
  });

  const onChangeDate = (event: any, selectedDate?: Date) => {
    setShowPicker(Platform.OS === 'ios');
    if (selectedDate) setDate(selectedDate);
  };

  // 3. Hàm xử lý khi vuốt xuống
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch(); // Gọi lại API lấy dữ liệu mới nhất
    setRefreshing(false);
  }, [refetch]);

  const f = (num: number) => num.toLocaleString('vi-VN');

  const handleViewBill = (order: any) => {
    if (!order.order_items || order.order_items.length === 0) return;

    const orderItemsMap = new Map<number, number>();
    const menuArray: any[] = [];
    let subtotal = 0;

    order.order_items.forEach((item: any) => {
      if (item.menu_items) {
        const itemId = item.menu_items.id;
        const qty = item.quantity;
        const price = item.menu_items.price;

        orderItemsMap.set(itemId, qty);
        menuArray.push(item.menu_items);
        subtotal += price * qty;
      }
    });

    const finalTotal = order.total_amount || subtotal;
    
    const calculations: Calculations = {
      subtotal: subtotal,
      discountAmount: 0,
      vatAmount: 0,
      finalTotal: finalTotal 
    };

    sharePaymentBill(order.table_name, orderItemsMap, menuArray, calculations);
  };

  const renderItem = ({ item }: { item: any }) => (
    <TouchableOpacity style={styles.card} onPress={() => handleViewBill(item)}>
      <View style={styles.cardLeft}>
        <View style={styles.iconBox}>
          <FileText size={24} color="#fff" />
        </View>
        <View>
          <Text style={styles.tableName}>{item.table_name}</Text>
          <Text style={styles.timeText}>
            {new Date(item.created_at).toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})}
          </Text>
        </View>
      </View>
      <View>
        <Text style={styles.amount}>{f(item.total_amount)}đ</Text>
        <Text style={styles.viewBtnText}>Xem Bill</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Lịch Sử Hóa Đơn</Text>
        <TouchableOpacity style={styles.dateBtn} onPress={() => setShowPicker(true)}>
          <Calendar size={20} color="#fff" />
          <Text style={styles.dateText}>{date.toLocaleDateString('vi-VN')}</Text>
        </TouchableOpacity>
      </View>

      {showPicker && (
        <DateTimePicker value={date} mode="date" display="default" onChange={onChangeDate} />
      )}

      {/* Hiển thị danh sách hoặc loading ban đầu */}
      {isLoading && !refreshing ? (
        <ActivityIndicator size="large" color="#FF6B35" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={orders}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{ padding: 16, paddingBottom: 50 }}
          // 4. Gắn RefreshControl vào đây
          refreshControl={
            <RefreshControl 
                refreshing={refreshing} 
                onRefresh={onRefresh} 
                colors={['#FF6B35']} // Màu của vòng tròn loading
                tintColor="#FF6B35"  // Màu cho iOS
            />
          }
          ListEmptyComponent={<Text style={styles.emptyText}>Không có hóa đơn nào trong ngày này</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', paddingTop: 50 },
  header: { paddingHorizontal: 20, marginBottom: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#FF6B35', fontFamily: 'SVN-Bold' },
  dateBtn: { flexDirection: 'row', backgroundColor: '#FF6B35', padding: 10, borderRadius: 8, alignItems: 'center' },
  dateText: { color: '#fff', fontWeight: 'bold', marginLeft: 8 },
  
  card: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 10, elevation: 2 },
  cardLeft: { flexDirection: 'row', alignItems: 'center' },
  iconBox: { width: 45, height: 45, borderRadius: 22.5, backgroundColor: '#3498db', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  tableName: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  timeText: { fontSize: 14, color: '#888' },
  amount: { fontSize: 18, fontWeight: 'bold', color: '#27ae60', textAlign: 'right' },
  viewBtnText: { fontSize: 12, color: '#3498db', textAlign: 'right', marginTop: 4 },
  
  emptyText: { textAlign: 'center', color: '#999', marginTop: 30, fontSize: 16 }
});