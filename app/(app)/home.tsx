// File: app/(app)/home.tsx
import { useQueryClient } from '@tanstack/react-query'; // QUAN TRỌNG: Import này để fix lỗi cache
import { Stack, router, useFocusEffect } from 'expo-router';
import { Armchair, ArrowRightLeft, LogOut, Plus, Trash2, X } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList,
  Modal,
  Image as RNImage,
  StyleSheet, Text,
  TextInput,
  TouchableOpacity, View
} from 'react-native';
import { addTable, deleteTable } from '../../src/api/homeApi';
import { moveTable } from '../../src/api/orderApi';
import { useAuth } from '../../src/auth/AuthContext';
import { supabase } from '../../src/services/supabase';

type Table = {
  id: number;
  name: string;
  status: 'empty' | 'occupied'; 
};

export default function HomeScreen() {
  const { role } = useAuth();
  const queryClient = useQueryClient(); // Khởi tạo hook
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [moveModalVisible, setMoveModalVisible] = useState(false);
  const [selectedSourceTable, setSelectedSourceTable] = useState<Table | null>(null);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [menuModalVisible, setMenuModalVisible] = useState(false);
  const [selectedMenuTable, setSelectedMenuTable] = useState<Table | null>(null);

  const fetchTables = async () => {
    try {
      // Không setLoading(true) để tránh nháy màn hình khi refresh ngầm
      const { data } = await supabase
        .from('tables')
        .select('*')
        .order('id', { ascending: true });

      if (data) {
        const sortedData = data.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        const mappedTables: Table[] = sortedData.map((item: any) => ({
          id: item.id,
          name: item.name,
          status: item.status === 'occupied' ? 'occupied' : 'empty', 
        }));
        setTables(mappedTables); 
      }
    } catch (err) {
      console.log(err);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchTables();
    }, [])
  );

  const handleLogout = async () => {
    Alert.alert('Đăng xuất', 'Bạn có chắc muốn đăng xuất không?', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Đồng ý', style: 'destructive', onPress: async () => await supabase.auth.signOut() }
    ]);
  };

  const handlePressTable = (table: Table) => {
    router.push({
      pathname: '/(app)/order',
      params: { tableId: table.id, tableName: table.name }
    });
  };

  // --- 1. THÊM BÀN (OPTIMISTIC UPDATE - NHANH) ---
  const handleAddTable = async () => {
    if (!newTableName.trim()) return;
    const tempName = newTableName;
    setAddModalVisible(false);
    setNewTableName('');

    // Cập nhật giao diện ngay lập tức (Ép kiểu status để fix lỗi TS)
    const optimisticTable: Table = { id: Date.now(), name: tempName, status: 'empty' as 'empty' };
    
    setTables(prev => [...prev, optimisticTable].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })));

    try {
      await addTable(tempName); 
      // Fetch lại ngầm để đồng bộ ID thật
      fetchTables(); 
    } catch (error: any) {
      Alert.alert("Lỗi", error.message);
      fetchTables(); // Rollback nếu lỗi
    }
  };

  // --- 2. XÓA BÀN (OPTIMISTIC UPDATE - NHANH) ---
  const onSelectDelete = () => {
    if (!selectedMenuTable) return;
    if (role !== 'admin') { Alert.alert("Quyền hạn", "Chỉ Admin mới được xóa bàn."); return; }
    if (selectedMenuTable.status === 'occupied') { Alert.alert("Lỗi", "Bàn đang có khách!"); return; }

    const tableNameToDelete = selectedMenuTable.name;
    
    Alert.alert("Xóa bàn", `Bạn có chắc muốn xóa ${tableNameToDelete}?`, [
      { text: "Hủy", style: "cancel" },
      { text: "Xóa", style: "destructive", onPress: async () => {
          setMenuModalVisible(false);
          
          // Xóa ngay trên giao diện
          setTables(prev => prev.filter(t => t.name !== tableNameToDelete));

          try {
            await deleteTable(tableNameToDelete);
          } catch(e: any) {
            Alert.alert("Lỗi", e.message);
            fetchTables(); // Rollback
          }
      }}
    ]);
  };

  // --- 3. CHUYỂN BÀN (OPTIMISTIC UPDATE + FIX LỖI CACHE) ---
  const confirmMoveTable = async (targetTable: Table) => {
    if (!selectedSourceTable) return;
    const sourceName = selectedSourceTable.name;
    const targetName = targetTable.name;
    
    setMoveModalVisible(false);

    // Cập nhật giao diện ngay lập tức
    setTables(prev => prev.map(t => {
      if (t.name === sourceName) return { ...t, status: 'empty' as 'empty' };
      if (t.name === targetName) return { ...t, status: 'occupied' as 'occupied' };
      return t;
    }));

    try {
      await moveTable(sourceName, targetName);
      
      // --- FIX QUAN TRỌNG: Xóa Cache đơn hàng ---
      // Giúp bàn cũ quên đơn hàng, bàn mới nhận đơn hàng chuẩn
      queryClient.invalidateQueries({ queryKey: ['order'] });
      
      Alert.alert('Thành công', `Đã chuyển từ ${sourceName} sang ${targetName}`);
    } catch (error: any) {
      Alert.alert('Lỗi', error.message);
      fetchTables(); // Rollback
    }
  };

  const handleLongPressTable = (table: Table) => {
    setSelectedMenuTable(table);
    setMenuModalVisible(true);
  };

  const onSelectMove = () => {
    if (selectedMenuTable?.status === 'empty') {
      Alert.alert("Thông báo", "Bàn này đang trống.");
      return;
    }
    setMenuModalVisible(false);
    setSelectedSourceTable(selectedMenuTable);
    setMoveModalVisible(true);
  };

  const renderItem = ({ item }: { item: Table }) => {
    const isOccupied = item.status === 'occupied';
    return (
      <TouchableOpacity 
        style={[styles.card, isOccupied ? styles.cardOccupied : styles.cardEmpty]}
        onPress={() => handlePressTable(item)}
        onLongPress={() => handleLongPressTable(item)} 
        delayLongPress={500} 
      >
        <Armchair size={32} color={isOccupied ? '#fff' : '#FF6B35'} />
        <Text style={[styles.cardText, isOccupied && styles.textOccupied]}>
          {item.name}
        </Text>
        <Text style={[styles.statusText, isOccupied && styles.textOccupied]}>
          {isOccupied ? 'Có khách' : 'Trống'}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{
          headerShown: true,
          title: '', 
          headerTitle: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <RNImage source={require('../../assets/logo.png')} style={{ width: 38, height: 38, marginRight: 10, borderRadius: 10 }} resizeMode="contain" />
              <Text style={{ fontFamily: 'SVN-Bold', fontSize: 20, color: '#FF6B35' }}>Sơ đồ bàn</Text>
            </View>
          ),
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {role === 'admin' && (
                <TouchableOpacity onPress={() => setAddModalVisible(true)} style={{ marginRight: 15 }}>
                  <Plus color="#27ae60" size={28} />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={handleLogout} style={{ marginRight: 10 }}>
                <LogOut color="#333" size={24} />
              </TouchableOpacity>
            </View>
          ),
        }} 
      />

      {loading ? (
        <ActivityIndicator size="large" color="#FF6B35" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={tables}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          numColumns={2} 
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={styles.row}
        />
      )}

      {/* MODAL THÊM */}
      <Modal visible={addModalVisible} transparent animationType="fade" onRequestClose={() => setAddModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Thêm Bàn Mới</Text>
            <TextInput style={styles.input} placeholder="Tên bàn (VD: Mang Về 1)" value={newTableName} onChangeText={setNewTableName} />
            <View style={{flexDirection: 'row', justifyContent: 'flex-end', width: '100%', gap: 10}}>
              <TouchableOpacity style={styles.btnCancel} onPress={() => setAddModalVisible(false)}><Text style={{color: '#555'}}>Hủy</Text></TouchableOpacity>
              <TouchableOpacity style={styles.btnConfirm} onPress={handleAddTable}><Text style={{color: '#fff', fontWeight: 'bold'}}>Thêm</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL MENU */}
      <Modal visible={menuModalVisible} transparent animationType="fade" onRequestClose={() => setMenuModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>{selectedMenuTable?.name}</Text>
            <TouchableOpacity style={styles.menuOption} onPress={onSelectMove}>
              <ArrowRightLeft size={20} color="#3498db" />
              <Text style={styles.menuText}>Chuyển bàn</Text>
            </TouchableOpacity>
            {role === 'admin' && (
              <TouchableOpacity style={[styles.menuOption, {borderBottomWidth: 0}]} onPress={onSelectDelete}>
                <Trash2 size={20} color="#e74c3c" />
                <Text style={[styles.menuText, {color: '#e74c3c'}]}>Xóa bàn</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.closeIcon} onPress={() => setMenuModalVisible(false)}><X size={20} color="#999"/></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL MOVE */}
      <Modal visible={moveModalVisible} transparent animationType="slide" onRequestClose={() => setMoveModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalView, {maxHeight: '80%'}]}>
            <Text style={styles.modalTitle}>Chuyển đến...</Text>
            <FlatList
              data={tables.filter(t => t.status === 'empty' && t.id !== selectedSourceTable?.id)}
              keyExtractor={item => item.id.toString()}
              numColumns={2}
              style={{width: '100%'}}
              renderItem={({item}) => (
                <TouchableOpacity style={styles.targetBtn} onPress={() => confirmMoveTable(item)}>
                  <Text style={styles.targetBtnText}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.btnCancel} onPress={() => setMoveModalVisible(false)}><Text>Hủy bỏ</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  listContent: { padding: 16 },
  row: { justifyContent: 'space-between', marginBottom: 16 },
  card: { width: '48%', padding: 20, borderRadius: 16, alignItems: 'center', justifyContent: 'center', elevation: 3, backgroundColor: '#fff', borderWidth: 1, borderColor: '#eee' },
  cardOccupied: { backgroundColor: '#FF6B35', borderColor: '#FF6B35' },
  cardEmpty: { backgroundColor: '#fff' },
  cardText: { marginTop: 8, fontSize: 18, fontFamily: 'SVN-Bold', color: '#333' },
  statusText: { marginTop: 4, fontSize: 14, color: '#888' },
  textOccupied: { color: '#fff' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalView: { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '90%', alignItems: 'center', elevation: 5 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, color: '#333' },
  input: { width: '100%', backgroundColor: '#f0f0f0', padding: 12, borderRadius: 8, marginBottom: 20 },
  btnCancel: { padding: 10 },
  btnConfirm: { backgroundColor: '#27ae60', padding: 10, borderRadius: 8, paddingHorizontal: 20 },
  menuOption: { flexDirection: 'row', alignItems: 'center', width: '100%', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  menuText: { fontSize: 16, marginLeft: 15, fontWeight: '500' },
  closeIcon: { position: 'absolute', top: 10, right: 10, padding: 5 },
  targetBtn: { backgroundColor: '#27ae60', padding: 12, borderRadius: 8, margin: 5, flex: 1, alignItems: 'center' },
  targetBtnText: { color: '#fff', fontWeight: 'bold' }
});