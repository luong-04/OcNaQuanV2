// app/(app)/menu.tsx
import { zodResolver } from '@hookform/resolvers/zod';
import { Picker } from '@react-native-picker/picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit, Plus, Trash } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
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
import {
  Category,
  deleteCategory,
  deleteMenuItem,
  fetchCategories,
  fetchMenuItems,
  MenuItemWithCategory,
  upsertCategory,
  upsertMenuItem,
  UpsertMenuItem,
} from '../../src/api/menuApi';
import { categorySchema, CategorySchema, menuItemSchema, MenuItemSchema } from '../../types';

type Mode = 'add' | 'edit';

export default function MenuScreen() {
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  
  // State cho Modal Món ăn
  const [itemModalVisible, setItemModalVisible] = useState(false);
  const [itemMode, setItemMode] = useState<Mode>('add');
  const [currentItem, setCurrentItem] = useState<MenuItemWithCategory | null>(null);
  
  // State cho Modal Danh mục
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [categoryMode, setCategoryMode] = useState<Mode>('add');
  const [currentCategory, setCurrentCategory] = useState<Category | null>(null);

  // === Dữ liệu ===
  const { data: categories, isLoading: isLoadingCategories } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
  });
  
  const { data: menuItems, isLoading: isLoadingItems } = useQuery({
    queryKey: ['menuItems'],
    queryFn: fetchMenuItems,
  });

  // === Lọc ===
  const filteredItems = useMemo(() => {
    if (!menuItems) return [];
    if (selectedCategory === null) return menuItems;
    return menuItems.filter(item => item.category_id === selectedCategory);
  }, [menuItems, selectedCategory]);

  // === Forms ===
  const {
    control: itemControl,
    handleSubmit: handleItemSubmit,
    reset: resetItemForm,
    setValue: setItemValue,
  } = useForm<MenuItemSchema>({
    resolver: zodResolver(menuItemSchema),
    // SỬA LỖI 1: Dùng 'null' thay vì 'undefined'
    defaultValues: { name: '', price: 0, category_id: null }, 
  });

  const {
    control: categoryControl,
    handleSubmit: handleCategorySubmit,
    reset: resetCategoryForm,
    setValue: setCategoryValue,
  } = useForm<CategorySchema>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: '' },
  });
  
  // === Mutations Món ăn ===
  const upsertItemMutation = useMutation({
    mutationFn: (item: UpsertMenuItem) => upsertMenuItem(item),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menuItems'] });
      setItemModalVisible(false);
      resetItemForm();
    },
    onError: (err: Error) => Alert.alert('Lỗi', err.message),
  });

  const deleteItemMutation = useMutation({
    mutationFn: (id: number) => deleteMenuItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menuItems'] });
    },
    onError: (err: Error) => Alert.alert('Lỗi', err.message),
  });

  // === Mutations Danh mục ===
  const upsertCategoryMutation = useMutation({
    mutationFn: (category: { id?: number, name: string }) => upsertCategory(category),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setCategoryModalVisible(false);
      resetCategoryForm();
    },
    onError: (err: Error) => Alert.alert('Lỗi', err.message),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: number) => deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['menuItems'] }); // Tải lại món ăn
      setSelectedCategory(null); // Reset filter
    },
    onError: (err: Error) => Alert.alert('Lỗi', err.message),
  });
  
  // === Xử lý Món ăn ===
  const onValidItemSubmit = (data: MenuItemSchema) => {
    const payload: UpsertMenuItem = {
      ...data,
      // SỬA LỖI 1: Đảm bảo category_id là number | null
      category_id: data.category_id, 
      price: Number(data.price),
    };
    if (itemMode === 'edit' && currentItem) {
      payload.id = currentItem.id;
    }
    upsertItemMutation.mutate(payload);
  };

  const openItemModal = (mode: Mode, item: MenuItemWithCategory | null = null) => {
    setItemMode(mode);
    setCurrentItem(item);
    if (mode === 'edit' && item) {
      setItemValue('name', item.name);
      setItemValue('price', item.price);
      // SỬA LỖI 1: Dùng '|| null'
      setItemValue('category_id', item.category_id || null);
    } else {
      // SỬA LỖI 1: Dùng '|| null'
      resetItemForm({ category_id: selectedCategory || null });
    }
    setItemModalVisible(true);
  };
  
  const confirmDeleteItem = (item: MenuItemWithCategory) => {
    Alert.alert('Xóa món ăn', `Bạn có chắc muốn xóa "${item.name}"?`, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa', style: 'destructive', onPress: () => deleteItemMutation.mutate(item.id) },
    ]);
  };
  
  // === Xử lý Danh mục ===
  const onValidCategorySubmit = (data: CategorySchema) => {
    const payload: { id?: number, name: string } = { name: data.name };
    if (categoryMode === 'edit' && currentCategory) {
      payload.id = currentCategory.id;
    }
    upsertCategoryMutation.mutate(payload);
  };

  const openCategoryModal = (mode: Mode, category: Category | null = null) => {
    setCategoryMode(mode);
    setCurrentCategory(category);
    if (mode === 'edit' && category) {
      setCategoryValue('name', category.name);
    } else {
      resetCategoryForm();
    }
    setCategoryModalVisible(true);
  };

  const confirmDeleteCategory = (category: Category) => {
    Alert.alert('Xóa danh mục', `Bạn có chắc muốn xóa "${category.name}"? Món ăn thuộc danh mục này sẽ bị mất danh mục.`, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa', style: 'destructive', onPress: () => deleteCategoryMutation.mutate(category.id) },
    ]);
  };
  
  if (isLoadingCategories || isLoadingItems) {
    return <ActivityIndicator style={styles.loading} size="large" color="#FF6B35" />
  }
  
  return (
    <View style={styles.container}>
      <Text style={styles.header}>Quản lý Menu</Text>

      {/* Nút Thêm Danh mục */}
      <TouchableOpacity 
        style={[styles.btn, styles.btnAddCategory]} 
        onPress={() => openCategoryModal('add')}
      >
        <Text style={styles.btnText}>Thêm Danh Mục</Text>
      </TouchableOpacity>

      {/* Filter Danh mục */}
      <View style={styles.categoryList}>
        <TouchableOpacity
          style={[styles.categoryBtn, selectedCategory === null && styles.categoryBtnActive]}
          onPress={() => setSelectedCategory(null)}
        >
          <Text style={[styles.categoryText, selectedCategory === null && styles.categoryTextActive]}>Tất cả</Text>
        </TouchableOpacity>
        
        {categories?.map(cat => (
          <TouchableOpacity
            key={cat.id}
            style={[styles.categoryBtn, selectedCategory === cat.id && styles.categoryBtnActive]}
            onPress={() => setSelectedCategory(cat.id)}
            onLongPress={() => openCategoryModal('edit', cat)}
          >
            <Text style={[styles.categoryText, selectedCategory === cat.id && styles.categoryTextActive]}>{cat.name}</Text>
            <TouchableOpacity style={styles.deleteCategoryIcon} onPress={() => confirmDeleteCategory(cat)}>
              <Trash size={16} color="#e74c3c" />
            </TouchableOpacity>
          </TouchableOpacity>
        ))}
      </View>
      
      {/* Danh sách Món ăn */}
      <FlatList
        data={filteredItems}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={{ paddingBottom: 100 }}
        renderItem={({ item }) => (
          <View style={styles.menuItem}>
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemPrice}>{item.price.toLocaleString()}đ</Text>
              <Text style={styles.itemCategory}>{item.categories?.name || 'Chưa phân loại'}</Text>
            </View>
            <View style={styles.itemActions}>
              <TouchableOpacity onPress={() => openItemModal('edit', item)}>
                <Edit size={22} color="#3498db" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => confirmDeleteItem(item)}>
                <Trash size={22} color="#e74c3c" />
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      {/* Nút Thêm Món ăn */}
      <TouchableOpacity style={styles.fab} onPress={() => openItemModal('add')}>
        <Plus size={28} color="#fff" />
      </TouchableOpacity>

      {/* Modal Món ăn */}
      <Modal
        visible={itemModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setItemModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>{itemMode === 'add' ? 'Thêm món mới' : 'Sửa món ăn'}</Text>
            
            <Controller
              control={itemControl}
              name="name"
              render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
                <>
                  <Text style={styles.label}>Tên món</Text>
                  <TextInput style={styles.input} value={value} onChangeText={onChange} onBlur={onBlur} />
                  {error && <Text style={styles.errorText}>{error.message}</Text>}
                </>
              )}
            />
            
            <Controller
              control={itemControl}
              name="price"
              render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
                <>
                  <Text style={styles.label}>Giá</Text>
                  <TextInput style={styles.input} value={String(value)} onChangeText={onChange} onBlur={onBlur} keyboardType="numeric" />
                  {error && <Text style={styles.errorText}>{error.message}</Text>}
                </>
              )}
            />
            
            <Controller
              control={itemControl}
              name="category_id"
              render={({ field: { onChange, value }, fieldState: { error } }) => (
                <>
                  <Text style={styles.label}>Danh mục</Text>
                  <Picker selectedValue={value} onValueChange={onChange}>
                    {/* SỬA LỖI 1: Dùng 'null' thay vì 'undefined' */}
                    <Picker.Item label="-- Chọn danh mục --" value={null} /> 
                    {categories?.map(cat => (
                      <Picker.Item key={cat.id} label={cat.name} value={cat.id} />
                    ))}
                  </Picker>
                  {error && <Text style={styles.errorText}>{error.message}</Text>}
                </>
              )}
            />
            
            <TouchableOpacity 
              style={[styles.btn, styles.btnSave]} 
              onPress={handleItemSubmit(onValidItemSubmit)}
              disabled={upsertItemMutation.isPending}
            >
              <Text style={styles.btnText}>Lưu</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal Danh mục */}
      <Modal
        visible={categoryModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setCategoryModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>{categoryMode === 'add' ? 'Thêm danh mục' : 'Sửa danh mục'}</Text>
            <Controller
              control={categoryControl}
              name="name"
              render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
                <>
                  <Text style={styles.label}>Tên danh mục</Text>
                  <TextInput style={styles.input} value={value} onChangeText={onChange} onBlur={onBlur} />
                  {error && <Text style={styles.errorText}>{error.message}</Text>}
                </>
              )}
            />
            <TouchableOpacity 
              style={[styles.btn, styles.btnSave]} 
              onPress={handleCategorySubmit(onValidCategorySubmit)}
              disabled={upsertCategoryMutation.isPending}
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
  btn: { padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 10 },
  btnAddCategory: { backgroundColor: '#FF6B35' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  categoryList: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  categoryBtn: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 20,
    margin: 4,
    elevation: 2,
    alignItems: 'center',
  },
  categoryBtnActive: { backgroundColor: '#FF6B35' },
  categoryText: { fontSize: 14, fontWeight: '600', color: '#555' },
  categoryTextActive: { color: '#fff' },
  deleteCategoryIcon: { marginLeft: 8 },
  menuItem: {
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
  itemPrice: { fontSize: 16, color: '#FF6B35', marginVertical: 4 },
  itemCategory: { fontSize: 14, color: '#888', fontStyle: 'italic' },
  itemActions: { flexDirection: 'row', gap: 20 },
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
  btnSave: { backgroundColor: '#FF6B35' },
  errorText: { color: 'red', marginBottom: 10 },
});