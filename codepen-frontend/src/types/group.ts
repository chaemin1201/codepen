import type { User } from '@/types/user'
import type { Problem } from '@/types/problem'

// [신규] 그룹원 목록은 이제 User 정보에 "이 그룹에 언제 가입했는지"(joined_at)가 같이 옵니다.
export interface GroupMemberUser extends User {
  joined_at: string
}

export interface Group {
  group_id: number
  group_name: string
  description: string | null
  owner_id: string
  created_at: string
  owner: User
  members: GroupMemberUser[]
  problems: Problem[]
  invite_code: string
}
