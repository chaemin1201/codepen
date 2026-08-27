'use client'

import React, { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  RefreshCw,
  PlusIcon,
  SlidersHorizontalIcon,
  UsersIcon,
  CalendarIcon,
  ClockIcon,
  Trash2Icon,
  UserCheckIcon
} from 'lucide-react'

import { Header } from '@/components/header'
import { BackButton } from '@/components/back-button'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import { GroupProvider, useGroup } from '@/context/group-provider'
import { useMe } from '@/context/me-provider'
import { useGroupOwner } from '@/lib/useGroupOwner'
import { useCategories } from '@/lib/useCategories'
import { useQuery } from '@/lib/useQuery'
import { fetcher } from '@/lib/fetcher'
import type { Category as ApiCategory } from '@/types/category'
import type { Problem as ApiProblem } from '@/types/problem'

import { ListFilterIcon, PieChartIcon, GraduationCapIcon } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'

import { Settings } from 'lucide-react'
// ----------------------------------------------------
// 1. 화면 렌더링용 로컬 인터페이스
// [구조 변경] id를 string으로 다루던 기존 JSX를 최대한 그대로 쓰기 위해,
// 실제 API 응답(number id)을 아래 로컬 셰이프로 매핑해서 사용합니다.
// ----------------------------------------------------
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

const mapCategory = (c: ApiCategory): Category => ({
  id: String(c.category_id),
  title: c.title,
  type: c.type,
  period: c.period_starts_at && c.period_ends_at
    ? `${c.period_starts_at.slice(0, 10).replace(/-/g, '.')} ~ ${c.period_ends_at.slice(0, 10).replace(/-/g, '.')}`
    : undefined,
  isCurrentWeek: c.is_current,
})

