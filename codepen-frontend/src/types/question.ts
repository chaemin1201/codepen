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
  example_output: string | null
  score: number
  order: number
  is_visible: boolean
  created_at: string
  stats: QuestionAttemptStats
  my_attempt: MyQuestionAttempt
}

export interface QuestionAttemptRow {
  user_id: string
  username: string
  student_no: number | null
  attempts_count: number
  is_correct: boolean | null
}
