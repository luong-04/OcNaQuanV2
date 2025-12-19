// src/api/menuApi.ts
import { Database } from '../../types/supabase';
import { supabase } from '../services/supabase';

export interface MenuItem {
  id: number;
  name: string;
  price: number;
  category_id: number | null; // (SỬA) Cho phép null
  categories: { // (SỬA) Thêm 'categories'
    name: string;
  } | null; 
  category_name?: string; 
}

// Lấy kiểu 'Insert' từ types/supabase.ts (đã tạo ở Phần 1)
export type UpsertMenuItem = Database['public']['Tables']['menu_items']['Insert'];
export type Category = Database['public']['Tables']['categories']['Row'];

// Kiểu tùy chỉnh: Món ăn KÈM Tên Danh mục
export type MenuItemWithCategory = Database['public']['Tables']['menu_items']['Row'] & {
  categories: {
    name: string;
  } | null;
};

// === HÀM LẤY (GET) DỮ LIỆU ===
export const fetchCategories = async (): Promise<Category[]> => {
  const { data, error } = await supabase.from('categories').select('*').order('name');
  if (error) throw new Error(error.message);
  return data || [];
};

export const fetchMenuItems = async (): Promise<MenuItemWithCategory[]> => {
  const { data, error } = await supabase
    .from('menu_items')
    .select(`
      id,
      name,
      price,
      category_id,
      categories ( name )
    `);

  if (error) {
    console.error('Error fetching menu items:', error.message);
    throw new Error(error.message);
  }

  return data as MenuItemWithCategory[];
};

// === HÀM THÊM/SỬA (CREATE/UPDATE) ===
export const upsertMenuItem = async (item: UpsertMenuItem) => {
  // upsert = update or insert (Cập nhật hoặc Thêm mới)
  // Nếu item có 'id', nó sẽ UPDATE. Nếu không, nó sẽ INSERT.
  // DÒNG NÀY SẼ HẾT LỖI SAU KHI RELOAD WINDOW
  const { data, error } = await supabase.from('menu_items').upsert(item).select();
  if (error) throw new Error(error.message);
  return data;
};

// === HÀM XÓA (DELETE) ===
export const deleteMenuItem = async (id: number) => {
  const { error } = await supabase.from('menu_items').delete().eq('id', id);
  if (error) throw new Error(error.message);
};
export const upsertCategory = async (category: Database['public']['Tables']['categories']['Insert']) => {
  const { data, error } = await supabase.from('categories').upsert(category).select();
  if (error) throw new Error(error.message);
  return data;
};

export const deleteCategory = async (id: number) => {
  // Cảnh báo: Khi xóa, các món ăn thuộc danh mục này sẽ bị set category_id = null
  // (do chúng ta đã cài đặt RLS ở Bước 1)
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw new Error(error.message);
};