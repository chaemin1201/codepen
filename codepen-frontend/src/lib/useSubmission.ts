'use client'

import { useQuery } from '@/lib/useQuery'
import { Submission } from '@/types/submission'

export const useSubmission = (problemId: number) => {
  const { data, error, isLoading, mutate } = useQuery<Submission | null>(`/api/submission/problem/${problemId}/user/me`)

  return {
    submission: data,
    isLoading,
    error,
    mutate,
  }
}
