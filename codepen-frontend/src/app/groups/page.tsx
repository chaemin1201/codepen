'use client'

import React, { Suspense, useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { 
  SearchIcon, 
  LayoutGridIcon, 
  ListIcon, 
  UserIcon, 
  UsersIcon,
  PlusIcon,
  LoaderCircleIcon,
  XIcon,
  BookOpenIcon,
  SquareCodeIcon,
  HardDriveIcon,
  AlertTriangleIcon,
} from 'lucide-react'

import { Header } from '@/components/header'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useGroups } from '@/lib/useGroups'
import { usePendingInvites } from '@/lib/usePendingInvites'
import { useMe } from '@/context/me-provider'
import { fetcher } from '@/lib/fetcher'
import type { Group } from '@/types/group'

export interface GroupItem {
  group_id: string | number
  group_name: string
  owner_name?: string
  owner?: { username: string }
  members_count?: number
  members?: Array<unknown>
  created_at: string
  platform?: 'codepen' | 'colab' // 🟢 [수정] CodePen 제거, 'codepen' 값은 이제 "자체 에디터"를 의미
}

// 🟢 [수정] 플랫폼 배지 - 그룹 카드에서 한눈에 자체 에디터/Colab 구분
function PlatformBadge({ platform }: { platform?: 'codepen' | 'colab' }) {
  const isColab = platform === 'colab'
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
        isColab
          ? 'bg-amber-50 text-amber-700 border-amber-200'
          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
      }`}
    >
      {isColab ? <BookOpenIcon className="w-3 h-3" /> : <SquareCodeIcon className="w-3 h-3" />}
      {isColab ? 'Colab' : '자체 에디터'}
    </span>
  )
}

// 🟢 [신규] 학생용 - 마감 임박 + 미제출 알림 배너. 24시간 이내 마감이면서
// 아직 다 제출 안 한 문제지가 있으면 여기에 떠요.
interface UpcomingDeadline {
  group_id: number
  group_name: string
  problem_id: number
  problem_title: string
  deadline: string
  minutes_left: number
  submitted_count: number
  total_count: number
}

function formatMinutesLeft(minutes: number) {
  if (minutes < 60) return `${minutes}분`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}시간 ${mins}분` : `${hours}시간`
}

