// supabase/functions/update-staff-user/index.ts
import { createClient, UserUpdate } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  try {
    // === BƯỚC 1: KIỂM TRA QUYỀN CỦA NGƯỜI GỌI (ADMIN) ===
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (user?.app_metadata?.role !== 'admin') {
      throw new Error('Chỉ admin mới có quyền sửa thông tin.');
    }

    // === BƯỚC 2: XỬ LÝ DỮ LIỆU APP GỬI LÊN ===
    const { user_id_to_edit, new_email, new_password, new_role } = await req.json();
    if (!user_id_to_edit) {
      throw new Error('Thiếu ID của user cần sửa');
    }

    // (SỬA) Tạo một object "payload" động
    const updatePayload: UserUpdate = {
      app_metadata: { role: new_role || 'staff' } // Luôn cập nhật role
    };

    if (new_email) {
      updatePayload.email = new_email;
    }
    if (new_password) {
      if (new_password.length < 6) {
        throw new Error('Mật khẩu mới phải có ít nhất 6 ký tự.');
      }
      updatePayload.password = new_password;
    }

    // === BƯỚC 3: HÀNH ĐỘNG VỚI QUYỀN ADMIN ===
    const supabaseAdminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('OCNA_SERVICE_ROLE_KEY')!
    );

    const { data, error } = await supabaseAdminClient.auth.admin.updateUserById(
      user_id_to_edit,
      updatePayload // Gửi payload động
    );

    if (error) throw error;

    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const error = err as Error; 
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});