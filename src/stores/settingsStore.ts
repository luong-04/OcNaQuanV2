import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { supabase } from '../services/supabase';

export type PrinterId = 'printer1' | 'printer2' | null;

export interface SettingsState {
  // Tất cả dữ liệu này sẽ được đồng bộ Server
  shopName: string;
  address: string;
  phone: string;
  thankYouMessage: string;
  bankId: string;
  accountNo: string;
  rawVietQR: string; 
  isVatEnabled: boolean;
  vatPercent: number;
  printer1: string; 
  printer2: string;
  kitchenPrinterId: PrinterId;
  paymentPrinterId: PrinterId;
  
  // Chỉ còn 1 hàm update duy nhất cho mọi thứ
  updateServerSettings: (settings: Partial<SettingsState>) => Promise<void>;
  setSettings: (settings: Partial<SettingsState>) => void; // Giữ lại hàm này để tương thích code cũ nếu cần
  syncWithServer: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      // Giá trị mặc định
      shopName: 'Ốc Na Quán',
      address: 'Địa chỉ mặc định',
      phone: '',
      thankYouMessage: 'Cảm ơn quý khách!',
      bankId: 'MB', 
      accountNo: '',
      rawVietQR: '', 
      isVatEnabled: false,
      vatPercent: 8,
      printer1: '192.168.1.200',
      printer2: '',
      kitchenPrinterId: 'printer1',
      paymentPrinterId: 'printer1',

      // Giữ lại hàm này để code UI cũ không bị lỗi, nhưng bản chất nó chỉ set local
      setSettings: (settings) => set((state) => ({ ...state, ...settings })),

      // 1. Kéo TẤT CẢ thông tin từ Server về
      syncWithServer: async () => {
        try {
          const { data, error } = await supabase
            .from('restaurant_settings')
            .select('*')
            .eq('id', 1)
            .single();
            
          if (data) {
            // [QUAN TRỌNG] Ép kiểu "as any" để TypeScript không báo lỗi thiếu cột
            const d = data as any; 

            set({
              // Máy in
              printer1: d.printer1 || '',
              printer2: d.printer2 || '',
              kitchenPrinterId: d.kitchen_printer_id as PrinterId,
              paymentPrinterId: d.payment_printer_id as PrinterId,
              
              // Thông tin quán (Mới thêm)
              shopName: d.shop_name || '',
              address: d.address || '',
              phone: d.phone || '',
              thankYouMessage: d.thank_you_message || '',
              
              // Ngân hàng & VAT (Mới thêm)
              bankId: d.bank_id || 'MB',
              accountNo: d.account_no || '',
              rawVietQR: d.raw_viet_qr || '',
              isVatEnabled: d.is_vat_enabled || false,
              vatPercent: d.vat_percent || 0,
            });
            console.log("Đã đồng bộ toàn bộ cài đặt từ Server!");
          }
        } catch (e) {
          console.log("Lỗi sync settings:", e);
        }
      },

      // 2. Lưu TẤT CẢ lên Server
      updateServerSettings: async (newSettings) => {
        // Cập nhật Local ngay cho mượt
        set((state) => ({ ...state, ...newSettings }));
        
        // Lấy state mới nhất
        const s = { ...get(), ...newSettings };

        try {
          // Gửi lên Supabase (Mapping tên biến App -> tên cột Database)
          // [QUAN TRỌNG] Dùng "as any" ở đây để TypeScript cho phép gửi các cột mới
          const payload: any = {
            id: 1,
            // Máy in
            printer1: s.printer1,
            printer2: s.printer2,
            kitchen_printer_id: s.kitchenPrinterId,
            payment_printer_id: s.paymentPrinterId,
            
            // Thông tin quán
            shop_name: s.shopName,
            address: s.address,
            phone: s.phone,
            thank_you_message: s.thankYouMessage,
            
            // Ngân hàng & VAT
            bank_id: s.bankId,
            account_no: s.accountNo,
            raw_viet_qr: s.rawVietQR,
            is_vat_enabled: s.isVatEnabled,
            vat_percent: s.vatPercent
          };

          await supabase.from('restaurant_settings').upsert(payload);
        } catch (e) {
          console.log("Lỗi lưu settings server:", e);
        }
      }
    }),
    {
      name: 'ocna-settings-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);