// app/(app)/staff.tsx
import { zodResolver } from '@hookform/resolvers/zod';
import { Picker } from '@react-native-picker/picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit, Plus } from 'lucide-react-native';
import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { createStaffUser, fetchStaff, Profile, updateStaffUser } from '../../src/api/staffApi';
import { editStaffSchema, EditStaffSchema, StaffSchema } from '../../types';

type Mode = 'add' | 'edit';

export default function StaffScreen() {
  const queryClient = useQueryClient();
  const [modalVisible, setModalVisible] = useState(false);
  const [mode, setMode] = useState<Mode>('add');
  const [currentStaff, setCurrentStaff] = useState<Profile | null>(null);
  
  // === Lấy Dữ liệu ===
  const { data: staffList, isLoading } = useQuery({
    queryKey: ['staff'],
    queryFn: fetchStaff,
  });

  // === Form ===
  const { control, handleSubmit, reset, setValue } = useForm<EditStaffSchema>({
    resolver: zodResolver(editStaffSchema),
    defaultValues: { email: '', password: '', role: 'staff' },
  });

  // === Mutations ===
  const createStaffMutation = useMutation({
    mutationFn: (data: StaffSchema) => createStaffUser(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      setModalVisible(false);
      reset();
    },
    onError: (err: Error) => Alert.alert('Lỗi tạo nhân viên', err.message),
  });

  const updateStaffMutation = useMutation({
    mutationFn: (data: { userId: string, formData: EditStaffSchema }) => 
      updateStaffUser(data.userId, data.formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      setModalVisible(false);
      reset();
    },
    onError: (err: Error) => Alert.alert('Lỗi cập nhật', err.message),
  });
  
  // === Xử lý Submit ===
  const onValidSubmit = (data: EditStaffSchema) => {
    // Validate password cho 'add' mode thủ công
    if (mode === 'add' && (!data.password || data.password.length < 6)) {
       Alert.alert('Lỗi', 'Mật khẩu phải có ít nhất 6 ký tự');
       return;
    }

    if (mode === 'add') {
      const createData: StaffSchema = { email: data.email, password: data.password! };
      createStaffMutation.mutate(createData);
    } else if (mode === 'edit' && currentStaff) {
      // Lọc ra password nếu nó rỗng
      const updateData: EditStaffSchema = {
        email: data.email,
        role: data.role,
        ...(data.password ? { password: data.password } : {}) // Chỉ thêm password nếu có
      };
      updateStaffMutation.mutate({ userId: currentStaff.id, formData: updateData });
    }
  };

  // === Xử lý Mở Modal ===
  const openModal = (mode: Mode, staff: Profile | null = null) => {
    setMode(mode);
    setCurrentStaff(staff);
    if (mode === 'edit' && staff) {
      setValue('email', staff.email || '');
      
      // SỬA LỖI 2: Kiểm tra 'role' trước khi gán
      // (Vì staff.role là 'string | null', nhưng Zod/Picker là 'admin' | 'staff')
      const validRole = (staff.role === 'admin' || staff.role === 'staff') ? staff.role : 'staff';
      setValue('role', validRole);
      
      setValue('password', ''); // Luôn reset password
    } else {
      reset({ email: '', password: '', role: 'staff' });
    }
    setModalVisible(true);
  };
  
  if (isLoading) {
    return <ActivityIndicator style={styles.loading} size="large" color="#FF6B35" />
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Quản lý Nhân viên</Text>

      <FlatList
        data={staffList || []}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.staffItem}>
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>{item.email}</Text>
              <Text style={styles.itemRole}>{item.role === 'admin' ? 'Quản lý' : 'Nhân viên'}</Text>
            </View>
            <TouchableOpacity onPress={() => openModal('edit', item)}>
              <Edit size={22} color="#3498db" />
            </TouchableOpacity>
          </View>
        )}
      />

      {/* Nút Thêm Nhân viên */}
      <TouchableOpacity style={styles.fab} onPress={() => openModal('add')}>
        <Plus size={28} color="#fff" />
      </TouchableOpacity>

      {/* Modal Thêm/Sửa */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>{mode === 'add' ? 'Thêm nhân viên' : 'Sửa nhân viên'}</Text>
            
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
                <>
                  <Text style={styles.label}>Email (Dùng để đăng nhập)</Text>
                  <TextInput 
                    style={styles.input} 
                    value={value} 
                    onChangeText={onChange} 
                    onBlur={onBlur} 
                    keyboardType="email-address" 
                    autoCapitalize="none"
                  />
                  {error && <Text style={styles.errorText}>{error.message}</Text>}
                </>
              )}
            />
            
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
                <>
                  <Text style={styles.label}>{mode === 'add' ? 'Mật khẩu (Ít nhất 6 ký tự)' : 'Mật khẩu mới (Bỏ trống nếu không đổi)'}</Text>
                  <TextInput 
                    style={styles.input} 
                    value={value || ''} 
                    onChangeText={onChange} 
                    onBlur={onBlur} 
                    secureTextEntry 
                  />
                  {error && <Text style={styles.errorText}>{error.message}</Text>}
                </>
              )}
            />
            
            <Controller
              control={control}
              name="role"
              render={({ field: { onChange, value }, fieldState: { error } }) => (
                <>
                  <Text style={styles.label}>Quyền</Text>
                  <Picker selectedValue={value} onValueChange={onChange}>
                    <Picker.Item label="Nhân viên" value="staff" />
                    <Picker.Item label="Quản lý" value="admin" />
                  </Picker>
                  {error && <Text style={styles.errorText}>{error.message}</Text>}
                </>
              )}
            />
            
            <TouchableOpacity 
              style={[styles.btn, styles.btnSave]} 
              onPress={handleSubmit(onValidSubmit)}
              disabled={createStaffMutation.isPending || updateStaffMutation.isPending}
            >
              <Text style={styles.btnText}>Lưu</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// (Styles giữ nguyên y hệt V3)
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f9f9', padding: 16, paddingTop: 50 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { fontSize: 26, fontWeight: 'bold', color: '#FF6B35', textAlign: 'center', marginBottom: 20, fontFamily: 'SVN-Bold' },
  staffItem: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 2,
  },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 18, fontWeight: '600' },
  itemRole: { fontSize: 14, color: '#888', fontStyle: 'italic', textTransform: 'capitalize' },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FF6B35',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 20,
  },
  modalView: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  label: { fontSize: 16, color: '#555', marginBottom: 8 },
  input: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  btn: { padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 10 },
  btnSave: { backgroundColor: '#FF6B35' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  errorText: { color: 'red', marginBottom: 10 },
});