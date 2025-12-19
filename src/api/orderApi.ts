import { supabase } from '../services/supabase';

export interface OrderItemInput {
  menu_item_id_input: number;
  quantity_input: number;
}

// 1. Tạo đơn hàng
export const createOrder = async (tableName: string) => {
  await supabase
    .from('tables')
    .update({ status: 'occupied' } as any)
    .eq('name', tableName);

  const { data, error } = await supabase
    .from('orders')
    .insert({
      table_name: tableName,
      status: 'served',
      total_amount: 0
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

// 2. Lấy đơn hàng đang mở
export const fetchOpenOrderForTable = async (tableName: string) => {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id, table_name, status, total_amount,
      order_items ( id, menu_item_id, quantity, sent_quantity )
    `)
    .eq('table_name', tableName)
    .eq('status', 'served') // Chỉ lấy đơn trạng thái served
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  
  return data as unknown as {
    id: number;
    table_name: string;
    status: string;
    total_amount: number;
    order_items: {
      id: number;
      menu_item_id: number;
      quantity: number;
      sent_quantity: number | null;
    }[];
  } | null;
};

// 3. Upsert món
export const upsertOrderItems = async ({ order_id_input, items_input }: { order_id_input: number, items_input: OrderItemInput[] }) => {
  const { data, error } = await supabase.rpc('upsert_order_items', {
    order_id_input,
    items_input
  });
  if (error) throw error;
  return data;
};

// 4. Xác nhận đã in xong
export const confirmKitchenPrint = async (orderId: number, itemIds: number[]) => {
  const { error } = await supabase.rpc('confirm_kitchen_print' as any, {
    order_id_input: orderId,
    item_ids: itemIds
  });
  if (error) throw error;
};

// 5. THANH TOÁN (QUAN TRỌNG: Cập nhật Total Amount để hiện báo cáo)
export const updateOrderStatus = async (orderId: number, status: 'paid' | 'cancelled', totalAmount?: number) => {
  const updatePayload: any = { status };
  
  // Nếu là thanh toán, bắt buộc cập nhật tổng tiền cuối cùng
  if (status === 'paid' && totalAmount !== undefined) {
    updatePayload.total_amount = totalAmount;
    // Cập nhật cả thời gian kết thúc để báo cáo chính xác theo giờ
    // updatePayload.finished_at = new Date().toISOString(); (Nếu DB bạn có cột này)
  }

  const { data, error } = await supabase
    .from('orders')
    .update(updatePayload)
    .eq('id', orderId)
    .select()
    .single();

  if (error) throw error;

  // Giải phóng bàn
  if (data) {
    await supabase
      .from('tables')
      .update({ status: 'empty' } as any)
      .eq('name', data.table_name);
  }
  return data;
};

// ... (Giữ nguyên các hàm moveTable, fetchOrdersHistory) ...
export const moveTable = async (fromTableName: string, toTableName: string) => {
  const { data: targetOrder } = await supabase.from('orders').select('id').eq('table_name', toTableName).eq('status', 'served').maybeSingle();
  if (targetOrder) throw new Error(`Bàn ${toTableName} đang có khách!`);
  const { data: sourceOrder } = await supabase.from('orders').select('id').eq('table_name', fromTableName).eq('status', 'served').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!sourceOrder) throw new Error(`Bàn ${fromTableName} không có đơn.`);
  const { error } = await supabase.from('orders').update({ table_name: toTableName }).eq('id', sourceOrder.id);
  if (error) throw error;
  await supabase.from('tables').update({ status: 'empty' } as any).eq('name', fromTableName);
  await supabase.from('tables').update({ status: 'occupied' } as any).eq('name', toTableName);
  return true;
};

export const fetchOrdersHistory = async (date: string) => {
  const start = `${date}T00:00:00`;
  const end = `${date}T23:59:59.999`;
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id, table_name, status, total_amount, created_at,
      order_items ( quantity, menu_item_id, menu_items ( id, name, price ) )
    `)
    .eq('status', 'paid')
    .gte('created_at', start)
    .lte('created_at', end)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};