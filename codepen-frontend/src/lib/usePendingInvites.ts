'use client'

import { useQuery } from '@/lib/useQuery'
import type { Invite } from '@/types/invite'

export const usePendingInvites = () => {
  const { data, error, isLoading, mutate } = useQuery<Invite[]>('/api/group/invites', {
    refreshInterval: 5000,
  })

  return {
    invites: data,
    isLoading,
    error,
    mutate,
  }
}
