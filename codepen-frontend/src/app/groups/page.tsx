'use client'

import React, { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { 
  SearchIcon, 
  LayoutGridIcon, 
  ListIcon, 
  UserIcon, 
  UsersIcon,
  PlusIcon,
  LoaderCircleIcon,
  XIcon
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
}

function CreateGroupDialog ({ onCreated }: { onCreated: () => void }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

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
        body: JSON.stringify({ name, description: description || null }),
      })
      toast.success(`'${name}' 그룹이 개설되었습니다.`)
      setOpen(false)
      setName('')
      setDescription('')
      onCreated()
      router.push(`/problem?groupId=${created.group_id}`)
    } catch {
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
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [cancelingCode, setCancelingCode] = useState<string | null>(null)
  const [joinCodeInput, setJoinCodeInput] = useState('')
  const [isJoining, setIsJoining] = useState(false)

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