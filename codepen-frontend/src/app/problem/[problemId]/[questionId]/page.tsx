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
  BookOpenIcon,
  FileTextIcon,
  TerminalSquareIcon,
  PlayIcon,
  PaperclipIcon,
  PencilIcon,
  Trash2Icon,
  SaveIcon,
  ArrowLeftIcon,
  ImageIcon,
  UploadIcon,
  AlertTriangleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClipboardPasteIcon,
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

// 🟢 Colab 공유 URL에서 file id 추출 (백엔드 정규식과 동일한 패턴)
const COLAB_URL_REGEX = /https:\/\/colab\.research\.google\.com\/drive\/([a-zA-Z0-9_-]+)/

function isValidColabUrl(url: string) {
  return COLAB_URL_REGEX.test(url)
}

// 🟢 [교수 전용] 문제 인라인 수정 폼
function EditQuestionForm({
  question,
  onSaved,
  onCancel,
}: {
  question: Question & { condition?: string; conditions?: string; example_image_url?: string }
  onSaved: () => Promise<void> | void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(question.title)
  const [description, setDescription] = useState(question.description ?? '')
  const [condition, setCondition] = useState(question.condition ?? question.conditions ?? '')
  const [exampleOutput, setExampleOutput] = useState(question.example_output ?? '')
  const [exampleImageUrl, setExampleImageUrl] = useState(question.example_image_url ?? '')
  const [score, setScore] = useState(String(question.score))
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)

  // 📸 이미지 업로드 핸들러
  const handleImageUpload = async (file: File) => {
    setUploadingImage(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`/api/question/upload-image`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) throw new Error('Image upload failed')
      const data = await res.json()
      setExampleImageUrl(data.image_url || data.url)
      toast.success('결과 예시 이미지가 등록되었습니다.')
    } catch (err) {
      console.error('Image upload error:', err)
      toast.error('이미지 업로드에 실패했습니다.')
    } finally {
      setUploadingImage(false)
    }
  }

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
          condition,
          conditions: condition,
          example_output: exampleOutput,
          example_image_url: exampleImageUrl, // 🟢 이미지 URL 전달
          score: Number(score) || 0,
          order: question.order,
          is_visible: question.is_visible,
        }),
      })
      toast.success('문제가 성공적으로 저장되었습니다.')
      await onSaved()
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

      {/* 🟢 결과 예시 이미지 업로드 섹션 */}
      <div className="space-y-1.5">
        <Label className="text-xs font-bold flex items-center gap-1.5">
          <ImageIcon className="size-3.5 text-indigo-600" /> 결과 예시 이미지
        </Label>

        {exampleImageUrl ? (
          <div className="relative border border-slate-200 rounded-lg p-2 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src={exampleImageUrl}
                alt="결과 예시 미리보기"
                className="h-14 w-14 object-cover rounded-md border border-slate-200 bg-white"
              />
              <span className="text-xs text-slate-600 truncate max-w-[200px]">
                {exampleImageUrl}
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setExampleImageUrl('')}
              className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 h-8 px-2"
            >
              <Trash2Icon className="size-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 transition-colors">
              {uploadingImage ? (
                <LoaderCircleIcon className="animate-spin size-4 text-indigo-600" />
              ) : (
                <UploadIcon className="size-4 text-indigo-600" />
              )}
              이미지 첨부하기
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadingImage}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleImageUpload(file)
                }}
              />
            </label>
            <span className="text-[11px] text-slate-400">
              결과 화면 스크린샷 등의 이미지를 등록할 수 있습니다.
            </span>
          </div>
        )}
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
        <Button size="sm" onClick={onSave} disabled={saving || uploadingImage} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5">
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

  // 🟢 그룹의 실습 플랫폼
  const platform: 'codepen' | 'colab' = (group as any)?.platform === 'colab' ? 'colab' : 'codepen'
  const isColab = platform === 'colab'

  const questionId = Number(params.questionId)
  const [isEditing, setIsEditing] = useState(false)

  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [userSubmitUrl, setUserSubmitUrl] = useState<string>('')

  // 🟢 [신규] CodePen 자동 가져오기가 봇 차단(CORS/403)으로 실패할 수 있어서,
  // 학생이 직접 코드를 붙여넣을 수 있는 폴백 UI용 상태입니다.
  // 🟢 [수정] CodePen 자동 가져오기가 CORS/서버 IP 차단으로 거의 항상 실패하는 게 확인되어,
  // 이제 "실패하면 열리는 폴백"이 아니라 "기본으로 펼쳐진 주된 제출 방법"으로 바꿉니다.
  const [showPasteFallback, setShowPasteFallback] = useState(true)
  const [pastedHtml, setPastedHtml] = useState('')
  const [pastedCss, setPastedCss] = useState('')
  const [pastedJs, setPastedJs] = useState('')

  const { data: question, isLoading, error, mutate } = useQuery<Question & { condition?: string; conditions?: string; example_image_url?: string; codepen_url?: string }>(
    `/api/question/${questionId}`
  )

  useEffect(() => {
    if (questionId) {
      // 🟢 플랫폼별로 로컬 임시저장 키를 분리 (그룹 전환 시 잘못된 값이 섞이지 않게)
      const savedUrl = localStorage.getItem(`${platform}_url_q_${questionId}`)
      if (savedUrl) {
        setUserSubmitUrl(savedUrl)
      } else if (question?.codepen_url) {
        setUserSubmitUrl(question.codepen_url)
      }
    }
  }, [questionId, question, platform])

  const handleSubmitUrlChange = (url: string) => {
    setUserSubmitUrl(url)
    localStorage.setItem(`${platform}_url_q_${questionId}`, url)
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

  // 🟢 플랫폼별 기본 링크
  const baseSubmitUrl = question.codepen_url || (isColab ? 'https://colab.research.google.com/#create=true' : 'https://codepen.io/pen')
  const activeSubmitUrl = userSubmitUrl.trim() || baseSubmitUrl

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

  // 🟢 Colab은 구글이 iframe 삽입을 막아둬서 라이브 미리보기가 불가능함.
  // 대신 "유효한 링크 형식인지"만 검증하고, 실제 확인은 새 탭에서 하도록 안내.
  const isColabUrlValid = isColab ? isValidColabUrl(activeSubmitUrl) : true
  const embedUrl = isColab ? null : getCodePenEmbedUrl(activeSubmitUrl)

  const handleInitialSubmit = () => {
    if (!userSubmitUrl.trim() || userSubmitUrl === baseSubmitUrl) {
      return toast.error(`본인의 ${isColab ? 'Colab' : 'CodePen'} 제출 링크(URL)를 입력해 주세요.`)
    }
    if (isColab && !isValidColabUrl(userSubmitUrl)) {
      return toast.error("유효하지 않은 Colab 링크입니다. 'https://colab.research.google.com/drive/...' 형식이어야 합니다.")
    }
    setIsSubmitModalOpen(true)
    setIsExecuting(true)
    setTimeout(() => {
      setIsExecuting(false)
    }, 1200)
  }

  // 🟢 [수정] CodePen의 .html/.css/.js는 브라우저에서 fetch()로 절대 가져올 수 없습니다
  // (CodePen이 CORS 허용 헤더를 주지 않음 - <script src>/<link> 태그 전용으로 설계된 기능이라
  // 그렇습니다). 그래서 더 이상 프론트에서 코드를 긁어오려고 시도하지 않고, codepen_url만
  // 백엔드로 보내면 백엔드가 서버 대 서버로 직접 가져옵니다(CORS는 브라우저만 검사하는 규칙이라
  // 서버끼리 통신할 때는 적용되지 않습니다).
  const handleFinalSubmit = async () => {
    try {
      setIsExecuting(true)

      // 백엔드로 codepen_url과 (있다면) 직접 붙여넣은 코드를 함께 전송
      const res = await fetch(`/api/question/${questionId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: questionId,
          codepen_url: activeSubmitUrl,
          html: pastedHtml,
          css: pastedCss,
          js: pastedJs,
        }),
      })

      const submitData = await res.json().catch(() => ({} as any))

      if (!res.ok) {
        // 서버가 CodePen에서 코드를 가져오는 데 실패한 경우(봇 차단/CORS/비공개 pen 등)
        // 여기서 바로 에러로 알려주고, 직접 붙여넣기 폴백을 자동으로 펼쳐줍니다.
        setShowPasteFallback(true)
        throw new Error(submitData.error || submitData.message || '제출 처리 실패')
      }

      localStorage.removeItem(`${platform}_url_q_${questionId}`)
      setPastedHtml('')
      setPastedCss('')
      setPastedJs('')
      setShowPasteFallback(false)

      // 🟢 지각 여부는 브라우저 로컬 시계 대신, /submit 응답에 서버가 내려주는
      // is_late / late_by_minutes를 우선 사용 (클라이언트 시계 조작/오차에 안전)
      if (submitData?.is_late) {
        const lateMin = Number(submitData.late_by_minutes || 0)
        const days = Math.floor(lateMin / (60 * 24))
        const hours = Math.floor((lateMin % (60 * 24)) / 60)
        const minutes = lateMin % 60
        const lateText = days > 0 ? `${days}일 ${hours}시간` : hours > 0 ? `${hours}시간 ${minutes}분` : `${minutes}분`
        toast.warning(`마감 기한을 넘겨 제출되었습니다. (${lateText} 늦음) · 제출 늦음으로 표시됩니다.`)
      } else if (submitData?.deadline) {
        toast.success('과제가 마감 기한 내에 성공적으로 제출되었습니다!')
      } else {
        toast.success('과제가 성공적으로 제출되었습니다!')
      }
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

  // 🟢 [신규] 시험(exam) 카테고리는 마감 이후 제출 자체가 백엔드에서 막힙니다.
  // 여기서도 미리 감지해서, 학생이 어차피 실패할 제출을 시도하기 전에 버튼을 잠급니다.
  const isExamCategory = category?.type === 'exam'
  const examDeadlinePassed = isExamCategory && !!problem?.deadline &&
    new Date(problem.deadline.endsWith('Z') || problem.deadline.includes('+') ? problem.deadline : `${problem.deadline}Z`).getTime() < Date.now()

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
        <div className="flex items-center justify-end gap-2">
          <span className={`px-3 py-1 text-xs font-bold rounded-full shadow-2xs border flex items-center gap-1.5 ${
            isColab ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-slate-50 text-slate-600 border-slate-200'
          }`}>
            {isColab ? <BookOpenIcon className="size-3.5" /> : <Code2Icon className="size-3.5" />}
            {isColab ? 'Colab' : 'CodePen'}
          </span>
          <span className="px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-full shadow-2xs border border-indigo-100">
            배점: {question.score}점
          </span>
        </div>

        {/* 교수 인라인 수정 모드일 때 */}
        {isEditing ? (
          <EditQuestionForm
            question={question}
            onSaved={async () => {
              await mutate(undefined, { revalidate: true })
              setIsEditing(false)
            }}
            onCancel={() => setIsEditing(false)}
          />
        ) : (
          /* 메인 문제 내용 영역 */
          <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-2xs space-y-6">
            <h1 className="text-2xl font-bold text-slate-900">{question.title}</h1>

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

            {/* 🟢 텍스트 + 이미지가 합쳐진 단일 결과 예시 블록 */}
            {(question.example_output || question.example_image_url) && (
              <div className="space-y-1.5">
                <h3 className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                  <ImageIcon className="size-3.5 text-indigo-600" /> 결과 예시
                </h3>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  {/* 1. 텍스트 예시 */}
                  {question.example_output && (
                    <pre className="text-xs font-mono text-slate-800 whitespace-pre-wrap leading-relaxed">
                      {question.example_output}
                    </pre>
                  )}

                  {/* 2. 경계선 (텍스트와 이미지가 모두 있을 때 노출) */}
                  {question.example_output && question.example_image_url && (
                    <div className="border-t border-slate-200 my-2" />
                  )}

                  {/* 3. 이미지 예시 */}
                  {question.example_image_url && (
                    <div>
                      <img
                        src={question.example_image_url}
                        alt="결과 예시 이미지"
                        className="max-h-96 w-auto object-contain rounded-lg border border-slate-200 bg-white"
                      />
                    </div>
                  )}
                </div>
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

            {/* 🟢 플랫폼에 따라 CodePen/Colab URL 입력창 분기 */}
            <div className={`p-4 rounded-xl space-y-2 border ${
              isColab ? 'bg-amber-50/50 border-amber-100' : 'bg-indigo-50/50 border-indigo-100'
            }`}>
              <Label className={`text-xs font-bold flex items-center gap-1.5 ${isColab ? 'text-amber-900' : 'text-indigo-900'}`}>
                {isColab ? (
                  <BookOpenIcon className="size-4 text-amber-600" />
                ) : (
                  <Code2Icon className="size-4 text-indigo-600" />
                )}
                제출할 {isColab ? 'Colab' : 'CodePen'} URL 입력
              </Label>
              <Input
                type="url"
                placeholder={isColab
                  ? '예: https://colab.research.google.com/drive/xxxxxxxxxxxx'
                  : '예: https://codepen.io/your-username/pen/xxxxxx'}
                value={userSubmitUrl}
                onChange={(e) => handleSubmitUrlChange(e.target.value)}
                className="bg-white text-xs font-mono"
              />
              {isColab ? (
                <p className="text-[11px] text-slate-500">
                  Colab에서 파일 → 공유 → <b>"링크가 있는 모든 사용자"</b>로 공유 설정 후, 주소창의 URL을 복사해서 붙여넣어 주세요. (입력 시 자동 임시 저장됩니다)
                </p>
              ) : (
                <p className="text-[11px] text-slate-500">
                  CodePen에서 코드를 작성 후 Save를 누르고, 브라우저 주소창의 URL을 복사해서 붙여넣어 주세요. (입력 시 자동 임시 저장됩니다)
                </p>
              )}
            </div>
          </div>
        )}

        {/* 하단 액션 버튼 영역 */}
        {!isEditing && (
          <div className="pt-2 space-y-1.5">
            <div className="flex justify-between items-center gap-3">
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
                <a href={baseSubmitUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="text-xs font-semibold gap-2 shadow-2xs">
                    {isColab ? <BookOpenIcon className="size-4" /> : <Code2Icon className="size-4" />}
                    {isColab ? 'Colab' : 'CodePen'}으로 이동하여 풀기
                    <ExternalLinkIcon className="size-3 opacity-60" />
                  </Button>
                </a>

                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold gap-2 shadow-2xs text-white disabled:opacity-50 disabled:hover:bg-emerald-600"
                  onClick={handleInitialSubmit}
                  disabled={examDeadlinePassed}
                  title={examDeadlinePassed ? '시험 시간이 종료되어 제출할 수 없습니다.' : undefined}
                >
                  <CheckCircle2Icon className="size-4" />
                  {examDeadlinePassed ? '시험 종료 · 제출 불가' : '과제 제출하기'}
                </Button>
              </div>
            </div>
            {examDeadlinePassed && (
              <p className="w-full text-right text-[11px] text-rose-500 font-medium">
                시험 카테고리는 마감(시험 종료) 이후 제출이 허용되지 않습니다.
              </p>
            )}
          </div>
        )}
      </div>

      {/* 제출 확인 & 실행 결과 뷰어 모달 */}
      <Dialog open={isSubmitModalOpen} onOpenChange={setIsSubmitModalOpen}>
        <DialogContent className="max-w-3xl sm:max-w-6xl bg-white rounded-2xl shadow-xl">
          <DialogHeader className="border-b border-slate-100 pb-4">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold text-slate-800">
              <TerminalSquareIcon className="size-5 text-indigo-500" />
              제출 전 {isColab ? '링크' : '실행 결과'} 확인
            </DialogTitle>
          </DialogHeader>

          <div className="py-4">
            {isExecuting ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4 bg-slate-50 rounded-xl border border-slate-200">
                <LoaderCircleIcon className="size-8 animate-spin text-emerald-500" />
                <p className="text-sm font-semibold text-slate-600">
                  {isColab ? '링크를 확인하는 중입니다...' : '작성한 코드를 불러오는 중입니다...'}
                </p>
              </div>
            ) : isColab ? (
              // 🟢 Colab 전용 확인 화면
              <div className="space-y-4 animate-in fade-in duration-300">
                <div className={`w-full rounded-xl border p-6 flex flex-col items-center gap-3 text-center ${
                  isColabUrlValid ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'
                }`}>
                  {isColabUrlValid ? (
                    <>
                      <CheckCircle2Icon className="size-8 text-emerald-500" />
                      <p className="text-sm font-semibold text-emerald-700">유효한 Colab 링크 형식입니다.</p>
                      <p className="text-xs text-emerald-600">
                        Google은 보안상 Colab을 이 화면에 바로 띄우는 걸 막고 있어요. 아래 버튼으로 새 탭에서 최종 내용을 직접 확인해주세요.
                      </p>
                      <a href={activeSubmitUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" className="gap-1.5 text-xs mt-1">
                          <ExternalLinkIcon className="size-3.5" /> Colab에서 새 탭으로 열어 확인하기
                        </Button>
                      </a>
                    </>
                  ) : (
                    <>
                      <AlertTriangleIcon className="size-8 text-rose-500" />
                      <p className="text-sm font-semibold text-rose-600">유효한 Colab 고유 URL이 필요합니다.</p>
                      <p className="text-xs text-rose-500">
                        `https://colab.research.google.com/drive/파일ID` 형식의 링크를 입력해 주세요.
                      </p>
                    </>
                  )}
                </div>

                <p className="text-xs text-center font-medium bg-rose-50 text-rose-600 py-2 rounded-lg">
                  최종 제출 후에는 코드를 수정할 수 없습니다. 결과가 올바른지 확인해주세요.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 animate-in fade-in duration-300">
                {/* 🟢 [수정] 왼쪽: 제출될 결과 미리보기 + 경고 문구 / 오른쪽: 코드 입력 - 요청대로 좌우 배치 */}
                <div className="space-y-3">
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

                  <p className="text-xs text-center font-medium bg-amber-50 text-amber-600 py-2 rounded-lg">
                    ⚠️ 오른쪽 <strong>코드 붙여넣기</strong>에 직접 입력해주세요. CodePen 자동 가져오기는 대부분 차단돼서 안정적이지 않아요.
                  </p>
                  <p className="text-xs text-center font-medium bg-rose-50 text-rose-600 py-2 rounded-lg">
                    최종 제출 후에는 코드를 수정할 수 없습니다. 결과가 올바른지 확인해주세요.
                  </p>
                </div>

                {/* 🟢 오른쪽: 코드 붙여넣기. CodePen 자동 가져오기가 CORS/서버 IP 차단으로 거의 항상
                    실패해서, "실패 시 폴백"이 아니라 "기본 제출 방법"으로 기본 펼침 처리합니다. */}
                <div className="border border-emerald-200 rounded-xl overflow-hidden self-start">
                  <button
                    type="button"
                    onClick={() => setShowPasteFallback((v) => !v)}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 transition-colors text-xs font-bold text-emerald-700"
                  >
                    <span className="flex items-center gap-1.5">
                      <ClipboardPasteIcon className="size-3.5" />
                      코드 붙여넣기 (권장 · CodePen 자동 가져오기는 대부분 차단돼요)
                    </span>
                    {showPasteFallback ? (
                      <ChevronUpIcon className="size-3.5" />
                    ) : (
                      <ChevronDownIcon className="size-3.5" />
                    )}
                  </button>

                  {showPasteFallback && (
                    <div className="p-3.5 space-y-3 bg-white">
                      <p className="text-[11px] text-slate-500">
                        CodePen 각 패널(HTML/CSS/JS) 안을 클릭 → 전체 선택(Ctrl/Cmd+A) → 복사(Ctrl/Cmd+C) 한 뒤
                        아래에 붙여넣어주세요. 아래 칸에 뭔가 입력되어 있으면 <strong>그 내용이 그대로 제출</strong>되고,
                        비워두면 자동 가져오기를 시도하지만 대부분의 경우 실패해요.
                      </p>
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label className="text-[11px] font-bold text-slate-600">HTML</Label>
                          <Textarea
                            value={pastedHtml}
                            onChange={(e) => setPastedHtml(e.target.value)}
                            placeholder="<div>...</div>"
                            rows={5}
                            className="font-mono text-[11px] resize-y"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[11px] font-bold text-slate-600">CSS</Label>
                          <Textarea
                            value={pastedCss}
                            onChange={(e) => setPastedCss(e.target.value)}
                            placeholder="body { ... }"
                            rows={5}
                            className="font-mono text-[11px] resize-y"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[11px] font-bold text-slate-600">JS</Label>
                          <Textarea
                            value={pastedJs}
                            onChange={(e) => setPastedJs(e.target.value)}
                            placeholder="console.log(...)"
                            rows={5}
                            className="font-mono text-[11px] resize-y"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
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
              disabled={isExecuting || (isColab ? !isColabUrlValid : !embedUrl)}
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