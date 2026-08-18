export interface Submission {
  submission_id: number
  problem_id: number
  user_id: string
  code: string
  status: 'pending' | 'submitted'
  created_at: string
  submitted_at?: string
  codepen_url: string
  filename: string
  score: number | null
}
