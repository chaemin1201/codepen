export interface Category {
  category_id: number
  group_id: number
  title: string
  type: 'general' | 'exam'
  created_at: string
  period_starts_at: string | null
  period_ends_at: string | null
  is_current: boolean
}
