'use client'

import React, { Suspense, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  LoaderCircleIcon,
  LinkIcon,
  TrashIcon,
  CheckIcon,
  XIcon,
  RefreshCw,
} from 'lucide-react'

import { GroupProvider, useGroup } from '@/context/group-provider'
import { useMe } from '@/context/me-provider'
import { useGroupOwner } from '@/lib/useGroupOwner'
import { useCategories } from '@/lib/useCategories'
import { useQuery } from '@/lib/useQuery'
import { fetcher } from '@/lib/fetcher'
import type { Category } from '@/types/category'
import type { User } from '@/types/user'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { BackButton } from '@/components/back-button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface ProblemDraft {
  title: string
  description: string
  examMode: boolean
  date: string
  hour: string
  minute: string
  endDate: string
  endHour: string
  endMinute: string
  categoryId?: number
  hideBeforeStart?: boolean
}

const toDraftDateTime = (isoString?: string, addDays = 0) => {
  const d = isoString ? new Date(isoString) : new Date()
  if (addDays > 0) {
    d.setDate(d.getDate() + addDays)
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    hour: pad(d.getHours()),
    minute: pad(d.getMinutes()),
  }
}

const fromDraftDateTime = (date?: string, hour?: string, minute?: string) => {
  if (!date) return undefined
  return new Date(`${date}T${hour || '00'}:${minute || '00'}:00`).toISOString()
}