const mapProblem = (p: any): Problem => {
  // questions 배열 길이 우선 -> 없으면 question_count / questions_count 확인 -> 기본값 0
  const count = Array.isArray(p.questions)
    ? p.questions.length
    : (p.question_count ?? p.questions_count ?? 0)

  return {
    id: String(p.problem_id),
    title: p.title,
    categoryId: p.category_id !== null ? String(p.category_id) : '',
    createdAt: p.created_at ? new Date(p.created_at).toLocaleDateString('ko-KR') : '',
    questionCount: count, // 👈 동적 문항 수 산출 반영
    description: p.description || undefined,
    dateStr: p.starts_at ? new Date(p.starts_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' }) : '',
    timeStr: p.deadline ? '마감 · ' + new Date(p.deadline).toLocaleString('ko-KR') : '상시 제출',
  }
}

function IntegratedGroupPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { group, refresh: refreshGroup } = useGroup()
  const { me } = useMe()
  const isOwner = useGroupOwner()
  const { categories: apiCategories, mutate: refreshCategories } = useCategories(group?.group_id ?? null)

  // 데이터 상태: 실제 API 응답을 화면용 셰이프로 매핑
  const categories: Category[] = (apiCategories ?? []).map(mapCategory)
  const problems: Problem[] = (group?.problems ?? []).map(mapProblem)
  const members: Member[] = (group?.members ?? []).map((u: any) => ({
    id: u.user_id,
    name: u.username,
    studentId: u.student_no !== null ? String(u.student_no) : '-',
    grade: u.grade, // 👈 학년 데이터 매핑 추가!
    role: group?.owner.user_id === u.user_id ? 'owner' : 'student',
    joinedAt: u.created_at ? u.created_at.slice(0, 10) : '',
  }))
  // [버그 수정] "참여 중인 수강생" 등은 교수님을 빼고 세야 합니다.
  const studentMembers = members.filter((m) => m.role !== 'owner')
  // [버그 수정] 제출/전체 건수가 실데이터 없이 항상 "0 / 10"으로 고정 표시되고
  // 있었습니다. 실제 출석률 API로 교체합니다.
  const { data: attendance } = useQuery<Array<{ user_id: string; submitted_count: number; total_problems: number }>>(
    isOwner && group ? `/api/group/${group.group_id}/attendance` : null,
  )

  // 📂 카테고리 접기/펼치기 상태
  const [expandedCatIds, setExpandedCatIds] = useState<string[]>([])

  // 🔲 모달 상태
  const [isAddCatModalOpen, setIsAddCatModalOpen] = useState(false)
  const [newCatType, setNewCatType] = useState<'general' | 'exam'>('general')
  const [newCatTitle, setNewCatTitle] = useState('')
  const [newCatStartDate, setNewCatStartDate] = useState('')

  const [isCreateProblemModalOpen, setIsCreateProblemModalOpen] = useState(false)
  const [newProblemTitle, setNewProblemTitle] = useState('')
  const [newProblemDescription, setNewProblemDescription] = useState('')
  const [newProblemDifficulty, setNewProblemDifficulty] = useState('medium')
  const [newProblemTargetCat, setNewProblemTargetCat] = useState('')
  const [newProblemStartDate, setNewProblemStartDate] = useState('')
  const [newProblemStartHour, setNewProblemStartHour] = useState('00')
  const [newProblemStartMinute, setNewProblemStartMinute] = useState('00')
  const [newProblemDeadlineDate, setNewProblemDeadlineDate] = useState('')
  const [newProblemDeadlineHour, setNewProblemDeadlineHour] = useState('23')
  const [newProblemDeadlineMinute, setNewProblemDeadlineMinute] = useState('59')

  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false)

  // 📆 date/시/분 조합을 만들기 위한 기본값 헬퍼
  const formatDatePart = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }

  const openCreateProblemModal = () => {
    const now = new Date()
    const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    setNewProblemTitle('')
    setNewProblemDescription('')
    setNewProblemDifficulty('medium')
    setNewProblemTargetCat(categories[0]?.id || '')
    setNewProblemStartDate(formatDatePart(now))
    setNewProblemStartHour('00')
    setNewProblemStartMinute('00')
    setNewProblemDeadlineDate(formatDatePart(weekLater))
    setNewProblemDeadlineHour('23')
    setNewProblemDeadlineMinute('59')
    setIsCreateProblemModalOpen(true)
  }

  // 🎯 영역별 카테고리(항목) 개수 세기 헬퍼 함수
  const getCategoryCount = (type: 'general' | 'exam') => {
    return categories.filter((c) => c.type === type).length
  }

  // 핸들러 함수
  const toggleCategory = (catId: string) => {
    setExpandedCatIds((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId]
    )
  }

  const getCategoryProblems = (catId: string) => {
    return problems.filter((p) => p.categoryId === catId)
  }

  const handleAddCategory = async () => {
    if (!group) return
    if (!newCatTitle.trim()) return toast.error('항목 이름을 입력해주세요.')

    try {
      // [신규] 시작일만 입력하면 종료일(마감/현재주차 판정)은 서버가 +7일로 자동 계산합니다.
      const startsAtIso = newCatStartDate ? new Date(`${newCatStartDate}T00:00:00`).toISOString() : null
      const created = await fetcher<ApiCategory>('/api/category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: group.group_id, title: newCatTitle, type: newCatType, starts_at: startsAtIso }),
      })
      await refreshCategories()
      setExpandedCatIds((prev) => [...prev, String(created.category_id)])
      toast.success(`'${newCatTitle}' 항목이 추가되었습니다.`)
      setNewCatTitle('')
      setNewCatStartDate('')
      setIsAddCatModalOpen(false)
    } catch (err) {
      toast.error('항목 추가에 실패했습니다. 잠시 후 다시 시도해주세요.')
    }
  }

  const handleDeleteCategory = async (e: React.MouseEvent, catId: string) => {
    e.stopPropagation()
    if (getCategoryProblems(catId).length > 0) {
      return toast.error('항목 내에 포함된 문제지가 있어 삭제할 수 없습니다.')
    }

    if (confirm('해당 항목을 삭제하시겠습니까?')) {
      try {
        await fetcher(`/api/category/${catId}`, { method: 'DELETE' })
        await refreshCategories()
        toast.success('항목이 삭제되었습니다.')
      } catch (err) {
        toast.error('항목 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.')
      }
    }
  }

  const handleCreateProblem = async () => {
    if (!group) return
    if (!newProblemTitle.trim()) return toast.error('문제지 제목을 입력해주세요.')
    if (!newProblemStartDate || !newProblemDeadlineDate) return toast.error('시작일과 마감일을 입력해주세요.')

    const startsAt = new Date(`${newProblemStartDate}T${newProblemStartHour}:${newProblemStartMinute}:00`)
    const deadline = new Date(`${newProblemDeadlineDate}T${newProblemDeadlineHour}:${newProblemDeadlineMinute}:00`)
    if (deadline <= startsAt) return toast.error('마감일은 시작일보다 이후여야 합니다.')

    try {
      await fetcher('/api/problem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group_id: group.group_id,
          category_id: newProblemTargetCat ? Number(newProblemTargetCat) : null,
          question_count: 0,
          title: newProblemTitle,
          description: newProblemDescription,
          difficulty: newProblemDifficulty,
          starts_at: startsAt.toISOString(),
          deadline: deadline.toISOString(),
          hide_before_start: false,
        }),
      })
      await refreshGroup()
      if (newProblemTargetCat && !expandedCatIds.includes(newProblemTargetCat)) {
        setExpandedCatIds((prev) => [...prev, newProblemTargetCat])
      }

      toast.success(`'${newProblemTitle}' 문제지가 생성되었습니다.`)
      setNewProblemTitle('')
      setIsCreateProblemModalOpen(false)
    } catch (err) {
      toast.error('문제지 생성에 실패했습니다. 잠시 후 다시 시도해주세요.')
    }
  }

  const handleDeleteProblem = async (e: React.MouseEvent, problemId: string) => {
    e.stopPropagation()
    if (confirm('정말로 이 문제지를 삭제하시겠습니까?')) {
      try {
        await fetcher(`/api/problem/${problemId}`, { method: 'DELETE' })
        await refreshGroup()
        toast.success('문제지가 삭제되었습니다.')
      } catch (err) {
        toast.error('문제지 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.')
      }
    }
  }

  const handleDeleteMember = async (memberId: string, memberName: string) => {
    if (!group) return
    if (confirm(`${memberName} 학생을 그룹에서 제외하시겠습니까?`)) {
      try {
        await fetcher(`/api/group/${group.group_id}/members/${memberId}`, { method: 'DELETE' })
        await refreshGroup()
        toast.success('학생을 수강 목록에서 삭제했습니다.')
      } catch (err) {
        toast.error('학생 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.')
      }
    }
  }

  // [breadcrumb 이동] /problem?groupId=..&categoryId=.. 로 들어오면 해당 카테고리를
  // 펼치고 그 위치로 스크롤합니다. (다른 페이지의 breadcrumb에서 클릭해 들어오는 경로)
  // 주의: hooks는 조건부 return보다 반드시 앞에 있어야 합니다.
  useEffect(() => {
    const targetCategoryId = searchParams.get('categoryId')
    if (!targetCategoryId) return
    setExpandedCatIds((prev) => (prev.includes(targetCategoryId) ? prev : [...prev, targetCategoryId]))
    const el = document.getElementById(`category-${targetCategoryId}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, categories.length])

  if (!group) {
    return <Skeleton className='h-screen w-full' />
  }

  return (
    <div className='min-h-screen bg-[#fafafa] text-slate-800 pb-12 font-sans'>
      <Header user={me} />

      {/* 🔝 1. 상단 글로벌 GNB 헤더 영역 (우측 메뉴 제거됨) */}
      <header className='w-full bg-white border-b border-slate-100 px-6 py-2.5 flex justify-between items-center text-xs text-slate-500'>
        <div className='flex items-center gap-2'>
          <BackButton />
          <span
            className='cursor-pointer hover:underline hover:text-slate-700'
            onClick={() => router.push('/groups')}
          >
            나의 그룹들
          </span>
          <span>&gt;</span>
          <span className='font-medium text-slate-700 flex items-center gap-1'>
            📚 {group.group_name}
          </span>
        </div>
      </header>

      <div className='max-w-7xl mx-auto px-6 pt-6 space-y-6'>
        
        {/* 🖼️ 2. 메인 수강 과목 배너 */}
        <div className='relative w-full h-44 rounded-2xl overflow-hidden bg-slate-900 flex items-center px-10 shadow-sm'>
          <div className='absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent z-10' />
          <img 
            src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1200&q=80" 
            alt="Banner" 
            className="absolute inset-0 w-full h-full object-cover opacity-60 mix-blend-overlay"
          />
          <div className='relative z-20 text-white space-y-1.5'>
            <h1 className='text-3xl font-bold tracking-tight'>{group.group_name}</h1>
            <p className='text-zinc-300 text-sm font-normal'>{group.description}</p>
          </div>
        </div>

        {/* 🎛️ 3. 상단 액션 버튼 바 */}
        <div className='flex justify-end items-center gap-2'>
  {/* 1. 수강생/학생 현황 (isOwner일 때만 표시) */}
  {isOwner && (
    <Button 
      size='icon' 
      className='rounded-xl bg-[#1e293b] hover:bg-[#0f172a] text-white size-9 shadow-2xs' 
      onClick={() => setIsMembersModalOpen(true)}
      title='참여 인원 보기'
    >
      <UsersIcon className='size-4' />
    </Button>
  )}

  {/* 2. 새로고침 (모든 사용자 공통) */}
  <Button 
    size='icon' 
    className='rounded-xl bg-[#3b82f6] hover:bg-[#2563eb] text-white size-9 shadow-2xs'
    onClick={async () => {
      await Promise.all([refreshGroup(), refreshCategories()])
      toast.success('데이터가 새로고침되었습니다.')
    }}
    title='새로고침'
  >
    <RefreshCw className='size-4' />
  </Button>

  {/* 3. 그룹 설정 & 4. 문제지 생성하기 (isOwner일 때만 표시) */}
  {isOwner && (
    <>
      <Button 
        size='icon' 
        className='rounded-xl bg-[#E25193] hover:bg-[#D03E80] text-white size-9 shadow-2xs transition-colors' 
        onClick={() => router.push(`/groups/settings?groupId=${group.group_id}`)}
        title='그룹 설정'
      >
        <Settings className='size-4' />
      </Button>

      <Button 
        onClick={openCreateProblemModal}
        className='rounded-xl bg-[#65a30d] hover:bg-[#4d7c0f] text-white gap-1 px-4 font-semibold text-sm h-9 shadow-2xs ml-1'
      >
        <PlusIcon className='size-4' /> 문제지 생성하기
      </Button>
    </>
  )}
</div>

        {/* 📌 4. 메인 콘텐츠 섹션 */}
        <div className='space-y-4'>
          <h2 className='text-lg font-bold text-slate-800 tracking-tight'>나의 문제지</h2>

          <div className='grid grid-cols-1 lg:grid-cols-2 gap-6 items-start'>
            
            {/* 🟢 1. 일반 문제지 컬럼 */}
            <div className='border border-emerald-100 bg-[#f7fbf8] rounded-2xl p-5 space-y-3.5 shadow-2xs'>
              <div className='flex justify-between items-center px-1'>
                <div className='flex items-center gap-1.5'>
                  <h3 className='font-bold text-[#2e7d32] text-sm'>일반 문제지</h3>
                  {isOwner && (
                    <button 
                      onClick={() => {
                        setNewCatType('general')
                        setIsAddCatModalOpen(true)
                      }}
                      className='size-4.5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center hover:bg-emerald-200 transition-colors'
                      title='일반 항목 추가'
                    >
                      <PlusIcon className='size-3' />
                    </button>
                  )}
                </div>
                <span className='text-xs font-semibold bg-[#e8f5e9] text-[#2e7d32] px-2.5 py-0.5 rounded-full'>
                  {getCategoryCount('general')}개
                </span>
              </div>

              {/* 일반 카테고리 아코디언 목록 */}
              <div className='space-y-2.5'>
                {categories.filter((c) => c.type === 'general').map((cat) => {
                  const catProblems = getCategoryProblems(cat.id)
                  const isExpanded = expandedCatIds.includes(cat.id)

                  return (
                    <div key={cat.id} id={`category-${cat.id}`} className='border border-emerald-100/70 rounded-2xl bg-[#edf7ed]/50 overflow-hidden transition-all scroll-mt-24'>
                      <div
                        onClick={() => toggleCategory(cat.id)}
                        className='flex justify-between items-center px-4 py-3 cursor-pointer hover:bg-emerald-100/40 transition-colors select-none'
                      >
                        <span className='font-semibold text-xs text-slate-700'>{cat.title}</span>
                        <div className='flex items-center gap-2'>
                          <span className='text-[11px] bg-[#e8f5e9] text-[#2e7d32] font-semibold px-2 py-0.5 rounded-full'>
                            {catProblems.length}개
                          </span>
                          {isOwner && (
                            <button
                              onClick={(e) => handleDeleteCategory(e, cat.id)}
                              className='text-slate-400 hover:text-rose-600 p-0.5 transition-colors'
                              title='항목 삭제'
                            >
                              <Trash2Icon className='size-3.5' />
                            </button>
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className='p-3 pt-0 bg-white space-y-2 border-t border-emerald-100/50'>
                          {catProblems.length === 0 ? (
                            <div className='py-4 text-center text-xs text-slate-400 border border-dashed rounded-lg bg-slate-50 mt-2'>
                              등록된 문제지가 없습니다.
                            </div>
                          ) : (
                            catProblems.map((p) => (
                              <div
                                key={p.id}
                                onClick={() => router.push(`/problem/${p.id}?groupId=${group.group_id}&categoryId=${cat.id}`)}
                                className='p-3 bg-white space-y-1.5 rounded-xl border border-slate-100 mt-2 shadow-2xs cursor-pointer hover:border-emerald-200 hover:bg-emerald-50/30 transition-colors'
                              >
                                <div className='flex justify-between items-start'>
                                  <h4 className='font-bold text-xs text-slate-800'>{p.title}</h4>
                                  {isOwner && (
                                    <button 
                                      onClick={(e) => handleDeleteProblem(e, p.id)}
                                      className='text-slate-400 hover:text-rose-600 p-0.5'
                                    >
                                      <Trash2Icon className='size-3.5' />
                                    </button>
                                  )}
                                </div>
                                <p className='text-[11px] text-slate-400'>생성일 · {p.createdAt} | 문항수 · {p.questionCount}개</p>
                                {p.dateStr && (
                                  <div className='bg-[#f1f8f2] rounded-lg p-2 text-[11px] text-[#2e7d32] space-y-0.5 font-medium border border-emerald-100/60'>
                                    <div className='flex items-center gap-1.5'>
                                      <CalendarIcon className='size-3 text-emerald-600' />
                                      <span>날짜 : <strong>{p.dateStr}</strong></span>
                                    </div>
                                    <div className='flex items-center gap-1.5'>
                                      <ClockIcon className='size-3 text-emerald-600' />
                                      <span>제출시간 : <strong>{p.timeStr}</strong></span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 🔴 2. 시험 문제지 컬럼 */}
<div className='border border-rose-100 bg-[#fffafa] rounded-2xl p-5 space-y-3.5 shadow-2xs'>
  <div className='flex justify-between items-center px-1'>
    <div className='flex items-center gap-1.5'>
      <h3 className='font-bold text-[#c62828] text-sm'>시험 문제지</h3>
      {isOwner && (
        <button 
          onClick={() => {
            setNewCatType('exam')
            setIsAddCatModalOpen(true)
          }}
          className='size-4.5 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center hover:bg-rose-200 transition-colors'
          title='시험 항목 추가'
        >
          <PlusIcon className='size-3' />
        </button>
      )}
    </div>
    <span className='text-xs font-semibold bg-[#ffebee] text-[#c62828] px-2.5 py-0.5 rounded-full'>
      {getCategoryCount('exam')}개
    </span>
  </div>

  {/* 시험 카테고리 목록 */}
  <div className='space-y-2.5'>
    {categories.filter((c) => c.type === 'exam').map((cat) => {
      const catProblems = getCategoryProblems(cat.id)
      const isExpanded = expandedCatIds.includes(cat.id)

      return (
        <div key={cat.id} id={`category-${cat.id}`} className='border border-rose-100/70 rounded-2xl bg-[#fff5f5]/40 overflow-hidden transition-all scroll-mt-24'>
          {/* 카테고리 헤더 */}
          <div
            onClick={() => toggleCategory(cat.id)}
            className='flex justify-between items-center px-4 py-3 cursor-pointer hover:bg-rose-100/30 transition-colors select-none'
          >
            <div className='flex items-center gap-2'>
              <span className='font-semibold text-xs text-slate-700'>{cat.title}</span>
              <span className='text-[11px] bg-rose-100/80 text-rose-700 font-semibold px-2 py-0.5 rounded-full'>
                {catProblems.length}개
              </span>
              {cat.period && <span className='text-[11px] text-slate-400 font-normal ml-1'>{cat.period}</span>}
              {cat.isCurrentWeek && (
                <span className='text-[10px] font-bold bg-[#e53935] text-white px-2 py-0.5 rounded-full ml-1'>
                  현재 주차
                </span>
              )}
            </div>

            <div className='flex items-center gap-2'>
              {isOwner && (
                <button
                  onClick={(e) => {
                    e.stopPropagation() // 카테고리 열림/닫힘 토글 방지
                    handleDeleteCategory(e, cat.id)
                  }}
                  className='text-slate-400 hover:text-rose-600 p-0.5 transition-colors'
                  title='항목 삭제'
                >
                  <Trash2Icon className='size-3.5' />
                </button>
              )}
            </div>
          </div>

          {/* 카테고리 바디 (아코디언 내용) */}
          {isExpanded && (
            <div className='p-3 pt-0 bg-white space-y-2 border-t border-rose-100/50'>
              {catProblems.length === 0 ? (
                <div className='py-4 text-center text-xs text-slate-400 border border-dashed rounded-lg bg-slate-50 mt-2'>
                  등록된 문제지가 없습니다.
                </div>
              ) : (
                catProblems.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => router.push(`/problem/${p.id}?groupId=${group.group_id}&categoryId=${cat.id}`)}
                    className='p-3 bg-white space-y-1.5 rounded-xl border border-slate-100 mt-2 shadow-2xs cursor-pointer hover:border-rose-200 hover:bg-rose-50/20 transition-colors'
                  >
                    <div className='flex justify-between items-start'>
                      <div>
                        <h4 className='font-bold text-xs text-slate-800'>{p.title}</h4>
                        <p className='text-[11px] text-slate-400 mt-1'>
                          생성일 · {p.createdAt} | 문항수 · {p.questionCount}개
                        </p>
                        {p.description && (
                          <p className='text-[11px] text-slate-500 mt-1'>
                            문제지 설명 : {p.description}
                          </p>
                        )}
                      </div>
                      {isOwner && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation() // 페이지 이동 방지
                            handleDeleteProblem(e, p.id)
                          }}
                          className='text-slate-400 hover:text-rose-600 p-0.5'
                        >
                          <Trash2Icon className='size-3.5' />
                        </button>
                      )}
                    </div>

                    {p.dateStr && (
                      <div className='bg-[#fff5f5] rounded-lg p-2 text-[11px] text-[#c62828] space-y-0.5 font-medium border border-rose-100/60 mt-1'>
                        <div className='flex items-center gap-1.5'>
                          <CalendarIcon className='size-3 text-rose-500' />
                          <span>날짜 : <strong>{p.dateStr}</strong></span>
                        </div>
                        <div className='flex items-center gap-1.5'>
                          <ClockIcon className='size-3 text-rose-500' />
                          <span>제출시간 : <strong>{p.timeStr}</strong></span>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )
    })}
  </div>
</div>

          </div>
        </div>
      </div>

      {/* 🔲 모달 영역 */}
      <Dialog open={isAddCatModalOpen} onOpenChange={setIsAddCatModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{newCatType === 'general' ? '일반 문제지' : '시험 문제지'} 항목 추가</DialogTitle>
          </DialogHeader>
          <div className='space-y-4 py-2'>
            <div className='space-y-2'>
              <Label htmlFor='cat-title'>항목명 (예: 6주차, 기말고사 등)</Label>
              <Input 
                id='cat-title' 
                placeholder='이름을 입력하세요' 
                value={newCatTitle} 
                onChange={(e) => setNewCatTitle(e.target.value)} 
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='cat-start-date'>시작 날짜 (선택 - 입력하면 7일 뒤가 자동으로 종료일이 되고, 현재 기간에 맞춰 &quot;현재 주차&quot;로 표시돼요)</Label>
              <Input
                id='cat-start-date'
                type='date'
                value={newCatStartDate}
                onChange={(e) => setNewCatStartDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setIsAddCatModalOpen(false)}>취소</Button>
            <Button onClick={handleAddCategory}>항목 추가하기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateProblemModalOpen} onOpenChange={setIsCreateProblemModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>새 문제지 생성하기</DialogTitle>
          </DialogHeader>
          <div className='space-y-4 py-2 max-h-[70vh] overflow-y-auto'>
            <div className='space-y-2'>
              <Label htmlFor='prob-title'>문제지 제목</Label>
              <Input 
                id='prob-title' 
                placeholder='문제지 제목을 입력하세요' 
                value={newProblemTitle} 
                onChange={(e) => setNewProblemTitle(e.target.value)} 
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='prob-desc'>문제지 소개</Label>
              <Textarea
                id='prob-desc'
                placeholder='문제지에 대한 간단한 설명을 입력하세요 (선택)'
                value={newProblemDescription}
                onChange={(e) => setNewProblemDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='prob-cat'>등록할 항목 선택</Label>
              <select 
                id='prob-cat' 
                className='w-full border rounded-md p-2 text-sm bg-background'
                value={newProblemTargetCat}
                onChange={(e) => setNewProblemTargetCat(e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    [{c.type === 'general' ? '일반' : '시험'}] {c.title}
                  </option>
                ))}
              </select>
            </div>
            <div className='space-y-2'>
              <Label>게시 시작 시간</Label>
              <div className='flex gap-1.5'>
                <Input
                  type='date'
                  value={newProblemStartDate}
                  onChange={(e) => setNewProblemStartDate(e.target.value)}
                  className='flex-1'
                />
                <select
                  value={newProblemStartHour}
                  onChange={(e) => setNewProblemStartHour(e.target.value)}
                  className='border rounded-md px-1 text-sm'
                >
                  {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                <select
                  value={newProblemStartMinute}
                  onChange={(e) => setNewProblemStartMinute(e.target.value)}
                  className='border rounded-md px-1 text-sm'
                >
                  {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className='space-y-2'>
              <Label>제출 마감 시간</Label>
              <div className='flex gap-1.5'>
                <Input
                  type='date'
                  value={newProblemDeadlineDate}
                  onChange={(e) => setNewProblemDeadlineDate(e.target.value)}
                  className='flex-1'
                />
                <select
                  value={newProblemDeadlineHour}
                  onChange={(e) => setNewProblemDeadlineHour(e.target.value)}
                  className='border rounded-md px-1 text-sm'
                >
                  {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                <select
                  value={newProblemDeadlineMinute}
                  onChange={(e) => setNewProblemDeadlineMinute(e.target.value)}
                  className='border rounded-md px-1 text-sm'
                >
                  {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setIsCreateProblemModalOpen(false)}>취소</Button>
            <Button className='bg-emerald-600 hover:bg-emerald-700 text-white' onClick={handleCreateProblem}>
              생성 및 추가
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isMembersModalOpen} onOpenChange={setIsMembersModalOpen}>
  <DialogContent className='bg-[#FCFCFC] text-foreground border-slate-100 rounded-3xl p-6 shadow-lg max-w-xl max-h-[85vh] overflow-y-auto'>
    <DialogHeader className='border-b border-slate-100 pb-4'>
      <DialogTitle className='text-xl font-bold text-foreground flex items-center gap-2'>
        <UserCheckIcon className='size-5 text-[#589960]' />
        참여 중인 수강생 <span className='text-xs font-normal text-slate-500'>({studentMembers.length}명)</span>
      </DialogTitle>
    </DialogHeader>

    <Tabs defaultValue='members' className='mt-2 w-full'>
      <TabsList className='grid w-full grid-cols-2 bg-slate-100 rounded-xl p-1'>
        <TabsTrigger value='members' className='rounded-lg text-xs font-semibold gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm'>
          <ListFilterIcon className='size-3.5' /> 수강생 과제 현황
        </TabsTrigger>
        <TabsTrigger value='analytics' className='rounded-lg text-xs font-semibold gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm'>
          <PieChartIcon className='size-3.5' /> 학년 및 통계
        </TabsTrigger>
      </TabsList>

      {/* 1. 수강생 목록 & 과제 제출 현황 (삭제 버튼 제거됨) */}
      <TabsContent value='members' className='mt-4 space-y-3'>
        <div className='max-h-80 overflow-y-auto pr-1 space-y-2.5'>
          {studentMembers.map((m) => {
            const a = attendance?.find((r) => r.user_id === m.id)
            const submitted = a?.submitted_count ?? 0
            const total = a?.total_problems ?? 0
            const rate = total > 0 ? Math.round((submitted / total) * 100) : 0

            return (
                <div key={m.id} className='bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col gap-2.5'>
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-2.5'>
                      <div className='w-8 h-8 rounded-full bg-[#589960]/10 text-[#589960] flex items-center justify-center font-bold text-sm'>
                        {m.name?.[0] || '학'}
                      </div>
                      <div>
                        <div className='flex items-center gap-2'>
                          <span className='font-bold text-sm text-slate-800'>{m.name}</span>
                          <span className='text-xs text-slate-400'>({(m as any).studentId || (m as any).student_no || '-'})</span>
                        </div>
                        <p className='text-[11px] text-slate-400 mt-0.5'>가입일: {(m as any).joinedAt || '-'}</p>
                      </div>
                    </div>

                    <div className='text-right'>
                      <span className='text-xs font-bold text-[#589960]'>
                        {submitted} / {total}건 제출
                      </span>
                      <p className='text-[11px] text-slate-400'>달성률 {rate}%</p>
                    </div>
                  </div>

                  <div className='w-full bg-slate-100 h-2 rounded-full overflow-hidden'>
                    <div
                      className='bg-[#589960] h-full transition-all duration-300'
                      style={{ width: `${rate}%` }}
                    />
                  </div>
                </div>
              )
            })}
        </div>
      </TabsContent>

      {/* 2. 학년 분포 및 과제 제출 통계 (도넛 차트 + 테이블) */}
      <TabsContent value='analytics' className='mt-4'>
        <div className='bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-5'>
          <div className='text-center'>
            <h4 className='text-sm font-bold text-slate-800 flex items-center justify-center gap-1.5'>
              <GraduationCapIcon className='size-4 text-[#589960]' /> 학년 분포 현황
            </h4>
          </div>

          {/* 학년별 인원 계산 및 차트 영역 */}
          {(() => {
            const chartData = [
              { name: '1학년', value: studentMembers.filter(m => (m as any).grade === 1 || (m as any).grade === '1학년' || (m as any).grade === '1').length, color: '#4285F4' },
              { name: '2학년', value: studentMembers.filter(m => (m as any).grade === 2 || (m as any).grade === '2학년' || (m as any).grade === '2').length, color: '#34A853' },
              { name: '3학년', value: studentMembers.filter(m => (m as any).grade === 3 || (m as any).grade === '3학년' || (m as any).grade === '3').length, color: '#FBBC05' },
              { name: '4학년', value: studentMembers.filter(m => (m as any).grade === 4 || (m as any).grade === '4학년' || (m as any).grade === '4').length, color: '#EA4335' },
            ]

            const totalGradedStudents = chartData.reduce((acc, cur) => acc + cur.value, 0)

            return (
              <>
                <div className='h-48 w-full flex items-center justify-center'>
                  {totalGradedStudents > 0 ? (
                    <PieChart width={280} height={192}>
                      <Pie
                        data={chartData}
                        cx='50%'
                        cy='50%'
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={3}
                        dataKey='value'
                      >
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  ) : (
                    <div className='text-xs text-slate-400 font-medium py-10'>
                      등록된 학년 정보가 없습니다.
                    </div>
                  )}
                </div>

                {/* 요약 테이블 */}
                <div className='border border-slate-100 rounded-xl overflow-hidden'>
                  <table className='w-full text-xs text-left'>
                    <thead className='bg-slate-50 border-b border-slate-100 text-slate-600 font-semibold'>
                      <tr>
                        <th className='p-2.5 pl-4'>학년</th>
                        <th className='p-2.5 text-right pr-4'>인원(명)</th>
                      </tr>
                    </thead>
                    <tbody className='divide-y divide-slate-100 text-slate-700'>
                      {chartData.map((row) => (
                        <tr key={row.name} className='hover:bg-slate-50/50'>
                          <td className='p-2 pl-4 flex items-center gap-2'>
                            <span className='size-2.5 rounded-full' style={{ backgroundColor: row.color }} />
                            {row.name}
                          </td>
                          <td className='p-2 text-right pr-4 font-semibold'>{row.value}명</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )
          })()}
        </div>
      </TabsContent>
    </Tabs>

    <DialogFooter className='mt-4'>
      <Button 
        variant='outline' 
        className='w-full rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50' 
        onClick={() => setIsMembersModalOpen(false)}
      >
        닫기
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

    </div>
  )
}

// [구조 변경 복구] GroupProvider가 예전엔 [groupId] 폴더의 layout.tsx가 자동으로
// 감싸줬지만, 평탄 구조에는 그런 layout이 없으므로 이 페이지에서 직접 감쌉니다.
// GroupProvider가 useSearchParams를 쓰므로 Suspense 경계도 함께 필요합니다.
export default function IntegratedGroupPage() {
  return (
    <Suspense fallback={<Skeleton className='h-screen w-full' />}>
      <GroupProvider>
        <IntegratedGroupPageContent />
      </GroupProvider>
    </Suspense>
  )
}
