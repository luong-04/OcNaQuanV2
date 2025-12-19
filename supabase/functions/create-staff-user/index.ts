// supabase/functions/create-staff-user/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  try {
    // === BƯỚC 1: KIỂM TRA QUYỀN CỦA NGƯỜI GỌI ===
    
    // Tạo một client BÌNH THƯỜNG (User Client)
    // Nó sẽ tự động lấy token (Authorization header) từ request
    const supabaseUserClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!, // Dùng Anon Key (Supabase tự cung cấp)
      {
        global: { headers: { Authorization: req.headers.get('Authorization')! } },
      }
    );

    // Dùng client đó để kiểm tra xem người gọi là ai
    const { data: { user } } = await supabaseUserClient.auth.getUser();
    
    // Nếu người gọi không phải 'admin', ném lỗi
    if (user?.app_metadata?.role !== 'admin') {
      throw new Error('Chỉ admin mới có quyền tạo nhân viên.');
    }

    // === BƯỚC 2: HÀNH ĐỘNG VỚI QUYỀN ADMIN ===

    // Nếu qua được, tạo một client ADMIN (Admin Client)
    const supabaseAdminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('OCNA_SERVICE_ROLE_KEY')! // Dùng Service Role key TÙY CHỈNH
    );

    // Lấy email, password từ app gửi lên
    const { email, password } = await req.json();
    if (!email || !password) {
      throw new Error("Vui lòng nhập email và mật khẩu.");
    }

    // Dùng client ADMIN để TẠO USER MỚI
    const { data: newUserData, error } = await supabaseAdminClient.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true, // Tự động xác nhận email
      app_metadata: { role: 'staff' } // Gán quyền 'staff'
    });

    if (error) throw error; // Ném lỗi nếu tạo user thất bại

    // Trả về thành công
    return new Response(JSON.stringify({ data: newUserData }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    // Bắt tất cả lỗi (kể cả lỗi "Chỉ admin...")
    const error = err as Error; 
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, // Lỗi server (hoặc 401 nếu là lỗi quyền)
      headers: { 'Content-Type': 'application/json' },
    });
  }
});