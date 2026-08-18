'use client'

import React, { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { PlusIcon, XIcon, LoaderCircleIcon } from 'lucide-react'

import { Header } from '@/components/header'
import { useMe } from '@/context/me-provider'
import { useQuery } from '@/lib/useQuery'
import { fetcher } from '@/lib/fetcher'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { dateStringify } from '@/lib/date-stringify'
import type { InviteStatus } from '@/types/invite'

function InviteCodeContent () {
  // [버그 수정] 페이지를 /groups/invites/[inviteCode] -> /groups/invites 로
  // 옮기면서 코드값은 이제 경로가 아니라 쿼리스트링(?invitesId=)으로 들어옵니다.
  // useParams로는 항상 undefined라서 /api/group/invites/undefined 를 불러
  // 매번 404가 났던 것입니다.
  const searchParams = useSearchParams()
  const inviteCode = searchParams.get('invitesId')
  const router = useRouter()
  const { me } = useMe()
  const [isApiLoading, setIsApiLoading] = React.useState(false)

  const { data: invite, isLoading, error, mutate } = useQuery<InviteStatus>(
    inviteCode ? `/api/group/invites/${inviteCode}` : null,
    { refreshInterval: 5000 },
  )

  // 이미 멤버/오너인 경우, 초대장 화면을 볼 필요 없이 바로 그룹으로 들어갑니다.
  React.useEffect(() => {
    if (invite?.status === 'accepted') {
      toast.success('이미 가입된 그룹입니다. 그룹 화면으로 이동합니다.')
      router.push(`/problem?groupId=${invite.group_id}`)
    }
  }, [invite, router])

  const onRequestJoin = async () => {
    if (!inviteCode) return
    setIsApiLoading(true)
    try {
      await fetcher(`/api/group/invites/${inviteCode}`, { method: 'POST' })
      toast.success('그룹 가입 요청이 성공적으로 전송되었습니다.')
      mutate()
    } catch (err) {
      toast.error('그룹 가입 요청에 실패했습니다. 잠시 후 다시 시도해주세요.')
    }
    setIsApiLoading(false)
  }

  const onCancelRequest = async () => {
    if (!inviteCode) return
    setIsApiLoading(true)
    try {
      await fetcher(`/api/group/invites/${inviteCode}`, { method: 'DELETE' })
      toast.success('그룹 가입 요청이 취소되었습니다.')
      mutate()
    } catch (err) {
      toast.error('그룹 가입 요청 취소에 실패했습니다. 잠시 후 다시 시도해주세요.')
    }
    setIsApiLoading(false)
  }

  if (!inviteCode || isLoading) {
    return <Skeleton className='h-48 w-full m-6' />
  }

  if (error || !invite) {
    toast.error('유효하지 않거나 만료된 초대 링크입니다.')
    return null
  }

  return (
    <div className='min-h-screen bg-[#FCFCFC]'>
      <Header user={me} />
      <div className='max-w-lg mx-auto mt-16 p-8 bg-white border border-[#EBF1F4] rounded-2xl shadow-sm flex flex-col gap-3'>
        <h1 className='text-2xl font-bold text-[#173A23]'>{invite.group_name} 그룹 초대</h1>
        <p className='text-sm text-[#868C88]'>그룹장: {invite.owner_name}</p>
        <p className='text-sm text-[#868C88]'>생성 날짜: {dateStringify(invite.created_at, false)}</p>
        {invite.description && <p className='text-sm text-[#173A23] mt-2'>{invite.description}</p>}

        {invite.status === 'none' && (
          <Button onClick={onRequestJoin} disabled={isApiLoading} className='mt-4 bg-[#589960] hover:bg-[#173A23]'>
            {isApiLoading ? <LoaderCircleIcon className='animate-spin' /> : <PlusIcon />} 그룹 가입 요청
          </Button>
        )}
        {invite.status === 'pending' && (
          <div className='mt-4 flex flex-col gap-2'>
            <p className='text-sm text-amber-600 font-medium'>가입 요청을 보냈어요. 그룹장의 승인을 기다리고 있어요.</p>
            <Button variant='outline' onClick={onCancelRequest} disabled={isApiLoading}>
              {isApiLoading ? <LoaderCircleIcon className='animate-spin' /> : <XIcon />} 가입 요청 취소
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function InviteCodePage () {
  return (
    <Suspense fallback={<Skeleton className='h-48 w-full m-6' />}>
      <InviteCodeContent />
    </Suspense>
  )
}
