'use client'

import React, { Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { DownloadIcon, ExternalLinkIcon, LoaderCircleIcon, SaveIcon, TrashIcon, XIcon } from 'lucide-react'
import ReactDiffViewer from 'react-diff-viewer-continued'

import { ProblemProvider, useProblem } from '@/context/problem-provider'
import { Skeleton } from '@/components/ui/skeleton'
import { useGroupOwner } from '@/lib/useGroupOwner'
import { fetcher } from '@/lib/fetcher'
import { Button } from '@/components/ui/button'
import { User } from '@/types/user'
import type { Submission } from '@/types/submission'
import { useQuery } from '@/lib/useQuery'
import { BackButton } from '@/components/back-button'
import { dateStringify } from '@/lib/date-stringify'
import { GroupProvider, useGroup } from '@/context/group-provider'
import { Input } from '@/components/ui/input'
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

function SubmissionPageContent () {
  // [구조 변경] 이전엔 /groups/[groupId]/[problemId]/[submissionId] 라우트에서
  // useParams로 셋 다 받았지만, 평탄한 /submission 라우트로 바뀌면서 세 값 모두
  // 쿼리스트링으로 받아야 합니다. groupId/problemId는 GroupProvider/ProblemProvider가
  // 내부적으로 같은 쿼리스트링을 읽으므로, 이 페이지로 이동하는 Link에는
  // /submission?groupId=..&problemId=..&submissionId=.. 세 값이 모두 포함되어야 합니다.
  const searchParams = useSearchParams()
  const submissionId = searchParams.get('submissionId')
  const { problem } = useProblem()
  const { group } = useGroup()
  const { data, error, isLoading, mutate } = useQuery<Submission | null>(`/api/submission/${submissionId}`, {
    refreshInterval: 5000,
  })
  const isOwner = useGroupOwner()
  const router = useRouter()
  const [user, setUser] = React.useState<User | null>(null)
  const { data: verified, isLoading: isVerifying } = useQuery<{
    status: 'verified' | 'tampered'
    tampered_files: string[]
  }>(`/api/submission/${submissionId}/verify`)
  const [score, setScore] = React.useState<number | null>(data?.score ?? null)
  const [savedCode, setSavedCode] = React.useState<Record<string, string> | null>(null)
  const [codepenCode, setCodepenCode] = React.useState<Record<string, string> | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)

  const onDeleteSubmission = async () => {
    try {
      setIsDeleting(true)
      await fetcher(`/api/submission/${submissionId}`, {
        method: 'DELETE',
      })
      toast.success('제출물이 성공적으로 삭제되었습니다.')
      router.back()
    } catch (err) {
      toast.error('제출물 삭제 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setIsDeleting(false)
    }
  }

  // [버그 수정] 기존엔 이 리다이렉트가 5초마다 새로 도는 data useEffect 안에 같이
  // 있어서 isOwner가 false인 동안 router.back()이 반복 호출될 수 있었습니다.
  // isOwner만 바뀔 때 한 번만 실행되도록 별도 effect로 분리했습니다.
  React.useEffect(() => {
    if (!isOwner) {
      router.back()
    }
  }, [isOwner, router])

  React.useEffect(() => {
    if (!isOwner) {
      return
    }
    if (data) {
      const fetchSubmissionUser = async () => {
        try {
          const fetchedUser: User = await fetcher(`/api/user/${data.user_id}`)
          setUser(fetchedUser)
        } catch (err) {
          toast.error('제출한 사용자의 정보를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
        }
      }
      fetchSubmissionUser()
      if (verified && verified.status === 'tampered') {
        const fetchSavedCode = async (file: string) => {
          try {
            const resp = await fetch(`/api/submission_files/${data.filename}/${file}`)
            if (resp.ok) {
              const code = await resp.text()
              setSavedCode(prev => ({ ...prev, [file]: code }))
            } else {
              toast.error('제출한 코드 파일을 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
            }
          } catch (err) {
            toast.error('제출한 코드 파일을 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
          }
        }
        (verified.tampered_files as string[]).forEach(fileName => fetchSavedCode(fileName))
        const fetchCodepenCode = async (file: string) => {
          try {
            const resp = await fetch(`/api/submission/${data.submission_id}/codepen_code/${file}`)
            if (resp.ok) {
              const code = await resp.text()
              setCodepenCode(prev => ({ ...prev, [file]: code }))
            } else {
              toast.error('CodePen에 제출한 코드를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
            }
          } catch (err) {
            toast.error('CodePen에 제출한 코드를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
          }
        }
        (verified.tampered_files as string[]).forEach(fileName => fetchCodepenCode(fileName))
      }
    }
  }, [data, isOwner, router, verified])

  if (!problem || isLoading || !data || !user) {
    return (
      <Skeleton className='h-8 w-full' />
    )
  }

  if (error) {
    // [버그 수정] toast.error()는 JSX가 아니라 toast id를 반환하므로 그대로
    // return하면 안 됩니다. 부수효과로만 호출하고 렌더링은 null로 대체합니다.
    toast.error('제출 정보를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
    return null
  }

  const onSubmitScore = async () => {
    const resp = await fetch(`/api/submission/${data.submission_id}/score?score=${score}`, {
      method: 'POST',
    })
    if (resp.ok) {
      toast.success('점수가 성공적으로 저장되었습니다.')
    } else {
      toast.error('점수 저장에 실패했습니다. 잠시 후 다시 시도해주세요.')
    }
    mutate()
  }

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex items-center justify-between'>
        <div className='flex flex-row gap-4'>
          <BackButton />
          <h1 className='text-2xl font-bold'>{user.username} (학번: {user.student_no}) 님의 {problem.title} 문제 제출</h1>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              disabled={isDeleting}
              variant='outline' size='icon' className='border-destructive/20 dark:border-destructive/40'
            >
              {isDeleting ? <LoaderCircleIcon className='text-destructive animate-spin' /> : <TrashIcon className='text-destructive' />}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>제출 삭제</AlertDialogTitle>
              <AlertDialogDescription>
                정말 현재 선택된 제출물을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.<br />
                제출 삭제시 제출물과 관련된 모든 데이터(제출 파일, 검증 결과 등)가 영구적으로 삭제됩니다.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel><XIcon /> 취소</AlertDialogCancel>
              <AlertDialogAction onClick={onDeleteSubmission} disabled={isDeleting}>
                {isDeleting ? <LoaderCircleIcon className='animate-spin' /> : <TrashIcon />} 제출 삭제
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <p>문제 풀이 시작 날짜: {dateStringify(data.created_at, true)}</p>
      <p>제출 상태: {data.status === 'submitted' ? '🟢 제출 완료' : '🔴 미제출'}</p>
      {data.status === 'submitted' && data.submitted_at && (
        <>
          <p>제출 검증 상태: {verified && verified.status === 'verified' ? '✅ 검증 완료' : verified && verified.status === 'tampered' ? '❌ 변조됨' : isVerifying ? '⏳ 검증 중' : '검증 상태 알 수 없음'}</p>
          <p>제출 날짜: {dateStringify(data.submitted_at, true)}</p>
        </>
      )}
      <div className='flex flex-row gap-2'>
        <Input className='max-w-28' type='number' min={0} step='any' value={score ?? ''} onChange={(e) => setScore(e.target.value === '' ? null : Number(e.target.value))} placeholder='점수 입력' />
        <Button onClick={onSubmitScore}><SaveIcon className='w-4 h-4' /> 점수 저장</Button>
      </div>
      <div className='flex flex-row gap-2'>
        <Link href={data.codepen_url} target='_blank' rel='noopener noreferrer'>
          <Button><ExternalLinkIcon /> CodePen에서 제출물 보기</Button>
        </Link>
        {data.status === 'submitted' && (
          <Link href={`/api/submission/${data.submission_id}/download`} target='_blank' rel='noopener noreferrer' download={`${group!.group_name.replace(/\s+/g, '_')}_${problem.title.replace(/\s+/g, '_')}_${user.username}_${user.student_no}.html`}>
            <Button variant='secondary'><DownloadIcon /> 제출 파일 다운로드 (Zip)</Button>
          </Link>
        )}
      </div>
      {data.status === 'submitted' && (
        <>
          <iframe className='w-full aspect-video' src={`/api/submission_files/${data.filename}/dist/index.html`} sandbox='allow-downloads allow-forms allow-modals allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-top-navigation-by-user-activation' allow='accelerometer *; ambient-light-sensor *; camera *; display-capture *; encrypted-media *; geolocation *; gyroscope *; microphone *; midi *; payment *; serial *; vr *; web-share *; xr-spatial-tracking *' allowFullScreen loading='lazy' />
          {verified && verified.status === 'tampered' && (
            <div className='flex flex-col gap-4'>
              <h2 className='text-lg font-semibold'>감지된 코드 변조</h2>
              {savedCode && codepenCode
                ? (
                    (verified.tampered_files as string[]).map(fileName => (
                      <div key={fileName} className='flex flex-col gap-2'>
                        <p className='text-sm'>변조된 파일: {fileName}</p>
                        <ReactDiffViewer
                          oldValue={savedCode[fileName] || ''}
                          newValue={codepenCode[fileName] || ''}
                          showDiffOnly={false}
                          styles={{
                            variables: {
                              light: {
                                addedBackground: '#e6ffed',
                                addedColor: '#24292e',
                                removedBackground: '#ffeef0',
                                removedColor: '#24292e',
                              },
                              dark: {
                                addedBackground: '#044B53',
                                addedColor: '#c9f0e1',
                                removedBackground: '#632F34',
                                removedColor: '#f0c9cd',
                              },
                            },
                          }}
                        />
                      </div>
                    ))
                  )
                : (
                  <LoaderCircleIcon className='animate-spin self-center' />
                  )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// [구조 변경 복구] GroupProvider/ProblemProvider가 예전엔 [groupId]/[problemId]
// 폴더의 layout.tsx가 자동으로 감싸줬지만, 평탄 구조에는 그런 layout이 없으므로
// 이 페이지에서 직접 감싸줍니다. 두 Provider 모두 useSearchParams를 쓰기 때문에
// Suspense 경계도 함께 필요합니다.
export default function SubmissionPage () {
  return (
    <Suspense fallback={<Skeleton className='h-8 w-full' />}>
      <GroupProvider>
        <ProblemProvider>
          <SubmissionPageContent />
        </ProblemProvider>
      </GroupProvider>
    </Suspense>
  )
}
