// File: app/(app)/report.tsx
import DateTimePicker from '@react-native-community/datetimepicker';
import { useQuery } from '@tanstack/react-query';
import { Calendar } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { fetchSalesReport } from '../../src/api/reportApi';

export default function ReportScreen() {
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Format YYYY-MM-DD
  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['salesReport', startDateStr, endDateStr],
    queryFn: () => fetchSalesReport(startDateStr, endDateStr),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const onStartChange = (event: any, selectedDate?: Date) => {
    setShowStartPicker(Platform.OS === 'ios');
    if (selectedDate) setStartDate(selectedDate);
  };

  const onEndChange = (event: any, selectedDate?: Date) => {
    setShowEndPicker(Platform.OS === 'ios');
    if (selectedDate) setEndDate(selectedDate);
  };

  const f = (num: number) => num.toLocaleString('vi-VN');

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Báo Cáo Doanh Thu</Text>
      
      {/* Bộ lọc ngày */}
      <View style={styles.filterContainer}>
        <TouchableOpacity style={styles.dateBtn} onPress={() => setShowStartPicker(true)}>
          <Text style={styles.dateLabel}>Từ ngày</Text>
          <View style={styles.dateValueBox}>
            <Calendar size={16} color="#fff" />
            <Text style={styles.dateText}>{startDate.toLocaleDateString('vi-VN')}</Text>
          </View>
        </TouchableOpacity>
        <View style={styles.arrowLine} />
        <TouchableOpacity style={styles.dateBtn} onPress={() => setShowEndPicker(true)}>
          <Text style={styles.dateLabel}>Đến ngày</Text>
          <View style={styles.dateValueBox}>
            <Calendar size={16} color="#fff" />
            <Text style={styles.dateText}>{endDate.toLocaleDateString('vi-VN')}</Text>
          </View>
        </TouchableOpacity>
      </View>

      {showStartPicker && <DateTimePicker value={startDate} mode="date" display="default" onChange={onStartChange} />}
      {showEndPicker && <DateTimePicker value={endDate} mode="date" display="default" onChange={onEndChange} />}

      <ScrollView 
        contentContainerStyle={{ paddingBottom: 100 }} 
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#FF6B35']} />}
      >
        {isLoading && !refreshing ? (
          <ActivityIndicator size="large" color="#FF6B35" style={{ marginTop: 50 }} />
        ) : (
          <>
            {/* Tổng quan */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Tổng doanh thu</Text>
              <Text style={styles.summaryValue}>{f(data?.totalRevenue || 0)}đ</Text>
              <View style={styles.divider} />
              <View style={styles.row}>
                <Text style={styles.subLabel}>Tổng đơn: {data?.totalOrders || 0}</Text>
                <Text style={styles.subLabel}>Đã bán: {data?.totalItems || 0} món</Text>
              </View>
            </View>

            {/* Danh sách Top món (Dùng map thay vì FlatList để không bị lỗi cuộn) */}
            <Text style={styles.sectionTitle}>Top Món Bán Chạy</Text>
            <View style={{ paddingHorizontal: 16 }}>
              {data?.topItems && data.topItems.length > 0 ? (
                data.topItems.map((item, index) => (
                  <View key={index} style={styles.topItem}>
                    <View style={styles.rankBadge}>
                      <Text style={styles.rankText}>{index + 1}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.topName}>{item.menu_items?.name || 'Món đã xóa'}</Text>
                      <Text style={styles.topQty}>Đã bán: {item.total_quantity}</Text>
                    </View>
                    <Text style={styles.topRevenue}>{f(item.total_revenue)}đ</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyText}>Chưa có dữ liệu bán hàng</Text>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', paddingTop: 50 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#FF6B35', textAlign: 'center', marginBottom: 15, fontFamily: 'SVN-Bold' },
  filterContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 10 },
  dateBtn: { flex: 1 }, dateLabel: { fontSize: 12, color: '#888', marginBottom: 4, textAlign: 'center' }, dateValueBox: { flexDirection: 'row', backgroundColor: '#FF6B35', padding: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, dateText: { color: '#fff', fontWeight: 'bold', marginLeft: 6 }, arrowLine: { width: 20, height: 2, backgroundColor: '#ddd', marginHorizontal: 10, marginTop: 15 },
  summaryCard: { backgroundColor: '#fff', margin: 16, padding: 20, borderRadius: 16, elevation: 4, alignItems: 'center' }, summaryLabel: { fontSize: 16, color: '#888', marginBottom: 5 }, summaryValue: { fontSize: 32, fontWeight: 'bold', color: '#27ae60' }, divider: { height: 1, backgroundColor: '#eee', width: '100%', marginVertical: 15 }, row: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' }, subLabel: { fontSize: 16, color: '#555', fontWeight: '500' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginLeft: 16, marginBottom: 10 },
  topItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 12, marginVertical: 6, borderRadius: 12, elevation: 2 },
  rankBadge: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#FF6B35', alignItems: 'center', justifyContent: 'center' }, rankText: { color: '#fff', fontWeight: 'bold' }, topName: { fontSize: 16, fontWeight: '600', color: '#333' }, topQty: { fontSize: 14, color: '#888' }, topRevenue: { fontSize: 16, fontWeight: 'bold', color: '#27ae60' },
  emptyText: { textAlign: 'center', color: '#999', marginTop: 20, fontSize: 16 }
});