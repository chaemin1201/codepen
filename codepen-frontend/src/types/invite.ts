export interface Invite {
  group_id: number
  group_name: string
  invite_code: string
  description: string | null
  created_at: string
  owner_name: string
}

export interface InviteStatus {
  group_id: number
  group_name: string
  description: string | null
  owner_name: string
  created_at: string
  status: 'none' | 'pending' | 'accepted'
}
