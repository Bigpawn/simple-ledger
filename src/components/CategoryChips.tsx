import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { FilterOptions } from './FilterOptions';
import type { Category } from '@/db/types';

/**
 * 两级分类选择：一级一行，选中带子类的一级后再展开子类。
 * 允许直接把账单记在一级分类上（“全部”语义），与旧数据保持兼容。
 * 传 allLabel 时额外提供一个空 id 的“全部”选项（用于筛选）。
 */
export function CategoryChips({
  label = '分类',
  allLabel,
  categories,
  selected,
  onChange,
}: {
  label?: string;
  allLabel?: string;
  categories: Category[];
  selected?: string;
  onChange: (id: string) => void;
}) {
  const tops = categories.filter((c) => !c.parentId);
  const selectedCategory = categories.find((c) => c.id === selected);
  const [openParentId, setOpenParentId] = useState<string | null>(
    selectedCategory?.parentId ?? null
  );

  useEffect(() => {
    setOpenParentId(selectedCategory?.parentId ?? null);
  }, [selectedCategory?.parentId]);

  const children = openParentId ? categories.filter((c) => c.parentId === openParentId) : [];
  const parentOptions = [
    ...(allLabel ? [{ id: '', name: allLabel }] : []),
    ...tops.map((c) => ({ id: c.id, name: c.name })),
  ];

  return (
    <View style={{ gap: 8 }}>
      <FilterOptions
        label={label}
        options={parentOptions}
        selected={selectedCategory?.parentId ?? selected ?? ''}
        onChange={(id) => {
          onChange(id);
          const hasChildren = id !== '' && categories.some((c) => c.parentId === id);
          setOpenParentId(hasChildren ? id : null);
        }}
      />
      {children.length > 0 && (
        <FilterOptions
          label="子分类"
          options={children.map((c) => ({ id: c.id, name: c.name }))}
          selected={selected}
          onChange={onChange}
        />
      )}
    </View>
  );
}
