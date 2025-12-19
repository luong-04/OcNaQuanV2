// File: src/api/reportApi.ts
import { supabase } from '../services/supabase';

// Định nghĩa kiểu dữ liệu trả về
interface SalesReportResponse {
  total_revenue: number;
  total_orders: number;
  total_items: number;
  top_items: {
    menu_item_id: number;
    total_quantity: number;
    total_revenue: number;
    menu_items: {
      name: string;
    } | null;
  }[];
}

export const fetchSalesReport = async (startDate: string, endDate: string) => {
  // 1. XỬ LÝ NGÀY GIỜ CHO CHUẨN (QUAN TRỌNG)
  // startDate -> Bắt đầu từ 00:00:00
  const start = `${startDate}T00:00:00`;
  // endDate -> Kết thúc lúc 23:59:59.999
  const end = `${endDate}T23:59:59.999`;

  console.log('Fetching report:', start, '->', end);

  // 2. Gọi RPC
  const { data, error } = await supabase.rpc('get_sales_report', {
    start_date_input: start,
    end_date_input: end,
  });

  if (error) {
    console.error('Lỗi lấy báo cáo:', error);
    throw new Error(error.message);
  }

  // 3. Ép kiểu dữ liệu
  const reportData = data as unknown as SalesReportResponse;

  return {
    totalRevenue: reportData?.total_revenue || 0,
    totalOrders: reportData?.total_orders || 0,
    totalItems: reportData?.total_items || 0,
    topItems: reportData?.top_items || [],
  };
};