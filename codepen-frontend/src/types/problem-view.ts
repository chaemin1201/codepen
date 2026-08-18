import type { Category as ApiCategory } from '@/types/category'
import type { Problem as ApiProblem } from '@/types/problem'

// [구조 변경] id를 string으로 다루던 기존 JSX를 최대한 그대로 쓰기 위해,
// 실제 API 응답(number id)을 아래 로컬 셰이프로 매핑해서 사용합니다.
export interface Category {
  id: string
  title: string
  type: 'general' | 'exam'
  period?: string
  isCurrentWeek?: boolean
}

export interface Problem {
  id: string
  title: string
  categoryId: string
  createdAt: string
  questionCount: number
  description?: string
  dateStr?: string
  timeStr?: string
}

export interface Member {
  id: string
  name: string
  studentId: string
  role: 'student' | 'owner'
  joinedAt: string
}

export const mapCategory = (c: ApiCategory): Category => ({
  id: String(c.category_id),
  title: c.title,
  type: c.type,
  period: c.period_starts_at && c.period_ends_at
    ? `${c.period_starts_at.slice(0, 10).replace(/-/g, '.')} ~ ${c.period_ends_at.slice(0, 10).replace(/-/g, '.')}`
    : undefined,
  isCurrentWeek: c.is_current,
})

export const mapProblem = (p: ApiProblem): Problem => ({
  id: String(p.problem_id),
  title: p.title,
  categoryId: p.category_id !== null ? String(p.category_id) : '',
  createdAt: new Date(p.created_at).toLocaleDateString('ko-KR'),
  questionCount: p.question_count,
  description: p.description || undefined,
  dateStr: new Date(p.starts_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' }),
  timeStr: p.deadline ? '마감 · ' + new Date(p.deadline).toLocaleString('ko-KR') : '상시 제출',
})
