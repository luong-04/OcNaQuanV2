import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Banknote, Eye, Minus, Plus, Save } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, FlatList, Keyboard, KeyboardAvoidingView, Modal,
  Platform, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, TouchableWithoutFeedback, View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { fetchCategories, fetchMenuItems, MenuItemWithCategory } from '../../src/api/menuApi';
import {
  confirmKitchenPrint,
  createOrder,
  fetchOpenOrderForTable,
  updateOrderStatus,
  upsertOrderItems
} from '../../src/api/orderApi';
import {
  Calculations,
  printKitchenBill,
  printKitchenCancellation,
  printPaymentBill,
  sharePaymentBill
} from '../../src/services/printService';
import { useSettingsStore } from '../../src/stores/settingsStore';

type ActiveTab = 'menu' | 'cart';

const CANCEL_REASONS = ["Khách đổi món", "Khách hủy món", "NV nhập sai", "Hết món"];

export default function OrderScreen() {
  const { tableName } = useLocalSearchParams<{ tableName: string }>();
  const queryClient = useQueryClient();
  
  // State
  const [activeTab, setActiveTab] = useState<ActiveTab>('menu');
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  
  const [cartItems, setCartItems] = useState<Map<number, number>>(new Map());
  const [sentItems, setSentItems] = useState<Map<number, number>>(new Map());
  const [discountAmount, setDiscountAmount] = useState(0);

  // Modal Hủy
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [tempDiffData, setTempDiffData] = useState<{
    newItems: Map<number, number>,
    cancelItems: Map<number, number>,
    allIdsToSync: number[]
  } | null>(null);

  const { isVatEnabled, vatPercent } = useSettingsStore(useShallow(state => ({ 
    isVatEnabled: state.isVatEnabled, vatPercent: state.vatPercent 
  })));

  // Query Data
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });
  const { data: menuItems } = useQuery({ queryKey: ['menuItems'], queryFn: fetchMenuItems });
  const { data: orderData } = useQuery({
    queryKey: ['order', tableName],
    queryFn: () => fetchOpenOrderForTable(tableName!),
    enabled: !!tableName,
  });

  // Reset dữ liệu khi vào bàn mới
  useEffect(() => {
    setCartItems(new Map());
    setSentItems(new Map());
    setDiscountAmount(0);
    setActiveTab('menu');
  }, [tableName]);

  useEffect(() => {
    if (orderData) {
      const currentMap = new Map<number, number>();
      const sentMap = new Map<number, number>();
      
      orderData.order_items.forEach(item => {
          if (item.menu_item_id) {
            currentMap.set(item.menu_item_id, item.quantity);
            sentMap.set(item.menu_item_id, item.sent_quantity || 0);
          }
      });
      setCartItems(currentMap);
      setSentItems(sentMap);
    } else {
      setCartItems(new Map());
      setSentItems(new Map());
      setDiscountAmount(0);
    }
  }, [orderData]);

  const allMenuItems = useMemo(() => {
    if (!menuItems) return [];
    let items = menuItems;
    if (selectedCategory) items = items.filter(i => i.category_id === selectedCategory);
    if (search) items = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
    return items;
  }, [menuItems, selectedCategory, search]);

  // --- [SỬA LẠI CÁCH TÍNH TIỀN: GIẢM GIÁ SAU THUẾ] ---
  const calculations: Calculations = useMemo(() => {
    if (!menuItems) return { subtotal: 0, discountAmount: 0, vatAmount: 0, finalTotal: 0 };
    
    let subtotal = 0;
    cartItems.forEach((qty, id) => {
      const item = menuItems.find(m => m.id === id);
      if (item) subtotal += item.price * qty;
    });

    // 1. Tính VAT trên tổng tiền món (trước khi giảm giá)
    const vatAmount = isVatEnabled ? subtotal * (vatPercent / 100) : 0;
    
    // 2. Tổng có thuế
    const totalWithVat = subtotal + vatAmount;

    // 3. Trừ giảm giá (Final = Tổng có thuế - Giảm giá)
    const finalTotal = Math.max(0, totalWithVat - discountAmount);

    return { subtotal, discountAmount, vatAmount, finalTotal };
  }, [cartItems, menuItems, discountAmount, isVatEnabled, vatPercent]);

  const updateQty = (id: number, delta: number) => {
    setCartItems(prev => {
      const next = new Map(prev);
      const current = next.get(id) || 0;
      const newQty = Math.max(0, current + delta);
      if (newQty === 0) next.delete(id);
      else next.set(id, newQty);
      return next;
    });
  };

  const handleProcessOrder = () => {
    if (!menuItems) return;
    const newItemsToPrint = new Map<number, number>();
    const cancelItemsToPrint = new Map<number, number>();
    const itemsToUpsert: { menu_item_id: number, quantity: number, price: number }[] = [];
    const idsToSync: number[] = [];

    cartItems.forEach((qty, id) => {
        const sentQty = sentItems.get(id) || 0;
        const itemInfo = menuItems.find(m => m.id === id);
        if (itemInfo) {
            itemsToUpsert.push({ menu_item_id: id, quantity: qty, price: itemInfo.price });
            idsToSync.push(id);
            if (qty > sentQty) newItemsToPrint.set(id, qty - sentQty);
            else if (qty < sentQty) cancelItemsToPrint.set(id, sentQty - qty);
        }
    });

    sentItems.forEach((sentQty, id) => {
        if (!cartItems.has(id) && sentQty > 0) {
            cancelItemsToPrint.set(id, sentQty);
            itemsToUpsert.push({ menu_item_id: id, quantity: 0, price: 0 });
            idsToSync.push(id);
        }
    });

    if (itemsToUpsert.length === 0 && !orderData) { Alert.alert("Lỗi", "Vui lòng chọn món"); return; }

    // --- [SỬA] CHECK THAY ĐỔI ---
    // Nếu không có món mới VÀ không có món hủy -> Báo "Không đổi" và Dừng.
    if (newItemsToPrint.size === 0 && cancelItemsToPrint.size === 0) {
        Alert.alert("Thông báo", "Không có thay đổi nào cần báo Bếp.");
        return; 
    }

    setTempDiffData({ newItems: newItemsToPrint, cancelItems: cancelItemsToPrint, allIdsToSync: idsToSync });

    if (cancelItemsToPrint.size > 0) setShowCancelModal(true);
    else executeSaveAndPrint(itemsToUpsert, newItemsToPrint, null, idsToSync);
  };

  const executeSaveAndPrint = async (upsertData: any[], printNewMap: Map<number, number>, printCancelMap: Map<number, number> | null, syncIds: number[], reason: string = "") => {
      try {
          let currentOrderId = orderData?.id;
          if (!currentOrderId) {
              const newOrder = await createOrder(tableName!);
              currentOrderId = newOrder.id;
          }
          const formattedItems = upsertData.map(i => ({ menu_item_id_input: i.menu_item_id, quantity_input: i.quantity }));
          await upsertOrderItems({ order_id_input: currentOrderId!, items_input: formattedItems });

          if (printNewMap.size > 0 && menuItems) await printKitchenBill(tableName!, printNewMap, menuItems);
          if (printCancelMap && printCancelMap.size > 0 && menuItems) await printKitchenCancellation(tableName!, printCancelMap, menuItems, reason);
          if (syncIds.length > 0) await confirmKitchenPrint(currentOrderId!, syncIds);

          Alert.alert("Thành công", "Đã gửi Bếp & Cập nhật đơn!");
          setCancelReason("");
          setShowCancelModal(false);
          setTempDiffData(null);
          queryClient.invalidateQueries({ queryKey: ['order', tableName] });
          setActiveTab('cart');
      } catch (e: any) { Alert.alert("Lỗi", e.message); }
  };

  const handleConfirmCancel = () => {
      if (!tempDiffData) return;
      const upData: any[] = [];
      cartItems.forEach((qty, id) => {
          const item = menuItems?.find(m => m.id === id);
          if (item) upData.push({ menu_item_id: id, quantity: qty, price: item.price });
      });
      sentItems.forEach((sentQty, id) => {
        if (!cartItems.has(id) && sentQty > 0) upData.push({ menu_item_id: id, quantity: 0, price: 0 });
      });
      executeSaveAndPrint(upData, tempDiffData.newItems, tempDiffData.cancelItems, tempDiffData.allIdsToSync, cancelReason || "Khách hủy");
  };

  const handlePay = () => {
    let hasUnsavedChanges = false;
    cartItems.forEach((qty, id) => { if (qty !== (sentItems.get(id) || 0)) hasUnsavedChanges = true; });
    sentItems.forEach((qty, id) => { if (!cartItems.has(id) && qty > 0) hasUnsavedChanges = true; });

    if (hasUnsavedChanges) {
        Alert.alert("Cảnh báo", "Bạn có thay đổi chưa báo Bếp. Vui lòng cập nhật trước khi thanh toán!");
        return;
    }
    if (!orderData || !orderData.id || !menuItems) return;
    
    printPaymentBill(tableName!, cartItems, menuItems, calculations, async () => {
       await updateOrderStatus(orderData.id!, 'paid', calculations.finalTotal);
       Alert.alert("Thanh toán", "Đã đóng bàn thành công!");
       queryClient.removeQueries({ queryKey: ['order', tableName] });
       router.back();
    });
  };

  const handlePreviewBill = () => {
    if (!menuItems) return;
    sharePaymentBill(tableName!, cartItems, menuItems, calculations);
  }

  const renderMenuItem = ({ item }: { item: MenuItemWithCategory }) => {
    const qty = cartItems.get(item.id) || 0;
    const sentQty = sentItems.get(item.id) || 0;
    const isChanged = qty !== sentQty;
    return (
      <View style={[styles.menuItem, isChanged && { borderColor: '#FF6B35', borderWidth: 1 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.menuItemName}>{item.name}</Text>
          <Text style={styles.menuItemPrice}>{item.price.toLocaleString('vi-VN')} đ</Text>
          {sentQty > 0 && <Text style={{fontSize:11, color:'green'}}>Đã gọi: {sentQty}</Text>}
        </View>
        <View style={styles.qtyControl}>
          {qty > 0 && (<><TouchableOpacity onPress={() => updateQty(item.id, -1)}><Minus size={24} color="#e74c3c" /></TouchableOpacity><Text style={styles.qtyText}>{qty}</Text></>)}
          <TouchableOpacity onPress={() => updateQty(item.id, 1)}><Plus size={24} color="#27ae60" /></TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Bàn: {tableName}</Text>
        <View style={styles.tabs}>
           <TouchableOpacity onPress={() => setActiveTab('menu')} style={[styles.tab, activeTab === 'menu' && styles.activeTab]}><Text style={styles.tabText}>Thực đơn</Text></TouchableOpacity>
           <TouchableOpacity onPress={() => setActiveTab('cart')} style={[styles.tab, activeTab === 'cart' && styles.activeTab]}><Text style={styles.tabText}>Kiểm đồ ({cartItems.size})</Text></TouchableOpacity>
        </View>
      </View>

      <View style={styles.contentContainer}>
        {activeTab === 'menu' ? (
          <>
             <TextInput style={styles.searchBar} placeholder="Tìm món..." value={search} onChangeText={setSearch} />
             <View style={{ height: 50 }}>
               <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categories}>
                 <TouchableOpacity onPress={() => setSelectedCategory(null)} style={[styles.catChip, selectedCategory === null && styles.activeCatChip]}><Text style={[styles.catText, selectedCategory === null && styles.activeCatText]}>Tất cả</Text></TouchableOpacity>
                 {categories?.map(c => (
                   <TouchableOpacity key={c.id} onPress={() => setSelectedCategory(c.id)} style={[styles.catChip, selectedCategory === c.id && styles.activeCatChip]}><Text style={[styles.catText, selectedCategory === c.id && styles.activeCatText]}>{c.name}</Text></TouchableOpacity>
                 ))}
               </ScrollView>
             </View>
             <FlatList data={allMenuItems} keyExtractor={i => i.id.toString()} renderItem={renderMenuItem} contentContainerStyle={{ padding: 10, paddingBottom: 20 }} />
          </>
        ) : (
          <View style={{ flex: 1, padding: 10 }}>
             <FlatList 
                data={Array.from(cartItems.entries())} 
                keyExtractor={i => i[0].toString()} 
                renderItem={({item}) => {
                    const menuItem = menuItems?.find(m => m.id === item[0]);
                    if(!menuItem) return null;
                    const sentQty = sentItems.get(item[0]) || 0;
                    const diff = item[1] - sentQty;
                    return (
                        <View style={styles.cartItem}>
                            <View style={{flex:1}}>
                                <Text style={styles.cartItemName}>{menuItem.name}</Text>
                                {sentQty > 0 && <Text style={{fontSize:12, color:'#777'}}>Đã Bếp: {sentQty}</Text>}
                                {diff !== 0 && (<Text style={{fontSize:12, color: diff > 0 ? 'blue' : 'red', fontWeight:'bold'}}>{diff > 0 ? `(Thêm ${diff})` : `(Hủy ${Math.abs(diff)})`}</Text>)}
                            </View>
                            <View style={styles.cartQtyRow}>
                                <TouchableOpacity onPress={() => updateQty(menuItem.id, -1)}><Minus size={20} color="#e74c3c" /></TouchableOpacity>
                                <Text style={styles.qtyText}>{item[1]}</Text>
                                <TouchableOpacity onPress={() => updateQty(menuItem.id, 1)}><Plus size={20} color="#27ae60" /></TouchableOpacity>
                            </View>
                            <Text style={styles.cartItemTotal}>{(menuItem.price * item[1]).toLocaleString()} đ</Text>
                        </View>
                    );
                }} 
             />
             <View style={styles.calculationsContainer}>
                <View style={styles.calcRow}>
                    <Text style={styles.calcLabel}>Tạm tính:</Text>
                    <Text style={styles.calcValue}>{calculations.subtotal.toLocaleString()} đ</Text>
                </View>
                
                {/* --- [SỬA] GIAO DIỆN NHẬP GIẢM GIÁ --- */}
                <View style={styles.calcRow}>
                    <Text style={styles.calcLabel}>Giảm giá (VNĐ):</Text>
                    <TextInput 
                        style={[styles.discountInput, { width: 100, fontWeight: 'bold', color: 'red' }]} 
                        keyboardType="numeric" 
                        
                        // [SỬA 1] Hiển thị số có dấu chấm (VD: 10.000)
                        // Nếu số là 0 thì để trống để hiện placeholder, ngược lại format tiếng Việt
                        value={discountAmount > 0 ? discountAmount.toLocaleString('vi-VN') : ''} 
                        
                        // [SỬA 2] Khi nhập, xóa dấu chấm đi rồi mới lưu vào State
                        onChangeText={(text) => {
                            // Xóa tất cả dấu chấm (.) trong chuỗi nhập vào
                            const cleanValue = text.replace(/\./g, '');
                            // Chuyển thành số, nếu lỗi (NaN) thì về 0
                            setDiscountAmount(Number(cleanValue) || 0);
                        }} 
                        
                        placeholder="0"
                    />
                </View>

                {isVatEnabled && (
                    <View style={styles.calcRow}>
                        <Text style={styles.calcLabel}>VAT ({vatPercent}%):</Text>
                        <Text style={styles.calcValue}>{calculations.vatAmount.toLocaleString()} đ</Text>
                    </View>
                )}
                <View style={styles.finalTotalRow}>
                    <Text style={styles.finalTotalLabel}>TỔNG CỘNG:</Text>
                    <Text style={styles.finalTotalValue}>{calculations.finalTotal.toLocaleString()} đ</Text>
                </View>
             </View>
          </View>
        )}
      </View>

      <View style={styles.footer}>
         <TouchableOpacity style={[styles.payBtn, {backgroundColor: '#2980b9', marginRight: 5}]} onPress={handleProcessOrder}>
             <View style={{flexDirection:'row', gap: 5, justifyContent:'center', alignItems:'center'}}>
                <Save color="#fff" size={20} />
                <Text style={styles.btnText}>Bếp</Text>
             </View>
         </TouchableOpacity>

         {activeTab === 'cart' && (
            <>
                <TouchableOpacity style={[styles.payBtn, {backgroundColor: '#7f8c8d', marginHorizontal: 5}]} onPress={handlePreviewBill}>
                    <View style={{flexDirection:'row', gap: 5, justifyContent:'center', alignItems:'center'}}>
                        <Eye color="#fff" size={20} />
                        <Text style={styles.btnText}>Xem Bill</Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.payBtn, {backgroundColor: '#e67e22', marginLeft: 5}]} onPress={handlePay}>
                    <View style={{flexDirection:'row', gap: 5, justifyContent:'center', alignItems:'center'}}>
                        <Banknote color="#fff" size={20} />
                        <Text style={styles.btnText}>Thanh Toán</Text>
                    </View>
                </TouchableOpacity>
            </>
         )}
      </View>

      <Modal visible={showCancelModal} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>⚠️ CẢNH BÁO HỦY MÓN</Text>
                    <Text style={styles.modalSub}>Vui lòng chọn lý do để in phiếu Hủy:</Text>
                    <View style={{backgroundColor:'#eee', padding:10, borderRadius:5, marginBottom:10, maxHeight: 100}}>
                        <ScrollView>
                            {tempDiffData && Array.from(tempDiffData.cancelItems.entries()).map(([id, qty]) => {
                                const m = menuItems?.find(x => x.id === id);
                                return <Text key={id} style={{color:'red'}}>• {m?.name}: -{qty}</Text>
                            })}
                        </ScrollView>
                    </View>
                    <View style={styles.reasonTags}>
                        {CANCEL_REASONS.map(reason => (
                            <TouchableOpacity key={reason} style={[styles.reasonTag, cancelReason === reason && styles.activeReasonTag]} onPress={() => setCancelReason(reason)}>
                                <Text style={[styles.reasonText, cancelReason === reason && styles.activeReasonText]}>{reason}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <TextInput style={styles.reasonInput} placeholder="Lý do khác..." value={cancelReason} onChangeText={setCancelReason} />
                    <View style={styles.modalActions}>
                        <TouchableOpacity style={[styles.modalBtn, {backgroundColor: '#95a5a6'}]} onPress={() => { setShowCancelModal(false); setTempDiffData(null); }}><Text style={{color:'#fff'}}>Quay lại</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.modalBtn, {backgroundColor: '#c0392b'}]} onPress={handleConfirmCancel}><Text style={{color:'#fff', fontWeight:'bold'}}>Xác nhận Hủy & In</Text></TouchableOpacity>
                    </View>
                </View>
            </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { padding: 16, paddingTop: 40, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 10 },
  tabs: { flexDirection: 'row', backgroundColor: '#f0f0f0', borderRadius: 8, padding: 4 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 }, activeTab: { backgroundColor: '#fff', elevation: 2 }, tabText: { color: '#777', fontWeight: '600' }, 
  contentContainer: { flex: 1 },
  searchBar: { backgroundColor: '#fff', margin: 10, padding: 10, borderRadius: 8, elevation: 1 },
  categories: { paddingHorizontal: 10 }, catChip: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#e0e0e0', borderRadius: 20, marginRight: 8, height: 36 }, activeCatChip: { backgroundColor: '#FF6B35' }, catText: { color: '#333' }, activeCatText: { color: '#fff', fontWeight: 'bold' },
  menuItem: { flexDirection: 'row', backgroundColor: '#fff', padding: 12, marginHorizontal: 10, marginBottom: 8, borderRadius: 8, alignItems: 'center', elevation: 1 }, menuItemName: { fontSize: 16, fontWeight: '500' }, menuItemPrice: { color: '#FF6B35', fontWeight: 'bold' }, qtyControl: { flexDirection: 'row', alignItems: 'center', gap: 12 }, qtyText: { fontSize: 16, fontWeight: 'bold', width: 24, textAlign: 'center' },
  cartItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, backgroundColor: '#fff', marginBottom: 1, alignItems: 'center' }, cartItemName: { flex: 1, fontSize: 15, fontWeight:'600' }, cartQtyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, cartItemTotal: { fontSize: 15, fontWeight: 'bold', width: 80, textAlign: 'right' },
  calculationsContainer: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginTop: 10 }, calcRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }, calcLabel: { color: '#555' }, calcValue: { fontWeight: '600' }, discountInput: { backgroundColor: '#f0f0f0', padding: 4, borderRadius: 4, width: 80, textAlign: 'right' }, finalTotalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderColor: '#eee' }, finalTotalLabel: { fontSize: 18, fontWeight: 'bold' }, finalTotalValue: { fontSize: 18, fontWeight: 'bold', color: '#FF6B35' },
  footer: { padding: 10, paddingBottom: Platform.OS === 'ios' ? 20 : 10, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#eee', flexDirection: 'row', alignItems: 'center' },
  payBtn: { flex: 1, padding: 14, borderRadius: 8, alignItems: 'center' }, btnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 5, color: '#e74c3c' },
  modalSub: { textAlign: 'center', color: '#666', marginBottom: 15 },
  reasonTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15, justifyContent: 'center' },
  reasonTag: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#ddd' }, activeReasonTag: { backgroundColor: '#ffebee', borderColor: '#e74c3c' }, reasonText: { fontSize: 13, color: '#333' }, activeReasonText: { color: '#e74c3c', fontWeight: 'bold' },
  reasonInput: { backgroundColor: '#f9f9f9', borderWidth: 1, borderColor: '#eee', padding: 12, borderRadius: 8, marginBottom: 20 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  modalBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
});