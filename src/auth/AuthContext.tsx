import { Session } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';

interface AuthContextType {
  session: Session | null;
  role: 'admin' | 'staff' | null;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<'admin' | 'staff' | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // SỬA: Thêm dòng kiểm tra an toàn này
    // Nếu supabase chưa kịp load, đợi ở lần re-render sau
    if (!supabase) return; 

    // 1. Lấy session hiện tại khi app vừa mở
    const fetchSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        // FIX LỖI PHÂN QUYỀN: Đọc role từ app_metadata
        const userRole = session?.user?.app_metadata?.role || null;
        setRole(userRole);
      } catch (e) {
        console.error("Lỗi getSession:", e);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchSession();

    // 2. Lắng nghe mọi thay đổi (Login, Logout)
    // Dòng này giờ đã an toàn
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession);
        // FIX LỖI PHÂN QUYỀN: Đọc role từ app_metadata
        const userRole = newSession?.user?.app_metadata?.role || null;
        setRole(userRole);
        if (!newSession) setIsLoading(false);
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
    
  // SỬA: Thêm 'supabase' vào dependency array
  }, [supabase]); 

  const value = {
    session,
    role,
    isLoading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Hook để sử dụng (useAuth)
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth phải được dùng bên trong AuthProvider');
  }
  return context;
};