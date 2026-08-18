'use client'

import { useQuery } from '@/lib/useQuery'
import { Group } from '@/types/group'

export const useGroups = () => {
  const { data, error, isLoading, mutate } = useQuery<Group[]>('/api/group/')

  return {
    groups: data,
    isLoading,
    error,
    mutate,
  }
}
