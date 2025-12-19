// types/index.ts
import { z } from 'zod';

// Schema cho form đăng nhập (Giữ nguyên)
export const loginSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
});
export type LoginSchema = z.infer<typeof loginSchema>;


// === SỬA LỖI Ở ĐÂY ===
export const menuItemSchema = z.object({
  name: z.string().min(1, 'Tên món không được trống'),
  price: z.coerce
    .number({ invalid_type_error: 'Giá phải là số' })
    .min(0, 'Giá không thể âm'),
  
  // SỬA: Cho phép 'category_id' là 'number' hoặc 'null'
  // (Thay vì 'undefined' hoặc 'required number' như code V3)
  category_id: z.number().nullable(), 
});
// === KẾT THÚC SỬA LỖI ===

export type MenuItemSchema = z.infer<typeof menuItemSchema>;

export const staffSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu phải có ít nhất 6 ký tự'),
});
export type StaffSchema = z.infer<typeof staffSchema>;
export const categorySchema = z.object({
  name: z.string().min(1, 'Tên danh mục không được trống'),
});
export type CategorySchema = z.infer<typeof categorySchema>;

export type Role = 'admin' | 'staff';

export const editStaffSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  // Mật khẩu là optional, nhưng nếu có thì phải > 6 ký tự
  password: z.string().min(6, 'Mật khẩu phải ít nhất 6 ký tự').optional().or(z.literal('')),
  role: z.enum(['admin', 'staff']),
});
export type EditStaffSchema = z.infer<typeof editStaffSchema>;
export interface Calculations {
  subtotal: number;
  discountAmount: number;
  vatAmount: number;
  finalTotal: number;
}