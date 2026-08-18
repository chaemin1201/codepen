'use client'

import { useQuery } from '@/lib/useQuery'
import type { Question } from '@/types/question'

export const useQuestions = (problemId: number | null) => {
  const { data, error, isLoading, mutate } = useQuery<Question[]>(
    problemId ? `/api/question/problem/${problemId}` : null,
    { refreshInterval: 5000 },
  )

  return {
    questions: data,
    isLoading,
    error,
    mutate,
  }
}
