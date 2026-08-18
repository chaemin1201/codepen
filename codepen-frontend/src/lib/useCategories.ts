'use client'

import { useQuery } from '@/lib/useQuery'
import { Category } from '@/types/category'

export const useCategories = (groupId: number | null) => {
  const { data, error, isLoading, mutate } = useQuery<Category[]>(
    groupId ? `/api/category/group/${groupId}` : null,
  )

  return {
    categories: data,
    isLoading,
    error,
    mutate,
  }
}
