'use client'

import React, { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeftIcon, RotateCwIcon, TrophyIcon } from 'lucide-react'

import { Header } from '@/components/header'
import { GroupProvider, useGroup } from '@/context/group-provider'
import { useMe } from '@/context/me-provider'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'

interface CategoryColumn {
  category_id: number | null
  title: string
  max_score: number
}

interface StudentGradeRow {
  user_id: string
  username: string | null
  student_no: string | number | null
  categories: { category_id: number | null; title: string; score: number; max_score: number }[]
  total_score: number
  total_max_score: number
}

function getScoreColorClass(score: number, maxScore: number) {
  if (maxScore <= 0) return 'text-slate-400'
  const ratio = score / maxScore
  if (ratio >= 0.9) return 'text-emerald-600 font-bold'
  if (ratio >= 0.5) return 'text-amber-500 font-bold'
  return 'text-rose-500 font-bold'
}

function GroupGradesContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { me } = useMe()
  const { group } = useGroup()

  const groupId = searchParams.get('groupId') || (group ? String(group.group_id) : '')

  const [categories, setCategories] = useState<CategoryColumn[]>([])
  const [students, setStudents] = useState<StudentGradeRow[]>([])
  const [totalMaxScore, setTotalMaxScore] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchGrades = async () => {
    if (!groupId) return
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/group/${groupId}/grades`, { credentials: 'include' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '성적을 불러오지 못했습니다.')
      }
      const data = await res.json()
      setCategories(data.categories || [])
      setStudents(data.students || [])
      setTotalMaxScore(data.total_max_score || 0)
    } catch (e: any) {
      setError(e.message || '성적을 불러오지 못했습니다.')
      toast.error(e.message || '성적을 불러오지 못했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchGrades()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <Header user={me} />

      <header className="w-full bg-white border-b border-slate-100 px-6 py-3 flex items-center gap-3 text-xs text-slate-500">
        <button
          onClick={() => router.back()}
          className="size-8 rounded-lg border border-slate-300 flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors shadow-2xs"
          title="뒤로 가기"
        >
          <ArrowLeftIcon className="size-4" />
        </button>
        <div className="flex items-center gap-2">
          <span className="cursor-pointer hover:underline hover:text-slate-700" onClick={() => router.push('/groups')}>
            나의 그룹들
          </span>
          {group && (
            <>
              <span>&gt;</span>
              <span className="cursor-pointer hover:underline hover:text-slate-700" onClick={() => router.push(`/problem?groupId=${group.group_id}`)}>
                📚 {group.group_name}
              </span>
            </>
          )}
          <span>&gt;</span>
          <span className="font-bold text-slate-800">성적 조회</span>
        </div>
      </header>

      <main className="max-w-[1400px] w-full mx-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <TrophyIcon className="size-5 text-amber-500" />
            {group?.group_name ? `${group.group_name} - 전체 성적` : '전체 성적'}
          </h1>
          <Button variant="outline" size="sm" onClick={fetchGrades} className="h-8 gap-1.5 text-xs text-slate-600 bg-white">
            <RotateCwIcon className="size-3.5" /> 새로고침
          </Button>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs overflow-hidden">
          {isLoading ? (
            <div className="p-12"><Skeleton className="h-[400px] w-full rounded-xl" /></div>
          ) : error ? (
            <div className="p-12 text-center text-rose-500 font-medium text-sm">{error}</div>
          ) : categories.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">등록된 항목(주차)이 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50/70 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="py-3 px-6 w-16 text-center">순위</th>
                    <th className="py-3 px-6 w-32">이름</th>
                    <th className="py-3 px-6 w-28">학번</th>
                    <th className="py-3 px-6 text-center w-32">총점</th>
                    {categories.map((c) => (
                      <th key={c.category_id ?? 'uncategorized'} className="py-3 px-4 text-center min-w-[100px]">
                        <div className="text-slate-800 truncate max-w-[140px] mx-auto" title={c.title}>{c.title}</div>
                        <div className="text-[10px] text-slate-400 font-normal">(배점: {c.max_score}점)</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {students.map((student, idx) => (
                    <tr key={student.user_id} className="h-14 hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-6 text-center text-slate-400 font-bold">{idx + 1}</td>
                      <td className="py-3 px-6 font-bold text-slate-800">{student.username || '이름 미상'}</td>
                      <td className="py-3 px-6 font-mono text-slate-600">{student.student_no ?? '-'}</td>
                      <td className="py-3 px-6 text-center">
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-indigo-50/80 border border-indigo-100 text-indigo-700 font-extrabold">
                          {student.total_score}
                          <span className="text-slate-400 font-normal">/ {totalMaxScore}</span>
                        </span>
                      </td>
                      {student.categories.map((c) => (
                        <td key={c.category_id ?? 'uncategorized'} className="py-3 px-4 text-center font-mono">
                          <span className={getScoreColorClass(c.score, c.max_score)}>{c.score}</span>
                          <span className="text-slate-300"> / {c.max_score}</span>
                        </td>
                      ))}
                    </tr>
                  ))}

                  {students.length === 0 && (
                    <tr>
                      <td colSpan={4 + categories.length} className="py-12 text-center text-slate-400">
                        등록된 학생이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default function GroupGradesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-screen w-full" />}>
      <GroupProvider>
        <GroupGradesContent />
      </GroupProvider>
    </Suspense>
  )
}