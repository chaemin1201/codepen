'use client'

import React, { useState, useEffect, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { ExternalLinkIcon, CheckCircle2Icon, ArrowLeftIcon, FileTextIcon, CodeIcon, MonitorPlayIcon } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Header } from '@/components/header'
import { GroupProvider, useGroup } from '@/context/group-provider'
import { ProblemProvider, useProblem } from '@/context/problem-provider'
import { useMe } from '@/context/me-provider'
import { useCategories } from '@/lib/useCategories'

function IndividualSubmissionContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()

  const paramSubId = params.submissionId ? String(params.submissionId) : null
  const querySubId = searchParams.get('submissionId')
  const questionIdParam = searchParams.get('questionId')
  const userIdParam = searchParams.get('userId')

  const rawSubId = paramSubId && paramSubId !== 'detail' && paramSubId !== 'undefined'
    ? paramSubId
    : querySubId

  const { me } = useMe()
  const { group } = useGroup()
  const { problem } = useProblem()
  const { categories } = useCategories(group?.group_id ?? null)

  const [submission, setSubmission] = useState<any>(null)
  const [questionDetail, setQuestionDetail] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)

  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview')

  // 🟢 [추가] 제출 당시 백엔드 스냅샷에서 불러온 소스코드 상태
  const [snapshotCode, setSnapshotCode] = useState<string>('')
  const [isLoadingCode, setIsLoadingCode] = useState(false)

  const [score, setScore] = useState<string>('')
  const [reason, setReason] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const category = categories?.find((c) => c.category_id === problem?.category_id)
  const combinedProblemTitle = category && problem 
    ? `${category.title}-${problem.title}` 
    : problem?.title ?? ''

  useEffect(() => {
    const fetchSubmissionDetails = async () => {
      setIsLoading(true)
      setError(false)

      try {
        let subData: any = null

        if (rawSubId && !isNaN(Number(rawSubId))) {
          const res = await fetch(`/api/submission/${rawSubId}`)
          if (res.ok) {
            subData = await res.json()
          }
        }

        if (!subData && questionIdParam && userIdParam) {
          const apiCandidates = [
            `/api/question/${questionIdParam}/attempt/${userIdParam}`,
            `/api/question/${questionIdParam}/attempts?userId=${userIdParam}`,
            `/api/submission?questionId=${questionIdParam}&userId=${userIdParam}`
          ]

          for (const url of apiCandidates) {
            try {
              const res = await fetch(url)
              if (res.ok) {
                const data = await res.json()
                subData = Array.isArray(data) ? data[0] : data
                if (subData) break
              }
            } catch (e) {
              console.warn(`Fetch candidate failed: ${url}`, e)
            }
          }
        }

        if (!subData) {
          throw new Error('제출 데이터를 찾을 수 없습니다.')
        }

        let problemData = subData.problem || subData.question
        const pId = subData.problem_id || searchParams.get('problemId') || problem?.problem_id

        if (!problemData && pId) {
          try {
            const probRes = await fetch(`/api/problem/${pId}`)
            if (probRes.ok) {
              problemData = await probRes.json()
            }
          } catch (e) {
            console.warn('문제 상세 조회 실패:', e)
          }
        }

        const qId = subData.question_id || subData.questionId || questionIdParam
        if (qId) {
          try {
            const qRes = await fetch(`/api/question/${qId}`)
            if (qRes.ok) {
              const qInfo = await qRes.json()
              setQuestionDetail(qInfo)
            }
          } catch (e) {
            console.warn('소문제 상세 조회 실패:', e)
          }
        }

        const mergedData = { ...subData, problem: problemData }
        setSubmission(mergedData)

        const currentScore = mergedData.professor_score ?? mergedData.professorScore ?? mergedData.score
        if (currentScore !== undefined && currentScore !== null) {
          setScore(String(currentScore))
        }

        const currentReason = mergedData.reason ?? mergedData.feedback ?? mergedData.professor_reason
        if (currentReason) {
          setReason(currentReason)
        }

        // 🟢 [핵심] 제출된 경우 백엔드 스냅샷(ZIP)에서 index.html 소스코드 가져오기
        const targetSubId = mergedData.submission_id || mergedData.id || rawSubId
        if (targetSubId && mergedData.status === 'SUBMITTED') {
          setIsLoadingCode(true)
          try {
            // CodePen 구조에 따라 index.html 또는 index.js 등 주요 파일 요청
            const codeRes = await fetch(`/api/submission/${targetSubId}/codepen_code/src/index.html`)
            if (codeRes.ok) {
              const codeText = await codeRes.text()
              setSnapshotCode(codeText)
            } else {
              // Fallback 시도 (다른 경로 형태일 경우)
              const codeResFallback = await fetch(`/api/submission/${targetSubId}/codepen_code/index.html`)
              if (codeResFallback.ok) {
                const codeText = await codeResFallback.text()
                setSnapshotCode(codeText)
              }
            }
          } catch (codeErr) {
            console.warn('스냅샷 소스코드 로드 실패:', codeErr)
          } finally {
            setIsLoadingCode(false)
          }
        }

      } catch (err) {
        console.error('Submission load error:', err)
        setError(true)
        toast.error('제출물 데이터를 불러오는데 실패했습니다.')
      } finally {
        setIsLoading(false)
      }
    }

    fetchSubmissionDetails()
  }, [rawSubId, questionIdParam, userIdParam])

  const handleSaveScore = async () => {
    if (score === '') return toast.error('점수를 입력해주세요.')
    setIsSubmitting(true)

    const targetSubId = submission?.submission_id || submission?.id || rawSubId

    try {
      const endpoint = targetSubId && !isNaN(Number(targetSubId))
        ? `/api/submission/${targetSubId}/score`
        : `/api/question/${questionIdParam}/attempt/${userIdParam}/score`

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          score: Number(score),
          reason: reason
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || errData.message || '점수 저장에 실패했습니다.')
      }

      toast.success('점수가 성공적으로 저장되었습니다.')
      router.back()
    } catch (e: any) {
      console.error(e)
      toast.error(e.message || '점수 저장 중 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const descriptionText = questionDetail?.description 
    || submission?.problem?.description 
    || submission?.description 
    || '설명이 등록되지 않았습니다.'

  const conditionsText = questionDetail?.condition 
    || questionDetail?.conditions 
    || submission?.problem?.condition 
    || submission?.problem?.conditions 
    || submission?.condition 
    || submission?.conditions 
    || '특별한 조건이 지정되지 않았습니다.'

  const problemTitleText = questionDetail?.title 
    || submission?.problem?.title 
    || submission?.title 
    || '문제 상세 정보'

  if (isLoading) return <div className="p-12"><Skeleton className="h-96 w-full rounded-xl" /></div>
  if (error || !submission) return <div className="p-12 text-center text-rose-500 font-medium">제출 정보를 불러오지 못했습니다.</div>

  const codepenUrl = submission.codepen_url || submission.url || submission.link

  return (
    <div className="min-h-screen bg-[#fafafa] flex flex-col">
      <Header user={me} />

      <header className="w-full bg-white border-b border-slate-100 px-6 py-3 flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="size-8 rounded-lg border border-slate-300 flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
            title="뒤로 가기"
          >
            <ArrowLeftIcon className="size-4" />
          </button>
          
          <div className="flex items-center gap-2">
            <span 
              className="cursor-pointer hover:underline hover:text-slate-700" 
              onClick={() => router.push('/groups')}
            >
              나의 그룹들
            </span>
            {group && (
              <>
                <span>&gt;</span>
                <span 
                  className="cursor-pointer hover:underline hover:text-slate-700 flex items-center gap-1" 
                  onClick={() => router.push(`/problem?groupId=${group.group_id}`)}
                >
                  📚 {group.group_name}
                </span>
              </>
            )}
            {combinedProblemTitle && (
              <>
                <span>&gt;</span>
                <span 
                  className="cursor-pointer hover:underline hover:text-slate-700 font-medium text-slate-700 flex items-center gap-1"
                  onClick={() => {
                    const targetProblemId = problem?.problem_id || submission?.problem_id || searchParams.get('problemId')
                    if (targetProblemId) {
                      router.push(`/problem/${targetProblemId}?groupId=${group?.group_id}`)
                    }
                  }}
                >
                  <FileTextIcon className="size-3 text-slate-400" /> {combinedProblemTitle}
                </span>
              </>
            )}
            <span>&gt;</span>
            <span className="font-bold text-slate-800">개별 채점</span>
          </div>
        </div>

        <span className="text-slate-400 font-mono">
          Submission ID: {submission?.submission_id || submission?.id || rawSubId || '-'}
        </span>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-hidden">
        
        {/* 좌측 패널 */}
        <div className="lg:col-span-9 p-6 overflow-y-auto space-y-6 border-r border-slate-200/60 bg-white">
          <div className="border-b border-slate-100 pb-4">
            <h1 className="text-2xl font-bold text-slate-900">
              {problemTitleText}
            </h1>
            <p className="text-xs text-slate-500 mt-1">학생 제출 결과물 및 문제 상세 정보 (제출 당시 스냅샷 기준)</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50">
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">문제 설명</h4>
              <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
                {descriptionText}
              </p>
            </div>
            <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50">
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">조건</h4>
              <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
                {conditionsText}
              </p>
            </div>
          </div>

          {/* 학생 제출 결과물 및 스냅샷 코드/미리보기 확인 영역 */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h2 className="text-sm font-bold text-slate-800">학생 제출 내역 (스냅샷 박제됨)</h2>
                
                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 shadow-2xs">
                  <button
                    onClick={() => setViewMode('preview')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                      viewMode === 'preview' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <MonitorPlayIcon className="size-3.5" /> 미리보기
                  </button>
                  <button
                    onClick={() => setViewMode('code')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                      viewMode === 'code' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <CodeIcon className="size-3.5" /> 코드 확인
                  </button>
                </div>
              </div>

              {codepenUrl && (
                <a
                  href={codepenUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-slate-400 hover:text-emerald-600 font-semibold flex items-center gap-1 hover:bg-slate-50 px-2 py-1.5 rounded-lg transition-colors border border-transparent hover:border-slate-200"
                  title="참고용 원본 링크 (사후 수정 영향 없음)"
                >
                  <ExternalLinkIcon className="size-3.5" /> 참고용 원본 링크
                </a>
              )}
            </div>
            
            <div className="w-full aspect-[16/9] rounded-xl border border-slate-200 overflow-hidden bg-slate-50 shadow-xs relative">
              {isLoadingCode ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Skeleton className="h-full w-full rounded-xl" />
                </div>
              ) : viewMode === 'code' ? (
                <div className="absolute inset-0 overflow-auto p-4 bg-slate-900 text-slate-100 font-mono text-xs">
                  <pre>
                    <code>{snapshotCode || '저장된 소스코드가 없습니다.'}</code>
                  </pre>
                </div>
              ) : snapshotCode ? (
                <iframe
                  srcDoc={snapshotCode}
                  className="w-full h-full border-0 bg-white"
                  title="Student Snapshot Preview"
                  sandbox="allow-scripts"
                  loading="lazy"
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-slate-400 space-y-2">
                  <p className="text-sm font-semibold text-slate-600">제출된 스냅샷 코드가 존재하지 않습니다.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 우측 패널 */}
        <div className="lg:col-span-3 p-6 flex flex-col justify-between space-y-6 bg-[#fafafa]">
          <div className="space-y-5">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-200/60 pb-3">채점 및 피드백</h3>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700 flex justify-between">
                <span>부여 점수</span>
                <span className="text-slate-400 font-normal">
                  배점: {questionDetail?.score || submission.problem?.score || submission.score || '10'}점
                </span>
              </label>
              <input
                type="number"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                placeholder="점수 입력"
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700">채점 이유 / 피드백</label>
              <textarea
                rows={10}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="학생에게 전달할 피드백이나 감점 사유 등을 작성하세요."
                className="w-full border border-slate-200 rounded-xl p-3.5 text-sm resize-none bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 leading-relaxed"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200/60">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleSaveScore}
              className="w-full py-3.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors shadow-2xs flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <CheckCircle2Icon className="size-4" /> 점수 저장하기
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}

export default function IndividualSubmissionPage() {
  return (
    <Suspense fallback={<Skeleton className="h-screen w-full" />}>
      <GroupProvider>
        <ProblemProvider>
          <IndividualSubmissionContent />
        </ProblemProvider>
      </GroupProvider>
    </Suspense>
  )
}