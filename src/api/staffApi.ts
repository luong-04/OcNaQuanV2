// src/api/staffApi.ts
import { type EditStaffSchema, type StaffSchema } from '../../types';
import { Database } from '../../types/supabase';
import { supabase } from '../services/supabase';
            
export type Profile = Database['public']['Tables']['profiles']['Row'];

// Lấy danh sách nhân viên
export const fetchStaff = async (): Promise<Profile[]> => {
  const { data, error } = await supabase.from('profiles').select('*');
  if (error) throw new Error(error.message);
  return data || []; // <-- (SỬA) LỖI CỦA BẠN LÀ THIẾU DÒNG NÀY
};

// Hàm tạo user (Admin)
export const createStaffUser = async (formData: StaffSchema) => {
  const { data, error } = await supabase.functions.invoke(
    'create-staff-user', 
    { body: formData } 
  );
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

// Hàm cập nhật Role
export const updateStaffUser = async (userId: string, formData: EditStaffSchema) => {
  const payload = {
    user_id_to_edit: userId,
    new_email: formData.email,
    new_role: formData.role,
    new_password: formData.password || undefined, 
  };

  const { data, error } = await supabase.functions.invoke(
    'update-staff-user', 
    { body: payload }
  );

  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);

  return data;
}