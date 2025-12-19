// app/(auth)/login.tsx
import { zodResolver } from '@hookform/resolvers/zod';
import React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../src/services/supabase';
import { loginSchema, LoginSchema } from '../../types';
// Bỏ import 'router' và 'useAuthStore'

export default function LoginScreen() {
  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginSchema>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  // FIX: Chỉ gọi signIn, không điều hướng
  const handleLogin = async (data: LoginSchema) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error) {
      Alert.alert('Lỗi đăng nhập', error.message);
    }
    // AuthContext sẽ tự động phát hiện và _layout.tsx sẽ điều hướng
  };

  // JSX và Styles giữ nguyên y hệt V3
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Đăng nhập Ốc Na</Text>
      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            style={styles.input}
            placeholder="Tài khoản"
            value={value}
            onBlur={onBlur}
            onChangeText={onChange}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        )}
      />
      {errors.email && <Text style={styles.errorText}>{errors.email.message}</Text>}
      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            style={styles.input}
            placeholder="Mật khẩu"
            value={value}
            onBlur={onBlur}
            onChangeText={onChange}
            secureTextEntry
          />
        )}
      />
      {errors.password && <Text style={styles.errorText}>{errors.password.message}</Text>}
      <TouchableOpacity 
        style={[styles.btn, isSubmitting && styles.btnDisabled]} 
        onPress={handleSubmit(handleLogin)}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnText}>Đăng nhập</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#f9f9f9' },
  title: { fontSize: 32, fontWeight: 'bold', color: '#FF6B35', textAlign: 'center', marginBottom: 40, fontFamily: 'SVN-Bold' },
  input: { backgroundColor: '#fff', padding: 16, borderRadius: 16, marginBottom: 16, fontSize: 16, elevation: 2 },
  btn: { backgroundColor: '#FF6B35', padding: 16, borderRadius: 16, alignItems: 'center', height: 58, justifyContent: 'center' },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 18, fontFamily: 'SVN-Bold' },
  errorText: { color: 'red', marginBottom: 10, marginLeft: 5 },
});