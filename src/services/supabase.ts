import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
// SỬA: XÓA dòng 'import 'react-native-url-polyfill/auto';' khỏi đây
import { Database } from '../../types/supabase';

const supabaseUrl = 'https://cjrwxbcfnhsqsxoipczh.supabase.co';
const supabaseAnonkey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqcnd4YmNmbmhzcXN4b2lwY3poIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2NTYwNjAsImV4cCI6MjA3ODIzMjA2MH0.QarKgRPrnmKDCrjQEmS6K_4clCte8cLQMZIw0tXz-Hw';

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonkey,{
    auth:{
        storage: AsyncStorage, //dùng AsyncStorage để lưu session
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});