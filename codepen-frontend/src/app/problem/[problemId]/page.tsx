'use client'

import React, { Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { DownloadIcon, ExternalLinkIcon, FileCheckCornerIcon, FlagIcon, LoaderCircleIcon, SendIcon, TableIcon, XIcon } from 'lucide-react'

import { Header } from '@/components/header'
import { GroupProvider, useGroup } from '@/context/group-provider'
import { ProblemProvider, useProblem } from '@/context/problem-provider'
import { Skeleton } from '@/components/ui/skeleton'
import { useSubmission } from '@/lib/useSubmission'
import { useGroupOwner } from '@/lib/useGroupOwner'
import { useCategories } from '@/lib/useCategories'
import { useMe } from '@/context/me-provider'
import { useQuery } from '@/lib/useQuery'
import type { Submission } from '@/types/submission'
import { DataTable } from '@/components/ui/data-table'
import { submissionColumns } from './submission-columns'
import { fetcher } from '@/lib/fetcher'
import { Button } from '@/components/ui/button'
import { BackButton } from '@/components/back-button'
import { dateStringify } from '@/lib/date-stringify'
import { EditProblemDialog } from '@/components/edit-problem-dialog'
import { QuestionList } from '@/app/problem/problem-list'
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

type VerificationStatus = 'verified' | 'tampered' | 'verifying' | 'unknown'

// [구조 변경] 제출물 상세로 이동하는 링크를 예전엔 /groups/{groupId}/{problemId}/{submissionId}
// 세그먼트로 만들었지만, 평탄 구조에서는 /submission 페이지가 groupId/problemId/submissionId를
// 전부 쿼리스트링으로 받으므로 이 함수로 목적지를 만듭니다.
const submissionHref = (groupId: number, problemId: number, submissionId: number) =>
  `/submission?groupId=${groupId}&problemId=${problemId}&submissionId=${submissionId}`

const OwnerOnlySubmissionLists = ({ problem }: {
  problem: NonNullable<ReturnType<typeof useProblem>['problem']>
}) => {
  const { group } = useGroup()
  const { me } = useMe()
  const router = useRouter()
  const { data: submissions, error } = useQuery<Submission[]>(`/api/submission/problem/${problem.problem_id}`, {
    refreshInterval: 5000,
  })
  const [verificationStatus, setVerificationStatus] = React.useState<{ user_id: string; status: VerificationStatus }[]>(group!.members.map(member => ({
    user_id: member.user_id,
    status: 'unknown' as VerificationStatus,
  })))
  const [isVerifying, setIsVerifying] = React.useState(false)

  const onVerifySubmissions = async () => {
    setIsVerifying(true)
    try {
      setVerificationStatus(prevStatus => prevStatus.map(vs => ({ ...vs, status: 'verifying' })))
      const results: { user_id: string; status: VerificationStatus }[] = await fetcher(`/api/submission/problem/${problem.problem_id}/verify_all`)
      setVerificationStatus(results)
      toast.success('모든 제출물 검증이 완료되었습니다.')
    } catch (err) {
      toast.error('제출물 검증 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
    }
    setIsVerifying(false)
  }

  if (error) {
    toast.error('제출 정보를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
  }

  if (!submissions) {
    return <Skeleton className='h-48 w-full' />
  }

  // [신규] "전체 학생 중 제출/미제출이 몇 명인지" 한눈에 보이는 요약 카운트
  const totalStudents = group!.members.filter(member => member.user_id !== me!.user_id).length
  const submittedCount = group!.members
    .filter(member => member.user_id !== me!.user_id)
    .filter(member => submissions.find(sub => sub.user_id === member.user_id)?.status === 'submitted')
    .length
  const notSubmittedCount = totalStudents - submittedCount

  return (
    <>
      <div className='flex flex-row gap-3 w-full'>
        <div className='flex-1 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center'>
          <p className='text-xs text-emerald-700 font-medium'>제출 완료</p>
          <p className='text-2xl font-extrabold text-emerald-700'>{submittedCount}<span className='text-sm font-medium'>명</span></p>
        </div>
        <div className='flex-1 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-center'>
          <p className='text-xs text-rose-700 font-medium'>미제출</p>
          <p className='text-2xl font-extrabold text-rose-700'>{notSubmittedCount}<span className='text-sm font-medium'>명</span></p>
        </div>
        <div className='flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center'>
          <p className='text-xs text-slate-500 font-medium'>전체 학생</p>
          <p className='text-2xl font-extrabold text-slate-700'>{totalStudents}<span className='text-sm font-medium'>명</span></p>
        </div>
      </div>
      <div className='flex flex-row gap-4 w-full'>
        <Button className='grow' onClick={onVerifySubmissions} disabled={isVerifying}>
          {isVerifying ? <LoaderCircleIcon className='animate-spin' /> : <FileCheckCornerIcon />} 모든 제출물 검증
        </Button>
        <Link href={`/api/problem/${problem.problem_id}/scores`} target='_blank' rel='noreferrer' className='grow'>
          <Button variant='secondary' className='w-full'><TableIcon />모든 제출물 점수 다운로드 (CSV)</Button>
        </Link>
        <Link href={`/api/problem/${problem.problem_id}/download_all`} target='_blank' rel='noreferrer' className='grow'>
          <Button variant='secondary' className='w-full'><DownloadIcon />모든 제출물 다운로드 (Zip)</Button>
        </Link>
      </div>
      <DataTable
        data={group!.members.filter(member => member.user_id !== me!.user_id).map(member => ({
          ...member,
          status: submissions.find(sub => sub.user_id === member.user_id)?.status ?? 'pending',
          verificationStatus: verificationStatus.find(vs => vs.user_id === member.user_id)?.status,
          score: submissions.find(sub => sub.user_id === member.user_id)?.score ?? null,
        }))}
        columns={submissionColumns}
        rowClassName={(row) => (row.status === 'submitted' ? row.verificationStatus === 'tampered' ? 'bg-red-500/30 hover:bg-red-500/18' : 'bg-green-500/30 hover:bg-green-500/18' : 'cursor-default')}
        onClickRow={(row) => {
          if (row.status === 'pending') {
            return
          }
          const submissionId = submissions.find(sub => sub.user_id === row.user_id)?.submission_id
          if (!submissionId) return
          router.push(submissionHref(group!.group_id, problem.problem_id, submissionId))
        }}
      />
    </>
  )
}

function ProblemPageContent () {
  const router = useRouter()
  const { me } = useMe()
  const { group } = useGroup()
  const { problem, refresh } = useProblem()
  const { categories } = useCategories(group?.group_id ?? null)
  const { submission, isLoading, error, mutate } = useSubmission(problem?.problem_id ?? 0)
  const isOwner = useGroupOwner()
  const [apiLoading, setApiLoading] = React.useState(false)

  const onCreateSubmission = async () => {
    setApiLoading(true)
    try {
      await fetcher(`/api/submission/${problem?.problem_id}`, {
        method: 'POST',
      })
      toast.success('문제 풀이가 성공적으로 시작되었습니다.')
      mutate()
    } catch (error) {
      toast.error('문제 풀이 시작 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
    }
    setApiLoading(false)
  }

  const onSubmitSubmission = async () => {
    setApiLoading(true)
    try {
      await fetcher(`/api/submission/${submission?.submission_id}/submit`, {
        method: 'POST',
      })
      toast.success('문제가 성공적으로 제출되었습니다.')
      mutate()
    } catch (error) {
      toast.error('문제 제출 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
    }
    setApiLoading(false)
  }

  if (!problem || isLoading) {
    return (
      <Skeleton className='h-8 w-full' />
    )
  }

  if (error) {
    toast.error('문제를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
    return null
  }

  return (
    <div className='min-h-screen bg-[#fafafa]'>
      <Header user={me} />

      {/* 🍞 브레드크럼: 각 단계를 눌러 상위 화면으로 이동할 수 있습니다 */}
      <header className='w-full bg-white border-b border-slate-100 px-6 py-2.5 flex items-center gap-2 text-xs text-slate-500'>
        <span
          className='cursor-pointer hover:underline hover:text-slate-700'
          onClick={() => router.push('/groups')}
        >
          나의 그룹들
        </span>
        {group && (
          <>
            <span>&gt;</span>
            <span
              className='cursor-pointer hover:underline hover:text-slate-700'
              onClick={() => router.push(`/problem?groupId=${group.group_id}`)}
            >
              📚 {group.group_name}
            </span>
          </>
        )}
        {(() => {
          const category = categories?.find((c) => c.category_id === problem.category_id)
          if (!category || !group) return null
          return (
            <>
              <span>&gt;</span>
              <span
                className='cursor-pointer hover:underline hover:text-slate-700'
                onClick={() => router.push(`/problem?groupId=${group.group_id}&categoryId=${category.category_id}`)}
              >
                {category.title}
              </span>
            </>
          )
        })()}
        <span>&gt;</span>
        <span className='font-medium text-slate-700'>{problem.title}</span>
      </header>

      <div className='flex flex-col gap-4 max-w-5xl mx-auto p-6'>
        <div className='flex items-center justify-between'>
          <div className='flex flex-row gap-4'>
            <BackButton />
            <h1 className='text-2xl font-bold'>{problem.title} 문제</h1>
          </div>
          {isOwner && <EditProblemDialog problem={problem} onEdited={refresh} />}
        </div>
        <p>{problem.description}</p>

        <QuestionList problemId={problem.problem_id} groupId={problem.group_id} isOwner={isOwner} />

        {
          isOwner
            ? (
              <>
                <p>평균 점수: {problem.avg_score?.toFixed(2) ?? '-'}, STD 점수: {problem.std_score?.toFixed(2) ?? '-'}</p>
                <OwnerOnlySubmissionLists problem={problem} />
              </>
              )
            : (
                problem.starts_at && new Date(problem.starts_at + 'Z') > new Date()
                  ? (
                    <p>이런, 너무 일찍 오셨군요! 아직 문제가 시작되기 전입니다.</p>
                    )
                  : problem.deadline && new Date(problem.deadline + 'Z') < new Date()
                    ? (
                        submission?.status === 'submitted'
                          ? (
                            <div className='flex flex-col gap-2'>
                              <div className='flex flex-col gap-2 items-center justify-center w-full h-fit py-4 rounded-md bg-green-300/30'>
                                <p className='text-green-600 dark:text-green-400 font-medium text-center'>문제 제출이 정상적으로 완료되었습니다. 마감일 이후 수정은 저장되지 않습니다.</p>
                                <Link href={submission.codepen_url} target='_blank' rel='noreferrer'>
                                  <Button variant='outline'><ExternalLinkIcon /> CodePen 열기</Button>
                                </Link>
                              </div>
                              <iframe className='w-full aspect-video' src={`/api/submission_files/${submission.filename}/dist/index.html`} sandbox='allow-downloads allow-forms allow-modals allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-top-navigation-by-user-activation' allow='accelerometer *; ambient-light-sensor *; camera *; display-capture *; encrypted-media *; geolocation *; gyroscope *; microphone *; midi *; payment *; serial *; vr *; web-share *; xr-spatial-tracking *' allowFullScreen loading='lazy' />
                            </div>
                            )
                          : (
                            <div className='flex items-center justify-center w-full h-fit py-4 rounded-md bg-red-300/30'>
                              <p className='text-red-600 dark:text-red-400 font-medium text-center'>문제 제출 마감일이 지났습니다. 마감일 이후 수정은 저장되지 않습니다.</p>
                            </div>
                            )
                      )
                    : submission
                      ? (
                          submission.status === 'submitted'
                            ? (
                              <div className='flex flex-col gap-2'>
                                <div className='flex flex-col gap-2 items-center justify-center w-full h-fit py-4 rounded-md bg-green-300/30'>
                                  <p className='text-green-600 dark:text-green-400 font-medium text-center'>문제가 제출되었습니다. 더 이상 수정하실 수 없습니다.</p>
                                  <Link href={submission.codepen_url} target='_blank' rel='noreferrer'>
                                    <Button variant='outline'><ExternalLinkIcon /> CodePen 열기</Button>
                                  </Link>
                                </div>
                                <iframe className='w-full aspect-video' src={`/api/submission_files/${submission.filename}/dist/index.html`} sandbox='allow-downloads allow-forms allow-modals allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-top-navigation-by-user-activation' allow='accelerometer *; ambient-light-sensor *; camera *; display-capture *; encrypted-media *; geolocation *; gyroscope *; microphone *; midi *; payment *; serial *; vr *; web-share *; xr-spatial-tracking *' allowFullScreen loading='lazy' />
                              </div>
                              )
                            : (
                              <div className='flex flex-col gap-2'>
                                <div className='flex flex-col gap-2 items-center justify-center w-full h-fit py-4 rounded-md bg-blue-300/30'>
                                  <p className='text-blue-600 dark:text-blue-400 font-medium text-center'>문제가 아직 제출되지 않았습니다. 제출 기한 내입니다.</p>
                                  <Link href={submission.codepen_url} target='_blank' rel='noreferrer'>
                                    <Button variant='outline'><ExternalLinkIcon /> CodePen 열기</Button>
                                  </Link>
                                </div>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      disabled={apiLoading}
                                    >
                                      {apiLoading ? <LoaderCircleIcon className='animate-spin' /> : (<><SendIcon /> 문제 제출</>)}
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>문제 제출</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        정말 지금 문제를 제출하시겠습니까? 더 이상 수정이 불가능하며, 이 작업은 되돌릴 수 없습니다.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel><XIcon /> 취소</AlertDialogCancel>
                                      <AlertDialogAction onClick={onSubmitSubmission} disabled={apiLoading}>
                                        {apiLoading ? <LoaderCircleIcon className='animate-spin' /> : <SendIcon />} 제출
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                              )
                        )
                      : (
                        <Button
                          onClick={onCreateSubmission}
                          disabled={apiLoading}
                        >
                          {apiLoading ? <LoaderCircleIcon className='animate-spin' /> : <><FlagIcon /> 문제 풀이 시작</>}
                        </Button>
                        )
              )
        }
      </div>
    </div>
  )
}

// [구조 변경 복구] 예전엔 [groupId]/[problemId] 폴더의 layout.tsx 두 겹이
// GroupProvider/ProblemProvider를 자동으로 감싸줬지만, 평탄 구조에는 그런 layout이
// 없으므로 이 페이지에서 두 Provider를 직접 감쌉니다. 둘 다 useSearchParams를
// 쓰므로 Suspense 경계도 함께 필요합니다. 진입 시
// /problem/[problemId]?groupId=.. 형태로 두 값이 모두 있어야 합니다.
export default function ProblemPage () {
  return (
    <Suspense fallback={<Skeleton className='h-8 w-full' />}>
      <GroupProvider>
        <ProblemProvider>
          <ProblemPageContent />
        </ProblemProvider>
      </GroupProvider>
    </Suspense>
  )
}
