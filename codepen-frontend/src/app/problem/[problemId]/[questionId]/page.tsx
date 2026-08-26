'use client'

import React, { Suspense, useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ExternalLinkIcon,
  LoaderCircleIcon,
  CheckCircle2Icon,
  EditIcon,
  Code2Icon,
  FileTextIcon,
  TerminalSquareIcon,
  PlayIcon,
  PaperclipIcon,
  PencilIcon,
  Trash2Icon,
  SaveIcon,
  ArrowLeftIcon
} from 'lucide-react'

import { Header } from '@/components/header'
import { GroupProvider, useGroup } from '@/context/group-provider'
import { ProblemProvider, useProblem } from '@/context/problem-provider'
import { Skeleton } from '@/components/ui/skeleton'
import { useGroupOwner } from '@/lib/useGroupOwner'
import { useMe } from '@/context/me-provider'
import { useCategories } from '@/lib/useCategories'
import { useQuery } from '@/lib/useQuery'
import { fetcher } from '@/lib/fetcher'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import type { Question } from '@/types/question'

// 🟢 [교수 전용] 문제 인라인 수정 폼
function EditQuestionForm({
  question,
  onSaved,
  onCancel,
}: {
  question: Question & { condition?: string; conditions?: string }
  onSaved: () => Promise<void> | void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(question.title)
  const [description, setDescription] = useState(question.description ?? '')
  // 🟢 condition 또는 conditions 교차 탐색하여 초기값 설정
  const [condition, setCondition] = useState(question.condition ?? question.conditions ?? '')
  const [exampleOutput, setExampleOutput] = useState(question.example_output ?? '')
  const [score, setScore] = useState(String(question.score))
  const [saving, setSaving] = useState(false)

  const onSave = async () => {
    setSaving(true)
    try {
      await fetcher(`/api/question/${question.question_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problem_id: question.problem_id,
          title,
          description,
          condition, // 백엔드로 condition 전송
          conditions: condition, // 백엔드 호환용 conditions 동시 전송
          example_output: exampleOutput,
          score: Number(score) || 0,
          order: question.order,
          is_visible: question.is_visible,
        }),
      })
      toast.success('문제가 성공적으로 저장되었습니다.')
      await onSaved() // 🟢 데이터 최신화 완료 대기
    } catch (err) {
      console.error('Question update error:', err)
      toast.error('저장에 실패했습니다. 다시 시도해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
      <h2 className="text-sm font-bold text-slate-700">문제 수정 (교수 전용)</h2>
      <div className="space-y-1.5">
        <Label className="text-xs font-bold">문제 이름</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      
      {/* 🟢 설명 및 조건 분리 입력창 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-bold font-mono">문제 설명</Label>
          <Textarea
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="문제 상세 설명을 입력하세요."
            className="text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-bold font-mono">조건</Label>
          <Textarea
            rows={5}
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            placeholder="제약 사항이나 추가 조건을 입력하세요."
            className="text-sm"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-bold">결과 예시 (텍스트)</Label>
        <Textarea
          rows={3}
          value={exampleOutput}
          onChange={(e) => setExampleOutput(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-bold">배점</Label>
        <Input
          type="number"
          value={score}
          onChange={(e) => setScore(e.target.value)}
          className="w-28"
        />
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          취소
        </Button>
        <Button size="sm" onClick={onSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5">
          {saving ? <LoaderCircleIcon className="animate-spin size-3.5" /> : <SaveIcon className="size-3.5" />}
          저장
        </Button>
      </div>
    </div>
  )
}

function QuestionDetailPageContent() {
  const params = useParams()
  const router = useRouter()
  const { me } = useMe()
  const { group } = useGroup()
  const { problem } = useProblem()
  const { categories } = useCategories(group?.group_id ?? null)
  const isOwner = useGroupOwner()

  const questionId = Number(params.questionId)
  const [isEditing, setIsEditing] = useState(false)

  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [userCodePenUrl, setUserCodePenUrl] = useState<string>('')

  const { data: question, isLoading, error, mutate } = useQuery<Question & { condition?: string; conditions?: string; example_image_url?: string; codepen_url?: string }>(
    `/api/question/${questionId}`
  )

  useEffect(() => {
    if (questionId) {
      const savedUrl = localStorage.getItem(`codepen_url_q_${questionId}`)
      if (savedUrl) {
        setUserCodePenUrl(savedUrl)
      } else if (question?.codepen_url) {
        setUserCodePenUrl(question.codepen_url)
      }
    }
  }, [questionId, question])

  const handleCodePenUrlChange = (url: string) => {
    setUserCodePenUrl(url)
    localStorage.setItem(`codepen_url_q_${questionId}`, url)
  }

  const onFileUpload = async (file: File) => {
    if (!question) return
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`/api/question/${question.question_id}/file`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) throw new Error('Upload failed')
      toast.success('첨부파일이 등록되었습니다.')
      await mutate()
    } catch {
      toast.error('파일 업로드 실패')
    }
  }

  const onFileDelete = async () => {
    if (!question || !question.attachment_name) return
    if (!confirm(`'${question.attachment_name}' 파일을 삭제하시겠습니까?`)) return

    try {
      await fetcher(`/api/question/${question.question_id}/file`, {
        method: 'DELETE',
      })
      toast.success('첨부파일이 삭제되었습니다.')
      await mutate()
    } catch {
      toast.error('파일 삭제 실패')
    }
  }

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (error || !question) {
    return (
      <div className="p-8 text-center text-rose-500">
        문제 정보를 불러오는데 실패했습니다.
      </div>
    )
  }

  const baseCodePenUrl = question.codepen_url || 'https://codepen.io/pen'
  const activeCodePenUrl = userCodePenUrl.trim() || baseCodePenUrl

  const getCodePenEmbedUrl = (url: string) => {
    if (!url || url.includes('codepen.io/pen')) return null

    const match = url.match(/codepen\.io\/([^/]+)\/(?:pen|full|details)\/([^/?#]+)/)
    if (match) {
      const [, user, penId] = match
      return `https://codepen.io/${user}/embed/${penId}?default-tab=result`
    }

    if (url.includes('/embed/')) return url

    return null
  }

  const handleInitialSubmit = () => {
    if (!userCodePenUrl.trim() || userCodePenUrl === 'https://codepen.io/pen') {
      return toast.error('본인의 CodePen 제출 링크(URL)를 입력해 주세요.')
    }
    setIsSubmitModalOpen(true)
    setIsExecuting(true)
    setTimeout(() => {
      setIsExecuting(false)
    }, 1200)
  }

  const handleFinalSubmit = async () => {
    try {
      setIsExecuting(true)

      const res = await fetch(`/api/question/${questionId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: questionId,
          codepen_url: activeCodePenUrl,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.message || '제출 처리 실패')
      }

      localStorage.removeItem(`codepen_url_q_${questionId}`)

      toast.success('과제가 성공적으로 제출되었습니다!')
      setIsSubmitModalOpen(false)
      
      router.push(`/problem/${problem?.problem_id}?groupId=${group?.group_id}`)
    } catch (e: any) {
      console.error('Final Submit Error:', e)
      toast.error(e.message || '과제 제출 중 오류가 발생했습니다.')
    } finally {
      setIsExecuting(false)
    }
  }

  const category = categories?.find((c) => c.category_id === problem?.category_id)
  const combinedProblemTitle = category && problem 
    ? `${category.title}-${problem.title}` 
    : problem?.title ?? ''

  const embedUrl = getCodePenEmbedUrl(activeCodePenUrl)

  // 🟢 condition 또는 conditions 키값을 모두 확인하여 바인딩
  const currentConditionText = question.condition || question.conditions || '특별한 조건이 지정되지 않았습니다.'

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <Header user={me} />

      {/* 브레드크럼 */}
      <header className="w-full bg-white border-b border-slate-100 px-6 py-3 flex items-center gap-3 text-xs text-slate-500">
        <button
          onClick={() => router.back()}
          className="size-8 rounded-lg border border-slate-300 flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
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
              <span className="cursor-pointer hover:underline hover:text-slate-700 flex items-center gap-1" onClick={() => router.push(`/problem?groupId=${group.group_id}`)}>
                📚 {group.group_name}
              </span>
            </>
          )}
          {problem && (
            <>
              <span>&gt;</span>
              <span className="cursor-pointer hover:underline hover:text-slate-700 flex items-center gap-1" onClick={() => router.push(`/problem/${problem.problem_id}?groupId=${group?.group_id}`)}>
                📄 {combinedProblemTitle}
              </span>
            </>
          )}
          <span>&gt;</span>
          <span className="font-bold text-slate-800">{question.title}</span>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-end">
          <span className="px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-full shadow-2xs border border-indigo-100">
            배점: {question.score}점
          </span>
        </div>

        {/* 교수 인라인 수정 모드일 때 */}
        {isEditing ? (
          <EditQuestionForm
            question={question}
            onSaved={async () => {
              // 🟢 저장 성공 후 SWR 강제 최신화
              await mutate(undefined, { revalidate: true })
              setIsEditing(false)
            }}
            onCancel={() => setIsEditing(false)}
          />
        ) : (
          /* 메인 문제 내용 영역 */
          <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-2xs space-y-6">
            <h1 className="text-2xl font-bold text-slate-900">{question.title}</h1>

            {/* 🟢 설명과 조건 분리 표시 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 space-y-2">
                <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">문제 설명</h4>
                <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
                  {question.description || '상세 문제 설명이 없습니다.'}
                </p>
              </div>
              <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 space-y-2">
                <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">조건</h4>
                <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
                  {currentConditionText}
                </p>
              </div>
            </div>

            {/* 텍스트 형태 결과 예시 */}
            {question.example_output && (
              <div className="space-y-1.5">
                <h3 className="text-xs font-bold text-slate-500">입출력 / 결과 예시</h3>
                <pre className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 overflow-x-auto whitespace-pre-wrap">
                  {question.example_output}
                </pre>
              </div>
            )}

            {/* 첨부파일 영역 */}
            <div className="space-y-1.5">
              <h3 className="text-xs font-bold text-slate-500 flex items-center gap-1">
                <PaperclipIcon className="size-3.5 text-emerald-600" /> 첨부파일
              </h3>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                {question.attachment_name ? (
                  <div className="flex items-center gap-2">
                    <PaperclipIcon className="size-4 text-emerald-600" />
                    <a
                      href={`/uploads/questions/${question.question_id}_${question.attachment_name}`}
                      download={question.attachment_name}
                      className="text-xs font-medium text-slate-800 hover:underline"
                    >
                      {question.attachment_name}
                    </a>
                  </div>
                ) : (
                  <span className="text-xs text-slate-400">등록된 첨부파일이 없습니다.</span>
                )}

                {isOwner && (
                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                      <PencilIcon className="size-3" /> {question.attachment_name ? '변경' : '업로드'}
                      <input
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) onFileUpload(file)
                        }}
                      />
                    </label>
                    {question.attachment_name && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={onFileDelete}
                        className="h-7 px-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                        title="파일 삭제"
                      >
                        <Trash2Icon className="size-3.5" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* CodePen URL 입력창 */}
            <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-2">
              <Label className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                <Code2Icon className="size-4 text-indigo-600" />
                제출할 CodePen URL 입력
              </Label>
              <Input
                type="url"
                placeholder="예: https://codepen.io/your-username/pen/xxxxxx"
                value={userCodePenUrl}
                onChange={(e) => handleCodePenUrlChange(e.target.value)}
                className="bg-white text-xs font-mono"
              />
              <p className="text-[11px] text-slate-500">
                CodePen에서 코드를 작성 후 Save를 누르고, 브라우저 주소창의 URL을 복사해서 붙여넣어 주세요. (입력 시 자동 임시 저장됩니다)
              </p>
            </div>
          </div>
        )}

        {/* 하단 액션 버튼 영역 */}
        {!isEditing && (
          <div className="flex justify-between items-center gap-3 pt-2">
            <div>
              {isOwner && (
                <Button
                  className="bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold gap-2 shadow-2xs"
                  onClick={() => setIsEditing(true)}
                >
                  <EditIcon className="size-4" /> 문제 수정하기
                </Button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <a href={baseCodePenUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="text-xs font-semibold gap-2 shadow-2xs">
                  <Code2Icon className="size-4" /> CodePen으로 이동하여 풀기
                  <ExternalLinkIcon className="size-3 opacity-60" />
                </Button>
              </a>

              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold gap-2 shadow-2xs text-white"
                onClick={handleInitialSubmit}
              >
                <CheckCircle2Icon className="size-4" /> 과제 제출하기
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 제출 확인 & 실행 결과 뷰어 모달 */}
      <Dialog open={isSubmitModalOpen} onOpenChange={setIsSubmitModalOpen}>
        <DialogContent className="max-w-3xl bg-white rounded-2xl shadow-xl">
          <DialogHeader className="border-b border-slate-100 pb-4">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold text-slate-800">
              <TerminalSquareIcon className="size-5 text-indigo-500" />
              제출 전 실행 결과 확인
            </DialogTitle>
          </DialogHeader>

          <div className="py-4">
            {isExecuting ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4 bg-slate-50 rounded-xl border border-slate-200">
                <LoaderCircleIcon className="size-8 animate-spin text-emerald-500" />
                <p className="text-sm font-semibold text-slate-600">작성한 코드를 불러오는 중입니다...</p>
              </div>
            ) : (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                    <PlayIcon className="size-4 text-emerald-500" /> Output (실행 결과)
                  </h3>
                </div>

                <div className="w-full aspect-video bg-white rounded-xl border border-slate-200 shadow-inner overflow-hidden flex items-center justify-center">
                  {embedUrl ? (
                    <iframe
                      src={embedUrl}
                      title="Code Execution Result"
                      className="w-full h-full border-0"
                      sandbox="allow-scripts allow-same-origin"
                    />
                  ) : (
                    <div className="text-center p-6 text-slate-400 space-y-2">
                      <p className="text-sm font-semibold text-slate-600">유효한 CodePen 고유 URL이 필요합니다.</p>
                      <p className="text-xs">`https://codepen.io/사용자/pen/고유ID` 형식의 링크를 입력해 주세요.</p>
                    </div>
                  )}
                </div>

                <p className="text-xs text-center font-medium bg-rose-50 text-rose-600 py-2 rounded-lg">
                  최종 제출 후에는 코드를 수정할 수 없습니다. 결과가 올바른지 확인해주세요.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:justify-end border-t border-slate-100 pt-4">
            <Button
              variant="outline"
              onClick={() => setIsSubmitModalOpen(false)}
              className="text-slate-600"
              disabled={isExecuting}
            >
              취소 및 수정하기
            </Button>
            <Button
              onClick={handleFinalSubmit}
              disabled={isExecuting || !embedUrl}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 shadow-2xs flex items-center gap-1.5 disabled:opacity-50"
            >
              {isExecuting ? <LoaderCircleIcon className="size-4 animate-spin" /> : <CheckCircle2Icon className="size-4" />}
              확인 후 최종 제출
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function QuestionDetailPage() {
  return (
    <Suspense fallback={<Skeleton className="h-8 w-full" />}>
      <GroupProvider>
        <ProblemProvider>
          <QuestionDetailPageContent />
        </ProblemProvider>
      </GroupProvider>
    </Suspense>
  )
}