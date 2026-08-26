export interface QuestionAttemptStats {
  total_attempts: number
  total_graded: number
  total_correct: number
  accuracy: number | null
}

export interface MyQuestionAttempt {
  attempts_count: number
  is_correct: boolean | null
}

export interface Question {
  question_id: number
  problem_id: number
  title: string
  description: string | null
  condition?: string | null     // 🟢 [신규 추가] 조건 필드
  conditions?: string | null    // 🟢 [신규 추가] 백엔드 응답 호환용 조건 필드
  example_output: string | null
  score: number
  order: number
  is_visible: boolean
  created_at: string
  stats: QuestionAttemptStats
  my_attempt: MyQuestionAttempt
  attachment_name?: string | null
}

export interface QuestionAttemptRow {
  user_id: string
  username: string
  student_no: number | null
  attempts_count: number
  is_correct: boolean | null
}