function UpcomingDeadlinesBanner() {
  const router = useRouter()
  const [deadlines, setDeadlines] = useState<UpcomingDeadline[]>([])
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const fetchDeadlines = async () => {
      try {
        const res = await fetch('/api/user/me/upcoming-deadlines', { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          setDeadlines(Array.isArray(data) ? data : [])
        }
      } catch {
        // 조용히 무시 - 알림 배너는 "있으면 좋은" 기능이라 실패해도 나머지 화면엔 영향 없음
      }
    }
    fetchDeadlines()
  }, [])

  if (dismissed || deadlines.length === 0) return null

  return (
    <div className='rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-sm space-y-2'>
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-2 text-rose-800 font-bold'>
          <AlertTriangleIcon className='w-4 h-4' />
          마감 임박 · 미제출 과제 {deadlines.length}개
        </div>
        <button
          onClick={() => setDismissed(true)}
          className='text-rose-400 hover:text-rose-600 text-xs'
        >
          닫기
        </button>
      </div>
      <div className='space-y-1.5'>
        {deadlines.map((d) => (
          <button
            key={`${d.problem_id}`}
            onClick={() => router.push(`/problem/${d.problem_id}?groupId=${d.group_id}`)}
            className='w-full flex items-center justify-between gap-2 rounded-lg bg-white border border-rose-100 px-3 py-2 text-left hover:border-rose-300 transition-colors'
          >
            <span className='text-slate-700 font-medium truncate'>
              📚 {d.group_name} · {d.problem_title}
              <span className='text-slate-400 font-normal ml-1.5'>
                ({d.submitted_count}/{d.total_count} 제출)
              </span>
            </span>
            <span className='shrink-0 text-rose-600 font-bold text-xs'>
              {formatMinutesLeft(d.minutes_left)} 남음
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

// 🟢 [신규] 교수용 - Google Drive 연결 상태 배너. Colab 그룹에서 학생별 노트북을
// 자동으로 만들어주려면 교수 본인 구글 계정에 Drive 쓰기 권한을 연결해야 합니다.
function GoogleDriveConnectBanner() {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [isDisconnecting, setIsDisconnecting] = useState(false)

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/google-drive/status', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setConnected(!!data.connected)
      }
    } catch {
      // 상태 조회 실패는 조용히 무시 (배너는 "연결 안 됨"으로 기본 표시)
      setConnected(false)
    }
  }

  useEffect(() => {
    fetchStatus()
  }, [])

  const handleDisconnect = async () => {
    if (!confirm('Google Drive 연결을 해제하시겠습니까? Colab 학생별 노트북 자동 생성 기능을 쓸 수 없게 됩니다.')) return
    setIsDisconnecting(true)
    try {
      await fetch('/api/google-drive/disconnect', { method: 'DELETE', credentials: 'include' })
      toast.success('Google Drive 연결이 해제되었습니다.')
      setConnected(false)
    } catch {
      toast.error('연결 해제에 실패했습니다.')
    } finally {
      setIsDisconnecting(false)
    }
  }

  if (connected === null) return null // 상태 확인 전에는 깜빡임 방지를 위해 아무것도 안 보여줌

  if (connected) {
    return (
      <div className='flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm'>
        <div className='flex items-center gap-2 text-emerald-800 font-semibold'>
          <HardDriveIcon className='w-4 h-4' />
          Google Drive 연결됨 - Colab 학생별 노트북 자동 생성을 쓸 수 있어요
        </div>
        <Button
          size='sm'
          variant='outline'
          onClick={handleDisconnect}
          disabled={isDisconnecting}
          className='shrink-0 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-100 bg-white'
        >
          연결 해제
        </Button>
      </div>
    )
  }

  return (
    <div className='flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm flex-wrap'>
      <div className='flex items-center gap-2 text-amber-800 font-semibold'>
        <HardDriveIcon className='w-4 h-4' />
        Google Drive가 연결되지 않았어요 - Colab 그룹을 쓰신다면 연결을 추천해요
      </div>
      <a href='/api/google-drive/connect'>
        <Button size='sm' className='shrink-0 text-xs bg-[#589960] hover:bg-[#173A23] text-white'>
          Google Drive 연결하기
        </Button>
      </a>
    </div>
  )
}

function CreateGroupDialog ({ onCreated }: { onCreated: () => void }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  // 🟢 [수정] 그룹이 사용할 실습 플랫폼 선택 상태 (기본값: codepen = 자체 에디터)
  const [platform, setPlatform] = useState<'codepen' | 'colab'>('codepen')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // CreateGroupDialog 내부 onSubmit 함수 수정
  const onSubmit = async () => {
    if (!name.trim()) {
      toast.error('그룹 이름을 입력해주세요.')
      return
    }
    setIsSubmitting(true)
    try {
      const created = await fetcher<Group>('/api/group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: name,
          group_name: name, // 🟢 백엔드 요청 필드 일치 보장
          description: description || null, 
          platform 
        }),
      })
      toast.success(`'${name}' 그룹이 개설되었습니다.`)
      setOpen(false)
      setName('')
      setDescription('')
      setPlatform('codepen')
      onCreated()
      router.push(`/problem?groupId=${created.group_id}`)
    } catch (err) {
      console.error('Group creation error:', err)
      toast.error('그룹 개설에 실패했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(val) => !isSubmitting && setOpen(val)}>
      <DialogTrigger asChild>
        <Button className='bg-[#589960] hover:bg-[#173A23] text-white font-bold rounded-xl gap-1.5 transition-colors px-4 py-2'>
          <PlusIcon className='w-4 h-4' /> 그룹 개설
        </Button>
      </DialogTrigger>
      
      <DialogContent className='bg-[#FCFCFC] text-foreground border-slate-100 rounded-3xl p-6 shadow-lg max-w-md'>
        <DialogHeader className='border-b border-slate-100 pb-4'>
          <DialogTitle className='text-xl font-bold text-foreground'>그룹 생성하기</DialogTitle>
        </DialogHeader>

        <div className='flex flex-col gap-3.5 py-4'>
          <div className='flex flex-col gap-1.5'>
            <Input 
              id='new-group-name' 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              placeholder='그룹 이름을 입력하세요'
              className='w-full bg-background text-foreground border-input focus-visible:ring-1 focus-visible:ring-ring focus:outline-none rounded-xl h-11 px-3.5'
            />
          </div>

          <div className='flex flex-col gap-1.5'>
            <Textarea 
              id='new-group-desc' 
              value={description} 
              onChange={(e) => setDescription(e.target.value)} 
              placeholder='그룹 설명 (선택)'
              className='w-full bg-background text-foreground border-input focus-visible:ring-1 focus-visible:ring-ring focus:outline-none rounded-xl resize-none min-h-[90px] p-3.5 text-sm'
            />
          </div>

          {/* 🟢 [추가] 실습 플랫폼 선택 */}
          <div className='flex flex-col gap-1.5'>
            <label className='text-xs font-bold text-[#173A23] px-0.5'>
              이 그룹에서 사용할 실습 플랫폼
            </label>
            {/* 🟢 [수정] CodePen을 완전히 제거하고 "자체 에디터"로 대체했습니다.
                platform 값 자체는 DB 마이그레이션 없이 그대로 'codepen' 문자열을 쓰지만,
                이제 의미상으로는 "자체 에디터"입니다. */}
            <div className='grid grid-cols-2 gap-2'>
              <button
                type='button'
                onClick={() => setPlatform('codepen')}
                disabled={isSubmitting}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-colors ${
                  platform === 'codepen'
                    ? 'border-[#589960] bg-[#589960]/5 text-[#173A23]'
                    : 'border-[#EBF1F4] text-[#868C88] hover:border-[#CBD9E1]'
                }`}
              >
                <SquareCodeIcon className='w-5 h-5' />
                <span className='text-xs font-bold'>자체 에디터</span>
                <span className='text-[10px] text-[#868C88]'>웹 프론트엔드 실습</span>
              </button>
              <button
                type='button'
                onClick={() => setPlatform('colab')}
                disabled={isSubmitting}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-colors ${
                  platform === 'colab'
                    ? 'border-[#589960] bg-[#589960]/5 text-[#173A23]'
                    : 'border-[#EBF1F4] text-[#868C88] hover:border-[#CBD9E1]'
                }`}
              >
                <BookOpenIcon className='w-5 h-5' />
                <span className='text-xs font-bold'>Colab</span>
                <span className='text-[10px] text-[#868C88]'>파이썬/데이터 실습</span>
              </button>
            </div>
            <p className='text-[11px] text-[#868C88] px-0.5'>
              그룹 생성 후에는 문제가 등록되면 변경할 수 없어요. 신중하게 선택해주세요.
            </p>
          </div>
        </div>

        <DialogFooter className='sm:justify-center'>
          <Button 
            onClick={onSubmit} 
            disabled={isSubmitting || !name.trim()}
            className='w-full bg-[#589960] hover:bg-[#173A23] text-white font-bold rounded-xl h-12 transition-colors flex items-center justify-center gap-2 text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#589960]'
          >
            {isSubmitting ? (
              <LoaderCircleIcon className='w-5 h-5 animate-spin' />
            ) : (
              '그룹 생성하기'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function GroupsContent() {
  const { me } = useMe()
  const { groups: Groups, isLoading: isGroupsLoading, mutate: refreshGroups } = useGroups()
  const { invites: pendingInvites, mutate: refreshInvites } = usePendingInvites()
  const searchParams = useSearchParams()
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [cancelingCode, setCancelingCode] = useState<string | null>(null)
  const [joinCodeInput, setJoinCodeInput] = useState('')
  const [isJoining, setIsJoining] = useState(false)

  // 🟢 [신규] /google-drive/callback이 여기로 ?drive_connect=success|failed를 붙여서 돌아옵니다.
  useEffect(() => {
    const driveConnect = searchParams.get('drive_connect')
    if (driveConnect === 'success') {
      toast.success('Google Drive가 성공적으로 연결되었습니다.')
    } else if (driveConnect === 'failed') {
      toast.error('Google Drive 연결에 실패했습니다. 다시 시도해주세요.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const safeGroups = Groups || []
  
  // 1. 검색 필터링
  const filteredGroups = safeGroups.filter((group: GroupItem) =>
    group.group_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // 2. 최신 생성/참여 순 정렬 (최신순 내림차순)
  const sortedGroups = [...filteredGroups].sort((a, b) => {
    const dateA = a.created_at ? new Date(a.created_at).getTime() : 0
    const dateB = b.created_at ? new Date(b.created_at).getTime() : 0
    
    // 날짜가 같으면 ID가 큰(나중에 생성된) 그룹을 앞쪽으로
    if (dateA === dateB) {
      return Number(b.group_id) - Number(a.group_id)
    }
    
    return dateB - dateA
  })
  
  const hasPendingInvites = (pendingInvites?.length ?? 0) > 0

  const onCancelInvite = async (inviteCode: string) => {
    setCancelingCode(inviteCode)
    try {
      await fetcher(`/api/group/invites/${inviteCode}`, { method: 'DELETE' })
      toast.success('가입 요청을 취소했습니다.')
      refreshInvites()
    } catch {
      toast.error('가입 요청 취소에 실패했습니다. 잠시 후 다시 시도해주세요.')
    }
    setCancelingCode(null)
  }

  const onJoinByCode = async () => {
    const code = joinCodeInput.trim()
    if (!code) return toast.error('초대 코드를 입력해주세요.')
    setIsJoining(true)
    try {
      await fetcher(`/api/group/invites/${code}`, { method: 'POST' })
      toast.success('그룹 가입 요청이 전송되었습니다.')
      setJoinCodeInput('')
      refreshInvites()
    } catch {
      toast.error('유효하지 않은 초대 코드이거나 요청에 실패했습니다.')
    }
    setIsJoining(false)
  }

  return (
    <div className='min-h-screen w-full bg-[#FCFCFC] font-sans text-[#173A23]'>
      <Header user={me} />

      <main className='max-w-7xl mx-auto space-y-6 p-4 md:p-6'>
        {/* 🟢 [신규] 교수한테만 노출 - Colab 학생별 노트북 자동 생성을 위한 Drive 연결 배너 */}
        {/* 🟢 [신규] 마감 임박 + 미제출 알림 (역할 상관없이 - 백엔드가 GroupMember 기준으로 알아서 비워줌) */}
        <UpcomingDeadlinesBanner />
        {me?.role === 'professor' && <GoogleDriveConnectBanner />}

        <div className={hasPendingInvites ? 'flex flex-col lg:flex-row gap-6 items-start' : ''}>
          <div className={hasPendingInvites ? 'flex-1 min-w-0 space-y-6' : 'space-y-6'}>
            <div className='flex flex-col sm:flex-row items-center justify-between gap-3'>
              <div className='relative w-full sm:flex-1 sm:max-w-xl'>
                <SearchIcon className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#868C88]' />
                <Input 
                  type='text' 
                  placeholder='검색하기...' 
                  className='pl-9 bg-white border-[#CBD9E1] focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-[#CBD9E1]'
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {me?.role === 'professor' ? (
                <CreateGroupDialog onCreated={() => refreshGroups()} />
              ) : (
                <div className='flex items-center gap-2 w-full sm:w-auto'>
                  <Input
                    type='text'
                    placeholder='초대 코드 입력'
                    className='bg-white border-[#CBD9E1] focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-[#CBD9E1] w-full sm:w-48'
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') onJoinByCode() }}
                  />
                  <Button
                    onClick={onJoinByCode}
                    disabled={isJoining}
                    variant='secondary'
                    className='shrink-0'
                  >
                    {isJoining ? <LoaderCircleIcon className='w-4 h-4 animate-spin' /> : '참여 신청'}
                  </Button>
                </div>
              )}

              <div className='flex items-center gap-2 w-full sm:w-auto justify-end'>
                <div className='flex border bg-white rounded-lg p-1 gap-1 border-[#EBF1F4]'>
                  <button 
                    type='button'
                    onClick={() => setViewMode('grid')}
                    className={`p-1.5 rounded transition-colors ${
                      viewMode === 'grid' ? 'bg-[#EBF1F4] text-[#173A23]' : 'hover:bg-[#FCFCFC] text-[#868C88]'
                    }`}
                    title='카드로 보기'
                  >
                    <LayoutGridIcon className='w-4 h-4' />
                  </button>
                  <button 
                    type='button'
                    onClick={() => setViewMode('list')}
                    className={`p-1.5 rounded transition-colors ${
                      viewMode === 'list' ? 'bg-[#EBF1F4] text-[#173A23]' : 'hover:bg-[#FCFCFC] text-[#868C88]'
                    }`}
                    title='줄로 보기'
                  >
                    <ListIcon className='w-4 h-4' />
                  </button>
                </div>
              </div>
            </div>

            <div className='border-b pb-3 border-[#EBF1F4] flex items-center justify-between'>
              <h1 className='text-xl font-bold text-[#173A23]'>나의 그룹</h1>
            </div>

            {/* 그룹 목록 (sortedGroups 적용) */}
            {isGroupsLoading ? (
              <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5' : 'space-y-3'}>
                {[1, 2, 3].map((_, index) => (
                  <Skeleton key={index} className='h-36 w-full rounded-2xl bg-[#EBF1F4]' />
                ))}
              </div>
            ) : sortedGroups.length === 0 ? (
              <div className='py-12 text-center text-[#868C88] bg-white rounded-2xl border border-[#EBF1F4]'>
                표시할 그룹이 없습니다.
              </div>
            ) : viewMode === 'grid' ? (
              <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5'>
                {sortedGroups.map((group: GroupItem) => {
                  const ownerName = group.owner_name || group.owner?.username || '교수'
                  const memberCount = group.members_count ?? Math.max((group.members?.length ?? 0) - 1, 0)
                  const formattedDate = group.created_at ? group.created_at.split('T')[0].replace(/-/g, '.') : ''

                  return (
                    <div 
                      key={group.group_id} 
                      className='flex flex-col justify-between p-5 bg-white border border-[#EBF1F4] rounded-2xl shadow-sm hover:border-[#CBD9E1] transition-all'
                    >
                      <div>
                        <div className='flex items-start justify-between gap-2 mb-3'>
                          <h2 className='text-base font-bold text-[#173A23] line-clamp-1'>
                            {group.group_name}
                          </h2>
                          {/* 🟢 [추가] 플랫폼 배지 */}
                          <PlatformBadge platform={group.platform} />
                        </div>

                        <div className='flex flex-col gap-1 text-xs mb-6'>
                          <span className='flex items-center gap-1.5 text-[#173A23] font-medium'>
                            <UserIcon className='w-3.5 h-3.5 text-[#69889A]' />
                            그룹장: {ownerName}
                          </span>
                          <span className='flex items-center gap-1.5 text-[#868C88]'>
                            <UsersIcon className='w-3.5 h-3.5 text-[#868C88]' />
                            수강생: {memberCount}명
                          </span>

                          {formattedDate && (
                            <p className='text-[11px] text-[#868C88] pt-1'>
                              생성 날짜 · {formattedDate}
                            </p>
                          )}
                        </div>
                      </div>

                      <Link href={`/problem?groupId=${group.group_id}`} className='w-full'>
                        <Button className='w-full bg-[#589960] hover:bg-[#173A23] text-white font-bold py-2.5 rounded-xl transition-colors'>
                          들어 가기
                        </Button>
                      </Link>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className='space-y-3'>
                {sortedGroups.map((group: GroupItem) => {
                  const ownerName = group.owner_name || group.owner?.username || '교수'
                  const memberCount = group.members_count ?? Math.max((group.members?.length ?? 0) - 1, 0)

                  return (
                    <div 
                      key={group.group_id}
                      className='flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-white border border-[#EBF1F4] rounded-xl shadow-sm hover:border-[#CBD9E1] transition-all gap-4'
                    >
                      <div className='space-y-1.5'>
                        <div className='flex items-center gap-2'>
                          <h2 className='text-base font-bold text-[#173A23]'>{group.group_name}</h2>
                          {/* 🟢 [추가] 플랫폼 배지 */}
                          <PlatformBadge platform={group.platform} />
                        </div>
                        <div className='flex flex-col gap-0.5 text-xs text-[#868C88]'>
                          <span className='text-[#173A23] font-medium'>👤 그룹장: {ownerName}</span>
                          <span>👥 수강생: {memberCount}명</span>
                        </div>
                      </div>

                      <Link href={`/problem?groupId=${group.group_id}`} className='w-full sm:w-auto shrink-0'>
                        <Button className='w-full sm:w-auto bg-[#589960] hover:bg-[#173A23] text-white font-bold px-5 py-2 rounded-lg transition-colors text-sm'>
                          들어 가기
                        </Button>
                      </Link>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {hasPendingInvites && (
            <div className='w-full lg:w-80 shrink-0 space-y-3'>
              <div className='border-b pb-3 border-[#EBF1F4]'>
                <h2 className='text-base font-bold text-[#173A23]'>참여 신청 중</h2>
                <p className='text-xs text-[#868C88] mt-0.5'>그룹장의 승인을 기다리고 있는 그룹이에요.</p>
              </div>
              {pendingInvites!.map((invite) => (
                <div key={invite.invite_code} className='p-4 bg-white border border-amber-200 bg-amber-50/40 rounded-xl space-y-2'>
                  <h3 className='font-bold text-sm text-[#173A23]'>{invite.group_name}</h3>
                  <p className='text-xs text-[#868C88]'>그룹장: {invite.owner_name}</p>
                  <Button
                    size='sm'
                    variant='outline'
                    className='w-full text-xs border-amber-300 text-amber-700 hover:bg-amber-100'
                    disabled={cancelingCode === invite.invite_code}
                    onClick={() => onCancelInvite(invite.invite_code)}
                  >
                    {cancelingCode === invite.invite_code ? <LoaderCircleIcon className='animate-spin w-3.5 h-3.5' /> : <XIcon className='w-3.5 h-3.5' />} 요청 취소
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default function GroupsPage() {
  return (
    <Suspense fallback={<Skeleton className='h-screen w-full bg-[#FCFCFC]' />}>
      <GroupsContent />
    </Suspense>
  )
}