'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { createContext, useContext, useEffect, useState } from 'react'
import type { Problem } from '@/types/problem'

type ProblemProviderProps = {
  children: React.ReactNode;
}

type ProblemProviderState = {
  problem: Problem | null;
  refresh: () => Promise<void>;
}

const initialState: ProblemProviderState = {
  problem: null,
  refresh: async () => {},
}

const ProblemContext = createContext<ProblemProviderState>(initialState)

export const ProblemProvider = ({ children }: ProblemProviderProps) => {
  // [버그 수정] /problem/[problemId] 라우트는 problemId가 실제 경로 세그먼트라서
  // useSearchParams()로는 절대 못 읽어옵니다 (그래서 문제 카드를 눌러도 problem이
  // 계속 null로 남아 흰 화면만 보였던 것). 경로 세그먼트(useParams)를 우선 쓰고,
  // /submission?problemId=.. 처럼 쿼리스트링으로 넘어오는 경우엔 그걸 대신 씁니다.
  const params = useParams<{ problemId?: string }>()
  const searchParams = useSearchParams()
  const problemId = params?.problemId ?? searchParams.get('problemId')
  const [problem, setProblem] = useState<Problem | null>(null)

  const fetchProblem = async () => {
    if (!problemId) {
      setProblem(null)
      return
    }
    try {
      const response = await fetch(`/api/problem/${problemId}`)
      if (response.ok) {
        const data: Problem = await response.json()
        setProblem(data)
      } else {
        setProblem(null)
      }
    } catch (error) {
      console.error('Failed to fetch problem data:', error)
      setProblem(null)
    }
  }

  const refresh = fetchProblem

  useEffect(() => {
    fetchProblem()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problemId])

  return (
    <ProblemContext.Provider value={{ problem, refresh }}>
      {children}
    </ProblemContext.Provider>
  )
}

export const useProblem = () => {
  const context = useContext(ProblemContext)

  if (context === undefined) {
    throw new Error('useProblem must be used within a ProblemProvider')
  }

  return context
}
