export interface Problem {
  problem_id: number
  group_id: number
  category_id: number | null
  question_count: number
  title: string
  description: string
  difficulty: string
  created_at: string
  starts_at: string
  deadline: string
  avg_score?: number | null
  std_score?: number | null
  hide_before_start: boolean
}
