'use client'

import { useSearchParams } from 'next/navigation'
import { createContext, useContext } from 'react'
import { useQuery } from '@/lib/useQuery'
import type { Group } from '@/types/group'

type GroupProviderProps = {
  children: React.ReactNode;
}

type GroupProviderState = {
  group: Group | undefined;
  refresh: () => void;
}

const initialState: GroupProviderState = {
  group: undefined,
  refresh: () => {},
}

const GroupContext = createContext<GroupProviderState>(initialState)

export const GroupProvider = ({ children }: GroupProviderProps) => {
  // [구조 변경] 라우트가 /groups/[groupId] -> /problem?groupId=... 로 평탄화되면서
  // 더 이상 URL 세그먼트로 groupId를 받지 않으므로 쿼리스트링에서 읽어옵니다.
  const searchParams = useSearchParams()
  const groupId = searchParams.get('groupId')
  const { data: group, mutate: refresh } = useQuery<Group>(
    groupId ? `/api/group/${groupId}` : null,
    { refreshInterval: 5000 },
  )

  return (
    <GroupContext.Provider value={{ group, refresh }}>
      {children}
    </GroupContext.Provider>
  )
}

export const useGroup = () => {
  const context = useContext(GroupContext)

  if (context === undefined) {
    throw new Error('useGroup must be used within a GroupProvider')
  }

  return context
}
