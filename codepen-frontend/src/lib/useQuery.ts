'use client'

import useSWR from 'swr'
import { fetcher, type FetchError } from '@/lib/fetcher'

// 1. url 타입을 string | null 로 변경
export const useQuery = <T>(
  url: string | null,
  swrOptions?: Parameters<typeof useSWR<T, FetchError>>[2]
) => {
  // SWR은 url이 null이면 자동 요청을 하지 않고 대기합니다.
  const { data, error, isLoading, mutate } = useSWR<T, FetchError>(url, fetcher, swrOptions)

  return {
    data,
    isLoading,
    error,
    mutate,
  }
}
