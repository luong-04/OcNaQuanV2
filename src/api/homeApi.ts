// File: src/api/homeApi.ts
import { supabase } from '../services/supabase';

/**
 * Lấy danh sách bàn ĐANG HOẠT ĐỘNG
 */
export const fetchActiveTables = async (): Promise<string[]> => {
  const { data, error } = await supabase
    .from('orders')
    .select('table_name')
    .eq('status', 'served'); // SỬA: 'open' -> 'served' cho khớp với orderApi
    
  if (error) throw new Error(error.message);

  const activeTableSet = new Set(data.map(order => order.table_name));
  return Array.from(activeTableSet);
};

/**
 * Lấy danh sách bàn CHÍNH
 */
export const loadTables = async (): Promise<string[]> => {
  const { data, error } = await supabase
    .from('tables')
    .select('name');

  if (error) {
    console.error('Lỗi loadTables:', error);
    throw new Error(error.message);
  }

  const names = data.map(table => table.name);

  // Sắp xếp tự nhiên (Bàn 1 -> Bàn 2 -> ... -> Bàn 10)
  const naturalSort = (a: string, b: string) => {
    const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
    const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
    return numA - numB;
  };
  
  return names.sort(naturalSort);
};

/**
 * Thêm bàn mới (Mặc định status là 'empty')
 */
export const addTable = async (tableName: string): Promise<string> => {
  const { data, error } = await supabase
    .from('tables')
    .insert({ name: tableName, status: 'empty' }) // Thêm status mặc định cho chắc
    .select()
    .single(); 

  if (error) {
    // Check lỗi trùng tên
    if (error.code === '23505') throw new Error('Tên bàn này đã tồn tại!');
    throw new Error(error.message);
  }
  return data.name;
};

/**
 * Xóa bàn
 */
export const deleteTable = async (tableName: string): Promise<string> => {
  // Kiểm tra xem bàn có đang có khách không trước khi xóa (bảo vệ 2 lớp)
  const { data: table } = await supabase
    .from('tables')
    .select('status')
    .eq('name', tableName)
    .single();

  if (table && table.status === 'occupied') {
    throw new Error('Bàn đang có khách, không thể xóa!');
  }

  const { error } = await supabase
    .from('tables')
    .delete()
    .eq('name', tableName);

  if (error) {
    throw new Error(error.message);
  }
  return tableName;
};