// 날짜 포맷 변환 (YYYY. M. D.)
const formatDate = (dateStr?: string) => {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '-'
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`
}

function GroupSettingsContent () {
  const { group, refresh: refreshGroup } = useGroup()
  const { me } = useMe()
  const isOwner = useGroupOwner()
  const { categories, mutate: refreshCategories } = useCategories(group?.group_id ?? null)
  const { data: pendingInvites, mutate: refreshInvites } = useQuery<User[]>(
    group ? `/api/group/${group.group_id}/invite-queues` : null,
  )

  const [groupNameDraft, setGroupNameDraft] = useState('')
  const [problemDrafts, setProblemDrafts] = useState<Record<string, ProblemDraft>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isMembersOpen, setIsMembersOpen] = useState(true)
  const [isInvitesOpen, setIsInvitesOpen] = useState(true)
  const [isProblemsOpen, setIsProblemsOpen] = useState(true)

  // 모달 제어
  const [selectedUserId, setSelectedUserId] = useState<number | string | null>(null)
  const [isKickModalOpen, setIsKickModalOpen] = useState(false)
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false)
  const [isAcceptModalOpen, setIsAcceptModalOpen] = useState(false)

  const initializedRef = useRef(false)
  useEffect(() => {
    if (initializedRef.current || !group || !categories) return
    initializedRef.current = true
    setGroupNameDraft(group.group_name)
    const drafts: Record<string, ProblemDraft> = {}
    for (const p of group.problems) {
      const category = categories.find((c) => c.category_id === p.category_id)
      const startDt = toDraftDateTime(p.starts_at)
      const endDt = p.deadline 
        ? toDraftDateTime(p.deadline) 
        : toDraftDateTime(p.starts_at, 7)

      drafts[String(p.problem_id)] = {
        title: p.title,
        description: p.description ?? '',
        examMode: category?.type === 'exam',
        date: startDt.date,
        hour: startDt.hour,
        minute: startDt.minute,
        endDate: endDt.date,
        endHour: p.deadline ? endDt.hour : '23',
        endMinute: p.deadline ? endDt.minute : '59',
        categoryId: p.category_id ?? undefined,
        hideBeforeStart: p.hide_before_start ?? false,
      }
    }
    setProblemDrafts(drafts)
  }, [group, categories])

  if (!group || !categories || !isOwner) {
    return <Skeleton className='h-screen w-full' />
  }

  const inviteUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/groups/invites?invitesId=${group.invite_code}`
    : ''

  const updateDraft = (problemId: string, patch: Partial<ProblemDraft>) => {
    setProblemDrafts((prev) => ({ ...prev, [problemId]: { ...prev[problemId], ...patch } }))
  }

  const onDeleteProblem = async (problemId: number) => {
    try {
      await fetcher(`/api/problem/${problemId}`, { method: 'DELETE' })
      toast.success('문제지가 삭제되었습니다.')
      await refreshGroup()
    } catch {
      toast.error('문제지 삭제에 실패했습니다.')
    }
  }

  const resolveCategoryId = async (
    examMode: boolean,
    selectedCatId: number | undefined,
    categoryCache: Map<string, number>,
  ): Promise<number> => {
    if (selectedCatId) return selectedCatId
    const targetType = examMode ? 'exam' : 'general'
    if (categoryCache.has(targetType)) return categoryCache.get(targetType)!

    const existing = categories!.find((c) => c.type === targetType)
    if (existing) {
      categoryCache.set(targetType, existing.category_id)
      return existing.category_id
    }
    const created = await fetcher<Category>('/api/category', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        group_id: group.group_id,
        title: examMode ? '시험 문제지' : '일반 문제지',
        type: targetType,
      }),
    })
    categoryCache.set(targetType, created.category_id)
    return created.category_id
  }

  const onSaveAll = async () => {
    setIsSaving(true)
    try {
      if (groupNameDraft.trim() && groupNameDraft !== group.group_name) {
        await fetcher(`/api/group/${group.group_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: groupNameDraft, description: group.description }),
        })
      }

      const categoryCache = new Map<string, number>()
      for (const p of group.problems) {
        const draft = problemDrafts[String(p.problem_id)]
        if (!draft) continue

        const newStartsAt = fromDraftDateTime(draft.date, draft.hour, draft.minute)
        const newDeadline = fromDraftDateTime(draft.endDate, draft.endHour, draft.endMinute)
        const categoryId = await resolveCategoryId(draft.examMode, draft.categoryId, categoryCache)

        await fetcher(`/api/problem/${p.problem_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            group_id: p.group_id,
            category_id: categoryId,
            question_count: p.question_count,
            title: draft.title,
            description: draft.description,
            difficulty: p.difficulty,
            starts_at: newStartsAt,
            deadline: newDeadline,
            hide_before_start: draft.examMode ? draft.hideBeforeStart : false,
          }),
        })
      }

      await Promise.all([refreshGroup(), refreshCategories()])
      toast.success('변경사항이 저장되었습니다.')
    } catch {
      toast.error('저장 중 오류가 발생했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  const onDeleteGroup = async () => {
    setIsDeleting(true)
    try {
      await fetcher(`/api/group/${group.group_id}`, { method: 'DELETE' })
      toast.success('그룹이 삭제되었습니다.')
      window.location.href = '/groups'
    } catch {
      toast.error('그룹 삭제에 실패했습니다.')
      setIsDeleting(false)
    }
  }

  const onAcceptAllInvites = async () => {
    try {
      await fetcher(`/api/group/${group.group_id}/invites/all`, { method: 'POST' })
      toast.success('모든 가입 신청을 수락했습니다.')
      await Promise.all([refreshGroup(), refreshInvites()])
    } catch {
      toast.error('가입 신청 수락에 실패했습니다.')
    }
  }

  const handleKickMember = async (userId: number | string) => {
    try {
      await fetcher(`/api/group/${group.group_id}/members/${userId}`, { method: 'DELETE' })
      toast.success('그룹원을 추방했습니다.')
      await refreshGroup()
    } catch {
      toast.error('추방 처리에 실패했습니다.')
    }
  }

  const handleAcceptInvite = async (userId: number | string) => {
    try {
    // ❌ 기존: /accept 경로 포함됨 -> ✅ 수정: /accept 제거
    await fetcher(`/api/group/${group.group_id}/invites/${userId}`, { method: 'POST' })
    toast.success('가입 신청을 수락했습니다.')
    await Promise.all([refreshGroup(), refreshInvites()])
  } catch {
    toast.error('수락 처리에 실패했습니다.')
  }
  }

  const handleRejectInvite = async (userId: number | string) => {
    try {
    // ❌ 기존: /reject 경로 포함됨 -> ✅ 수정: /reject 제거
    await fetcher(`/api/group/${group.group_id}/invites/${userId}`, { method: 'DELETE' })
    toast.success('가입 신청을 거절했습니다.')
    await refreshInvites()
  } catch {
    toast.error('거절 처리에 실패했습니다.')
  }
  }

  const examCategories = categories.filter((c) => c.type === 'exam')
  const membersList = (group?.members ?? []).filter((m) => m.user_id !== group?.owner_id)

  return (
    <div className='min-h-screen bg-[#f8fafc] pb-16'>
      {/* 상단 헤더 */}
      <div className='sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-slate-100 flex items-center justify-between px-8 py-4'>
        <div className='flex items-center gap-3'>
          <BackButton />
          <div>
            <h1 className='text-lg font-bold text-slate-800'>그룹 관리</h1>
            <p className='text-xs text-slate-400'>
              그룹의 기본 설정과 멤버, 문제지를 한 곳에서 관리하세요.
            </p>
          </div>
        </div>

        <Button
          onClick={onSaveAll}
          disabled={isSaving}
          className='bg-[#589960] hover:bg-[#477a4d] text-white rounded-xl px-5 h-9 text-xs font-medium'
        >
          {isSaving ? <LoaderCircleIcon className='animate-spin size-3.5 mr-1.5' /> : null}
          변경사항 저장
        </Button>
      </div>

      <div className='max-w-4xl mx-auto p-6 flex flex-col gap-6 mt-2'>
        {/* 1. 그룹 기본 정보 */}
        <section className='bg-white rounded-2xl border border-slate-100 shadow-xs p-6 space-y-4'>
          <h2 className='font-bold text-slate-800 text-sm'>그룹 기본 정보</h2>
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-6 items-start'>
            <div className='flex flex-col gap-1.5'>
              <Label className='text-xs font-semibold text-slate-500'>그룹 이름</Label>
              <Input
                value={groupNameDraft}
                onChange={(e) => setGroupNameDraft(e.target.value)}
                className='rounded-xl border-slate-200 bg-white h-10 text-xs'
              />
            </div>

            <div className='flex flex-col gap-1.5'>
              <Label className='text-xs font-semibold text-slate-500'>그룹 삭제</Label>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant='outline'
                    className='w-full h-10 rounded-xl border-rose-100 text-rose-500 bg-rose-50/50 hover:bg-rose-100/60 hover:text-rose-600 font-medium text-xs justify-center'
                    disabled={isDeleting}
                  >
                    {isDeleting ? <LoaderCircleIcon className='animate-spin size-3.5 mr-1.5' /> : null}
                    그룹 삭제하기
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className='rounded-2xl'>
                  <AlertDialogHeader>
                    <AlertDialogTitle>그룹 삭제</AlertDialogTitle>
                    <AlertDialogDescription className='text-xs'>
                      정말 이 그룹을 삭제하시겠습니까? 그룹의 모든 문제지, 제출물, 멤버 정보가 영구적으로 삭제됩니다.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className='rounded-xl text-xs'>취소</AlertDialogCancel>
                    <AlertDialogAction
          onClick={async (e) => {
            e.preventDefault()
            await onDeleteGroup()
          }}
          className='bg-rose-500 hover:bg-rose-600 rounded-xl text-xs'
        >
          삭제
        </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          <div className='pt-3 border-t border-slate-100 space-y-2'>
            <div>
              <Label className='text-xs font-semibold text-slate-500'>초대 공유</Label>
              <p className='text-[11px] text-slate-400'>학생들에게 링크나 초대 코드를 공유해 참여시킬 수 있습니다.</p>
            </div>
            
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
              <div className='flex gap-2'>
                <Input readOnly value={inviteUrl} className='flex-1 bg-slate-50 border-slate-200 text-slate-500 text-xs h-9 rounded-xl' />
                <Button
                  type='button'
                  variant='secondary'
                  className='rounded-xl h-9 text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 px-3'
                  onClick={() => {
                    navigator.clipboard.writeText(inviteUrl)
                    toast.success('초대 링크가 복사되었습니다.')
                  }}
                >
                  <LinkIcon className='size-3 mr-1' /> 링크 복사
                </Button>
              </div>

              <div className='flex gap-2'>
                <Input readOnly value={group?.invite_code || ''} className='flex-1 bg-slate-50 border-slate-200 text-slate-500 font-mono text-xs h-9 rounded-xl' />
                <Button
                  type='button'
                  variant='secondary'
                  className='rounded-xl h-9 text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 px-3'
                  onClick={() => {
                    navigator.clipboard.writeText(group?.invite_code || '')
                    toast.success('초대 코드가 복사되었습니다.')
                  }}
                >
                  <LinkIcon className='size-3 mr-1' /> 코드 복사
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* 2. 그룹원 관리 (우측 디자인 적용) */}
        <section className='bg-white rounded-2xl border border-slate-100 shadow-xs p-6 space-y-4'>
          <div className='flex items-center justify-between'>
            <div>
              <h2 className='font-bold text-slate-800 text-sm'>그룹원 관리</h2>
              <p className='text-xs text-slate-400 mt-0.5'>현재 그룹에 가입된 멤버를 확인하고 관리합니다.</p>
            </div>
            <Button
              variant='ghost'
              size='sm'
              onClick={() => setIsMembersOpen((prev) => !prev)}
              className='text-xs text-slate-500 hover:bg-slate-100 rounded-lg px-3 h-8'
            >
              {isMembersOpen ? '접기' : '펼치기'}
            </Button>
          </div>

          {isMembersOpen && (
            <div className='border border-slate-100 rounded-xl overflow-hidden bg-white'>
              <div className='max-h-72 overflow-auto'>
                <table className='w-full text-left border-collapse'>
                  <thead className='bg-[#f8fafc] text-slate-500 text-[11px] font-medium sticky top-0 z-1 border-b border-slate-100'>
                    <tr>
                      <th className='py-3 px-4 font-normal'>ID</th>
                      <th className='py-3 px-4 font-normal'>이름</th>
                      <th className='py-3 px-4 font-normal'>이메일</th>
                      <th className='py-3 px-4 font-normal'>신청 일자</th>
                      <th className='py-3 px-4 font-normal'>가입 일자</th>
                      <th className='py-3 px-4 font-normal text-center'>추방</th>
                    </tr>
                  </thead>
                  <tbody className='divide-y divide-slate-100 text-xs text-slate-700'>
                    {membersList.length > 0 ? (
                      membersList.map((m: any) => (
                        <tr key={m.user_id} className='hover:bg-slate-50/60 transition-colors'>
                          <td className='py-3 px-4 font-mono text-slate-600'>{m.role === 'professor' ? (m.office || '-') : (m.student_no ?? '-')}</td>
                          <td className='py-3 px-4 font-medium text-slate-800'>{m.username || m.name}</td>
                          <td className='py-3 px-4 text-slate-500'>{m.email}</td>
                          <td className='py-3 px-4 text-slate-500'>{formatDate(m.timestamp_requested)}</td>
                          <td className='py-3 px-4 text-slate-500'>{formatDate(m.timestamp_approved)}</td>
                          <td className='py-3 px-4 text-center'>
                            <button
                              className='text-rose-500 hover:text-rose-700 font-medium text-xs hover:underline'
                              onClick={() => {
                                setSelectedUserId(m.user_id)
                                setIsKickModalOpen(true)
                              }}
                            >
                              추방
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className='py-8 text-center text-xs text-slate-400'>
                          가입된 그룹원이 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* 3. 가입 신청 관리 (우측 디자인 적용) */}
        <section className='bg-white rounded-2xl border border-slate-100 shadow-xs p-6 space-y-4'>
          <div className='flex items-center justify-between'>
            <div>
              <h2 className='font-bold text-slate-800 text-sm'>가입 신청 관리</h2>
              <p className='text-xs text-slate-400 mt-0.5'>비공개 그룹에 가입을 신청한 멤버를 관리합니다.</p>
            </div>
            
            <div className='flex items-center gap-2'>
              <Button
                variant='outline'
                size='sm'
                onClick={onAcceptAllInvites}
                disabled={!pendingInvites || pendingInvites.length === 0}
                className='rounded-xl border-emerald-100 text-emerald-600 bg-emerald-50/50 hover:bg-emerald-100/70 h-8 text-xs font-medium px-3'
              >
                <CheckIcon className='size-3 mr-1' /> 전체 수락
              </Button>

              <Button
                variant='ghost'
                size='sm'
                onClick={() => setIsInvitesOpen((prev) => !prev)}
                className='text-xs text-slate-500 hover:bg-slate-100 rounded-lg px-3 h-8'
              >
                {isInvitesOpen ? '접기' : '펼치기'}
              </Button>
            </div>
          </div>

          {isInvitesOpen && (
            <div className='space-y-3'>
              <div className='flex items-center justify-between text-xs text-slate-500 font-medium px-1'>
                <span>대기 중인 신청 {pendingInvites?.length ?? 0}명</span>
                <button
  onClick={() => refreshInvites()}
  className='text-[11px] text-sky-600 hover:text-sky-700 flex items-center gap-1 hover:underline'
>
  <RefreshCw className='size-3' /> 새로고침
</button>
              </div>

              <div className='border border-slate-100 rounded-xl overflow-hidden bg-white'>
                <div className='max-h-72 overflow-auto'>
                  <table className='w-full text-left border-collapse'>
                    <thead className='bg-[#f8fafc] text-slate-500 text-[11px] font-medium sticky top-0 z-1 border-b border-slate-100'>
                      <tr>
                        <th className='py-3 px-4 font-normal'>ID</th>
                        <th className='py-3 px-4 font-normal'>이름</th>
                        <th className='py-3 px-4 font-normal'>신청 일자</th>
                        <th className='py-3 px-4 font-normal text-center'>거절</th>
                        <th className='py-3 px-4 font-normal text-center'>수락</th>
                      </tr>
                    </thead>
                    <tbody className='divide-y divide-slate-100 text-xs text-slate-700'>
                      {pendingInvites && pendingInvites.length > 0 ? (
                        pendingInvites.map((m: any) => (
                          <tr key={m.user_id} className='hover:bg-slate-50/60 transition-colors'>
                            <td className='py-3 px-4 font-mono text-slate-600'>{m.role === 'professor' ? (m.office || '-') : (m.student_no ?? '-')}</td>
                            <td className='py-3 px-4 font-medium text-slate-800'>{m.username || m.name}</td>
                            <td className='py-3 px-4 text-slate-500'>{formatDate(m.timestamp_requested)}</td>
                            <td className='py-3 px-4 text-center'>
                              <button
                                className='text-rose-500 hover:text-rose-700 font-medium text-xs hover:underline'
                                onClick={() => {
                                  setSelectedUserId(m.user_id)
                                  setIsRejectModalOpen(true)
                                }}
                              >
                                거절
                              </button>
                            </td>
                            <td className='py-3 px-4 text-center'>
                              <button
                                className='text-emerald-500 hover:text-emerald-700 font-medium text-xs hover:underline'
                                onClick={() => {
                                  setSelectedUserId(m.user_id)
                                  setIsAcceptModalOpen(true)
                                }}
                              >
                                수락
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className='py-8 text-center text-xs text-slate-400'>
                            신청한 멤버가 없습니다.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* 4. 문제지 설정 */}
        <section className='bg-white rounded-2xl border border-slate-100 shadow-xs p-6 space-y-4'>
          <div className='flex items-center justify-between'>
            <div>
              <h2 className='font-bold text-slate-800 text-sm'>문제지 설정</h2>
              <p className='text-xs text-slate-400 mt-0.5'>그룹에 속한 문제지의 이름과 기간 설정, 삭제를 진행합니다.</p>
            </div>
            <Button
              variant='ghost'
              size='sm'
              onClick={() => setIsProblemsOpen((prev) => !prev)}
              className='text-xs text-slate-500 hover:bg-slate-100 rounded-lg px-3 h-8'
            >
              {isProblemsOpen ? '접기' : '펼치기'}
            </Button>
          </div>

          {isProblemsOpen && (
            <div className='pt-2 border-t border-slate-100'>
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
                {(group?.problems ?? []).map((p) => {
                  const draft = problemDrafts[String(p.problem_id)]
                  if (!draft) return null
                  return (
                    <div key={p.problem_id} className='border border-slate-100 rounded-xl p-4 space-y-3 bg-slate-50/40 hover:bg-white hover:shadow-xs transition-all'>
                      <div className='flex items-center justify-between border-b border-slate-100 pb-2'>
                        <span className='text-xs font-bold text-slate-700'>문제 {p.question_count}개</span>
                        
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant='ghost' size='sm' className='h-6 px-2 text-rose-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg text-xs gap-1'>
                              <TrashIcon className='size-3' /> 삭제
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className='rounded-2xl'>
                            <AlertDialogHeader>
                              <AlertDialogTitle>문제지 삭제</AlertDialogTitle>
                              <AlertDialogDescription className='text-xs'>
                                '{p.title}' 문제지를 삭제하시겠습니까?
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className='rounded-xl text-xs'>취소</AlertDialogCancel>
                              <AlertDialogAction onClick={() => onDeleteProblem(p.problem_id)} className='bg-rose-500 hover:bg-rose-600 rounded-xl text-xs'>
                                삭제
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>

                      <div className='space-y-1'>
                        <Label className='text-xs font-semibold text-slate-600'>문제지 이름</Label>
                        <Input
                          value={draft.title}
                          onChange={(e) => updateDraft(String(p.problem_id), { title: e.target.value })}
                          className='rounded-xl bg-white border-slate-200 text-xs h-8'
                        />
                      </div>

                      <div className='space-y-1'>
                        <Label className='text-xs font-semibold text-slate-600'>문제지 소개</Label>
                        <Textarea
                          value={draft.description}
                          onChange={(e) => updateDraft(String(p.problem_id), { description: e.target.value })}
                          rows={2}
                          className='rounded-xl bg-white border-slate-200 text-xs resize-none'
                        />
                      </div>

                      <div className='flex items-center justify-between pt-1'>
                        <Label className='text-xs font-semibold text-slate-600'>시험 모드</Label>
                        <button
                          type='button'
                          onClick={() => updateDraft(String(p.problem_id), { examMode: !draft.examMode })}
                          className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full transition-colors ${draft.examMode ? 'bg-rose-500 text-white' : 'bg-slate-200 text-slate-600'}`}
                        >
                          {draft.examMode ? 'ON' : 'OFF'}
                        </button>
                      </div>

                      {draft.examMode && (
                        <div className='p-2.5 bg-rose-50/50 border border-rose-100 rounded-xl space-y-2'>
                          <div className='space-y-1'>
                            <Label className='text-[10px] font-semibold text-rose-700'>시험 카테고리 지정</Label>
                            <select
                              value={draft.categoryId || ''}
                              onChange={(e) => updateDraft(String(p.problem_id), { categoryId: Number(e.target.value) })}
                              className='w-full border border-rose-200 rounded-lg px-2 text-xs bg-white h-7 text-slate-700'
                            >
                              <option value=''>카테고리 선택 (기본값)</option>
                              {examCategories.map((c) => (
                                <option key={c.category_id} value={c.category_id}>
                                  {c.title}
                                </option>
                              ))}
                            </select>
                          </div>

                          <label className='flex items-center gap-2 cursor-pointer'>
                            <input
                              type='checkbox'
                              checked={draft.hideBeforeStart ?? false}
                              onChange={(e) => updateDraft(String(p.problem_id), { hideBeforeStart: e.target.checked })}
                              className='rounded border-rose-300 text-rose-500 focus:ring-rose-400 size-3'
                            />
                            <span className='text-[10px] font-medium text-rose-800'>시작 전 문제 감추기</span>
                          </label>
                        </div>
                      )}

                      <div className='flex flex-col gap-1 pt-1'>
                        <Label className='text-xs font-semibold text-slate-600'>게시 시작 시간</Label>
                        <div className='flex gap-1'>
                          <Input
                            type='date'
                            value={draft.date}
                            onChange={(e) => updateDraft(String(p.problem_id), { date: e.target.value })}
                            className='flex-1 rounded-xl bg-white border-slate-200 text-xs h-8'
                          />
                          <select
                            value={draft.hour}
                            onChange={(e) => updateDraft(String(p.problem_id), { hour: e.target.value })}
                            className='border border-slate-200 rounded-xl px-1.5 text-xs bg-white h-8'
                          >
                            {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map((h) => (
                              <option key={h} value={h}>{h}시</option>
                            ))}
                          </select>
                          <select
                            value={draft.minute}
                            onChange={(e) => updateDraft(String(p.problem_id), { minute: e.target.value })}
                            className='border border-slate-200 rounded-xl px-1.5 text-xs bg-white h-8'
                          >
                            {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map((m) => (
                              <option key={m} value={m}>{m}분</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className='flex flex-col gap-1 pt-1'>
                        <Label className='text-xs font-semibold text-slate-600'>게시 종료 시간</Label>
                        <div className='flex gap-1'>
                          <Input
                            type='date'
                            value={draft.endDate}
                            onChange={(e) => updateDraft(String(p.problem_id), { endDate: e.target.value })}
                            className='flex-1 rounded-xl bg-white border-slate-200 text-xs h-8'
                          />
                          <select
                            value={draft.endHour}
                            onChange={(e) => updateDraft(String(p.problem_id), { endHour: e.target.value })}
                            className='border border-slate-200 rounded-xl px-1.5 text-xs bg-white h-8'
                          >
                            {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map((h) => (
                              <option key={h} value={h}>{h}시</option>
                            ))}
                          </select>
                          <select
                            value={draft.endMinute}
                            onChange={(e) => updateDraft(String(p.problem_id), { endMinute: e.target.value })}
                            className='border border-slate-200 rounded-xl px-1.5 text-xs bg-white h-8'
                          >
                            {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map((m) => (
                              <option key={m} value={m}>{m}분</option>
                            ))}
                          </select>
                        </div>
                      </div>

                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* 추방 확인 모달 */}
      <AlertDialog open={isKickModalOpen} onOpenChange={setIsKickModalOpen}>
        <AlertDialogContent className='rounded-2xl'>
          <AlertDialogHeader>
            <AlertDialogTitle className='text-base'>그룹원 추방</AlertDialogTitle>
            <AlertDialogDescription className='text-xs'>
              해당 그룹원을 그룹에서 추방하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className='rounded-xl text-xs'>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedUserId) handleKickMember(selectedUserId)
              }}
              className='bg-rose-500 hover:bg-rose-600 rounded-xl text-xs'
            >
              추방
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 신청 거절 모달 */}
      <AlertDialog open={isRejectModalOpen} onOpenChange={setIsRejectModalOpen}>
        <AlertDialogContent className='rounded-2xl'>
          <AlertDialogHeader>
            <AlertDialogTitle className='text-base'>가입 신청 거절</AlertDialogTitle>
            <AlertDialogDescription className='text-xs'>
              해당 유저의 가입 신청을 거절하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className='rounded-xl text-xs'>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedUserId) handleRejectInvite(selectedUserId)
              }}
              className='bg-rose-500 hover:bg-rose-600 rounded-xl text-xs'
            >
              거절
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 신청 수락 모달 */}
      <AlertDialog open={isAcceptModalOpen} onOpenChange={setIsAcceptModalOpen}>
        <AlertDialogContent className='rounded-2xl'>
          <AlertDialogHeader>
            <AlertDialogTitle className='text-base'>가입 신청 수락</AlertDialogTitle>
            <AlertDialogDescription className='text-xs'>
              해당 유저의 가입 신청을 수락하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className='rounded-xl text-xs'>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedUserId) handleAcceptInvite(selectedUserId)
              }}
              className='bg-[#589960] hover:bg-[#477a4d] text-white rounded-xl text-xs'
            >
              수락
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default function GroupSettingsPage () {
  return (
    <Suspense fallback={<Skeleton className='h-screen w-full' />}>
      <GroupProvider>
        <GroupSettingsContent />
      </GroupProvider>
    </Suspense>
  )
}