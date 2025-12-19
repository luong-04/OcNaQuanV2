import { Picker } from '@react-native-picker/picker';
import { useFocusEffect } from 'expo-router';
import { Check, ChevronDown, ChevronRight, Save } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Keyboard, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { useAuth } from '../../src/auth/AuthContext';
import { supabase } from '../../src/services/supabase';
import { useSettingsStore } from '../../src/stores/settingsStore';

const BANK_LIST = [
  { label: 'MB Bank (Quân Đội)', value: 'MB' },
  { label: 'Vietcombank', value: 'VCB' },
  { label: 'VietinBank', value: 'ICB' },
  { label: 'BIDV', value: 'BIDV' },
  { label: 'Agribank', value: 'VBA' },
  { label: 'Techcombank', value: 'TCB' },
  { label: 'ACB', value: 'ACB' },
  { label: 'Sacombank', value: 'STB' },
  { label: 'TPBank', value: 'TPB' },
];

const SettingInput = ({ label, value, onSave, placeholder, keyboardType = 'default', multiline = false }: any) => {
    const [localValue, setLocalValue] = useState(value);
    useEffect(() => { setLocalValue(value); }, [value]);
  
    const handlePressSave = () => {
      Keyboard.dismiss();
      onSave(localValue);
      Alert.alert("Thành công", `Đã lưu ${label} lên hệ thống!`);
    };
  
    return (
      <View style={{ marginBottom: 15 }}>
        <Text style={styles.label}>{label}</Text>
        <View style={{ flexDirection: 'row', alignItems: multiline ? 'flex-start' : 'center' }}>
          <TextInput
            style={[styles.input, { flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0 }, multiline && { height: 80, textAlignVertical: 'top' }]}
            value={String(localValue)}
            onChangeText={setLocalValue}
            placeholder={placeholder}
            keyboardType={keyboardType}
            multiline={multiline}
          />
          <TouchableOpacity 
            style={[styles.saveBtn, multiline && { height: 80 }]} 
            onPress={handlePressSave}
          >
            <Check size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
};

const CollapsibleSection = ({ title, children, startOpen = false }: any) => {
  const [isOpen, setIsOpen] = useState(startOpen);
  return (
    <View style={styles.section}>
      <Pressable style={styles.collapsibleHeader} onPress={() => setIsOpen(!isOpen)}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {isOpen ? <ChevronDown color="#555" /> : <ChevronRight color="#555" />}
      </Pressable>
      {isOpen && <View style={styles.collapsibleContent}>{children}</View>}
    </View>
  );
};

export default function SettingsScreen() {
  const [isLoading, setIsLoading] = useState(false);
  const { role } = useAuth(); 
  const store = useSettingsStore(useShallow((state) => state));

  useFocusEffect(
    useCallback(() => {
        store.syncWithServer(); 
    }, [])
  );

  const handleLogout = async () => {
    setIsLoading(true);
    await supabase.auth.signOut();
    setIsLoading(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={{flexDirection:'row', justifyContent:'center', alignItems:'center', marginBottom:20}}>
          <Text style={styles.header}>Cài Đặt</Text>
          <TouchableOpacity onPress={() => { store.syncWithServer(); Alert.alert("Đồng bộ","Đã tải dữ liệu mới nhất từ Cloud!"); }} style={{position:'absolute', right: 0}}>
             <Save color="#FF6B35" size={24}/>
          </TouchableOpacity>
      </View>

      {role === 'admin' && (
        <>
          <CollapsibleSection title="Thông tin quán (Lưu Cloud)" startOpen={true}>
            <SettingInput label="Tên cửa hàng" value={store.shopName} onSave={(v: any) => store.updateServerSettings({ shopName: v })} />
            <SettingInput label="Địa chỉ" value={store.address} onSave={(v: any) => store.updateServerSettings({ address: v })} />
            <SettingInput label="Số điện thoại" value={store.phone} onSave={(v: any) => store.updateServerSettings({ phone: v })} keyboardType="phone-pad" />
            <SettingInput label="Lời cảm ơn" value={store.thankYouMessage} onSave={(v: any) => store.updateServerSettings({ thankYouMessage: v })} />
          </CollapsibleSection>

          <CollapsibleSection title="Cài đặt Máy in (IP)">
            <SettingInput 
                label="IP Máy in 1 (Chính)" 
                value={store.printer1} 
                onSave={(v: any) => store.updateServerSettings({ printer1: v })} 
                placeholder="VD: 192.168.1.200" 
                keyboardType="default"
            />
            <SettingInput 
                label="IP Máy in 2 (Phụ)" 
                value={store.printer2} 
                onSave={(v: any) => store.updateServerSettings({ printer2: v })} 
                placeholder="VD: 192.168.1.201" 
                keyboardType="default"
            />

            <Text style={styles.label}>Máy in BẾP dùng:</Text>
            <View style={styles.pickerContainer}>
              <Picker 
                selectedValue={store.kitchenPrinterId} 
                onValueChange={(val) => {
                    store.updateServerSettings({ kitchenPrinterId: val });
                    Alert.alert("Đã lưu", "Cấu hình máy in bếp đã cập nhật!");
                }}
              >
                <Picker.Item label="Không in" value={null} />
                <Picker.Item label="Máy in 1" value="printer1" />
                <Picker.Item label="Máy in 2" value="printer2" />
              </Picker>
            </View>

            <Text style={styles.label}>Máy in HÓA ĐƠN dùng:</Text>
            <View style={styles.pickerContainer}>
              <Picker 
                selectedValue={store.paymentPrinterId} 
                onValueChange={(val) => {
                    store.updateServerSettings({ paymentPrinterId: val });
                    Alert.alert("Đã lưu", "Cấu hình máy in hóa đơn đã cập nhật!");
                }}
              >
                <Picker.Item label="Không in" value={null} />
                <Picker.Item label="Máy in 1" value="printer1" />
                <Picker.Item label="Máy in 2" value="printer2" />
              </Picker>
            </View>
          </CollapsibleSection>

          <CollapsibleSection title="Thanh toán QR (Lưu Cloud)">
            <Text style={styles.label}>Ngân hàng</Text>
            <View style={styles.pickerContainer}>
              <Picker selectedValue={store.bankId} onValueChange={(val) => {
                  store.updateServerSettings({ bankId: val });
                  Alert.alert("Đã lưu", "Ngân hàng đã được cập nhật!");
              }}>
                {BANK_LIST.map(b => <Picker.Item key={b.value} label={b.label} value={b.value} />)}
              </Picker>
            </View>
            
            <SettingInput 
                label="Số tài khoản" 
                value={store.accountNo} 
                onSave={(v: any) => store.updateServerSettings({ accountNo: v })} 
                keyboardType="numeric" 
            />
            {/* ĐÃ XÓA Ô NHẬP MÃ QR GỐC Ở ĐÂY */}
          </CollapsibleSection>

          <CollapsibleSection title="Cài đặt VAT (Lưu Cloud)">
            <View style={styles.switchRow}>
              <Text style={styles.label}>Bật VAT</Text>
              <Switch 
                value={store.isVatEnabled} 
                onValueChange={(val) => {
                    store.updateServerSettings({ isVatEnabled: val });
                    Alert.alert("Đã lưu", val ? "Đã bật tính thuế" : "Đã tắt tính thuế");
                }} 
              />
            </View>
            {store.isVatEnabled && (
               <SettingInput 
                 label="Phần trăm VAT (%)" 
                 value={store.vatPercent} 
                 onSave={(v: any) => store.updateServerSettings({ vatPercent: Number(v) })} 
                 keyboardType="numeric"
               />
            )}
          </CollapsibleSection>
        </>
      )}

      <View style={styles.logoutSection}>
        <Button title={isLoading ? 'Đang đăng xuất...' : 'Đăng Xuất'} onPress={handleLogout} color="#e74c3c" disabled={isLoading} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 50, paddingHorizontal: 20, backgroundColor: '#f9f9f9' },
  header: { fontSize: 28, fontWeight: 'bold', color: '#FF6B35', textAlign: 'center' },
  section: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 20, elevation: 2, overflow: 'hidden' },
  collapsibleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  collapsibleContent: { padding: 16, paddingTop: 0 },
  sectionTitle: { fontSize: 20, fontWeight: '600', color: '#333' },
  label: { fontSize: 16, color: '#555', marginBottom: 5, marginTop: 5 },
  input: { backgroundColor: '#f0f0f0', borderRadius: 8, padding: 12, fontSize: 16, color:'#333' },
  saveBtn: { backgroundColor: '#27ae60', padding: 12, borderTopRightRadius: 8, borderBottomRightRadius: 8, justifyContent: 'center', alignItems: 'center', width: 50 },
  pickerContainer: { backgroundColor: '#f0f0f0', borderRadius: 8, marginBottom: 12 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  logoutSection: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 20, elevation: 2 },
});