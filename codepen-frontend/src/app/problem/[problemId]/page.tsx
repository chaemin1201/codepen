'use client'

import React, { Suspense } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ExternalLinkIcon,
  FlagIcon,
  LoaderCircleIcon,
  SendIcon,
  XIcon,
  PlusIcon,
  PaperclipIcon,
  SearchIcon,
  GripVerticalIcon,
  UsersIcon,
  BarChart2Icon,
  ClipboardCheckIcon,
  GlobeIcon,
  FileTextIcon,
  PencilIcon,
  Trash2Icon,
  ArrowLeftIcon,
  ClockIcon,
  ImageIcon,
  UploadIcon,
} from 'lucide-react'

import { Header } from '@/components/header'
import { GroupProvider, useGroup } from '@/context/group-provider'
import { ProblemProvider, useProblem } from '@/context/problem-provider'
import { Skeleton } from '@/components/ui/skeleton'
import { useSubmission } from '@/lib/useSubmission'
import { useGroupOwner } from '@/lib/useGroupOwner'
import { useCategories } from '@/lib/useCategories'
import { useMe } from '@/context/me-provider'
import { useQuestions } from '@/lib/useQuestions'
import type { Question } from '@/types/question'
import { fetcher } from '@/lib/fetcher'
import { Button } from '@/components/ui/button'
import { EditProblemDialog } from '@/components/edit-problem-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'

// --- 맞춘 확률 배지 ---
const AccuracyBadge = ({ accuracy }: { accuracy: number | null }) => {
  if (accuracy === null) {
    return (
      <div className="inline-flex flex-col items-center justify-center px-3 py-1 rounded-xl text-xs bg-slate-100/80 text-slate-500 border border-slate-200/60 w-[105px]">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-400 font-bold">...</span>
          <span className="text-[11px] font-medium">집계중</span>
        </div>
        <div className="w-full bg-slate-200 h-[3px] rounded-full mt-1" />
      </div>
    )
  }

  const isSuccess = accuracy >= 50
  return (
    <div
      className={`inline-flex flex-col items-center justify-center px-3 py-1 rounded-xl text-xs border w-[105px] ${
        isSuccess
          ? 'bg-emerald-50/70 text-emerald-700 border-emerald-200/80'
          : 'bg-rose-50/70 text-rose-700 border-rose-200/80'
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={`size-3.5 rounded-full flex items-center justify-center text-[9px] text-white font-bold ${
            isSuccess ? 'bg-emerald-500' : 'bg-rose-500'
          }`}
        >
          {isSuccess ? 'S' : 'D'}
        </span>
        <span className="text-[11px] font-bold">{Math.round(accuracy)}%</span>
      </div>
      <div className="w-full bg-slate-200 h-[3px] rounded-full mt-1 overflow-hidden">
        <div
          className={`h-full ${isSuccess ? 'bg-emerald-500' : 'bg-rose-500'}`}
          style={{ width: `${accuracy}%` }}
        />
      </div>
    </div>
  )
}

// --- 소문제 목록 컴포넌트 ---
function QuestionList({
  problemId,
  groupId,
  isOwner,
  searchTerm,
}: {
  problemId: number
  groupId: number
  isOwner: boolean
  searchTerm: string
}) {
  const router = useRouter()
  const { questions, isLoading, mutate } = useQuestions(problemId)
  const [isAddOpen, setIsAddOpen] = React.useState(false)
  const [newTitle, setNewTitle] = React.useState('')
  const [newDescription, setNewDescription] = React.useState('')
  const [newCondition, setNewCondition] = React.useState('')
  const [newExample, setNewExample] = React.useState('')
  const [newExampleImageUrl, setNewExampleImageUrl] = React.useState('')
  const [newScore, setNewScore] = React.useState('10')
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [uploadingImage, setUploadingImage] = React.useState(false)

  // 📸 신규 문제 생성용 이미지 업로드 함수
const handleNewImageUpload = async (file: File) => {
  if (!file.type.startsWith('image/')) {
    toast.error('이미지 파일만 업로드할 수 있습니다.')
    return
  }

  setUploadingImage(true)
  const formData = new FormData()
  // 백엔드 upload_question_image(file: UploadFile = File(...)) 매핑 키인 'file'로 지정
  formData.append('file', file)

  try {
    const res = await fetch('/api/question/upload-image', {
      method: 'POST',
      body: formData, // multipart/form-data 자동 전송
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.detail || errData.error || `업로드 실패 (${res.status})`)
    }

    const data = await res.json()
    // 백엔드에서 반환한 image_url 경로 설정
    setNewExampleImageUrl(data.image_url || data.url)
    toast.success('결과 예시 이미지가 등록되었습니다.')
  } catch (err: any) {
    console.error('Image upload error:', err)
    toast.error(err.message || '이미지 업로드 중 오류가 발생했습니다.')
  } finally {
    setUploadingImage(false)
  }
}

  // 📸 신규 문제 생성 다이얼로그용 이미지 삭제
  const handleNewImageDelete = () => {
    setNewExampleImageUrl('')
    toast.success('이미지 첨부가 취소되었습니다.')
  }

  // 🟢 소문제 생성 핸들러
  const onAdd = async () => {
    if (!newTitle.trim()) return toast.error('문제 제목을 입력해주세요.')
    setIsSubmitting(true)
    try {
      await fetcher('/api/question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problem_id: problemId,
          title: newTitle,
          description: newDescription,
          condition: newCondition,
          conditions: newCondition,
          example_output: newExample,
          example_image_url: newExampleImageUrl,
          score: Number(newScore) || 0,
          order: questions?.length ?? 0,
          is_visible: true,
        }),
      })
      toast.success('소문제가 추가되었습니다.')

      setNewTitle('')
      setNewDescription('')
      setNewCondition('')
      setNewExample('')
      setNewExampleImageUrl('')
      setIsAddOpen(false)

      await mutate(undefined, { revalidate: true })
    } catch {
      toast.error('소문제 추가에 실패했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const toggleVisibility = async (q: Question) => {
    try {
      await fetcher(`/api/question/${q.question_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problem_id: q.problem_id,
          title: q.title,
          description: q.description,
          condition: (q as any).condition || (q as any).conditions,
          conditions: (q as any).condition || (q as any).conditions,
          example_output: q.example_output,
          example_image_url: (q as any).example_image_url,
          score: q.score,
          order: q.order,
          is_visible: !q.is_visible,
        }),
      })
      toast.success(
        q.is_visible ? '비공개로 변경되었습니다.' : '공개로 변경되었습니다.'
      )
      await mutate(undefined, { revalidate: true })
    } catch {
      toast.error('공개 상태 변경 실패')
    }
  }

  const onUpdateScore = async (q: Question, newScore: number) => {
    try {
      await fetcher(`/api/question/${q.question_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: newScore }),
      })
      toast.success('배점이 수정되었습니다.')
      await mutate(undefined, { revalidate: true })
    } catch {
      toast.error('배점 수정 실패')
    }
  }

  const onFileUpload = async (q: Question, file: File) => {
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`/api/question/${q.question_id}/file`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) throw new Error('Upload failed')

      toast.success('첨부파일이 등록되었습니다.')
      await mutate(undefined, { revalidate: true })
    } catch {
      toast.error('파일 업로드 실패')
    }
  }

  const onFileDelete = async (q: Question) => {
    if (!confirm(`'${q.attachment_name}' 파일을 삭제하시겠습니까?`)) return
    try {
      await fetcher(`/api/question/${q.question_id}/file`, {
        method: 'DELETE',
      })
      toast.success('첨부파일이 삭제되었습니다.')
      await mutate(undefined, { revalidate: true })
    } catch {
      toast.error('파일 삭제 실패')
    }
  }

  const onDelete = async (q: Question) => {
    if (!confirm(`'${q.title}' 문제를 삭제하시겠습니까?`)) return
    try {
      await fetcher(`/api/question/${q.question_id}`, { method: 'DELETE' })
      toast.success('문제가 삭제되었습니다.')
      await mutate(undefined, { revalidate: true })
    } catch {
      toast.error('삭제 실패')
    }
  }

  const filteredQuestions = questions?.filter((q) =>
    q.title.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="w-full space-y-3">
      <h2 className="text-xl font-bold text-slate-900">나의 문제들</h2>

      {/* 문제 추가 다이얼로그 */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogTrigger asChild>
          <button id="add-question-trigger" className="hidden" />
        </DialogTrigger>
        <DialogContent className="sm:max-w-xl">
  <DialogHeader>
    <DialogTitle>새 문제 생성</DialogTitle>
  </DialogHeader>
  <div className="space-y-4 py-2 text-xs">
    {/* 1. 문제 이름 */}
    <div className="space-y-1.5">
      <Label className="text-xs font-bold">문제 이름</Label>
      <Input
        value={newTitle}
        onChange={(e) => setNewTitle(e.target.value)}
        placeholder="예: 1번. 두 수의 합 구하기"
      />
    </div>

    {/* 2. 문제 설명 & 조건 */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label className="text-xs font-bold">문제 설명</Label>
        <Textarea
          rows={4}
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
          placeholder="문제 상세 내용을 작성하세요."
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-bold">조건</Label>
        <Textarea
          rows={4}
          value={newCondition}
          onChange={(e) => setNewCondition(e.target.value)}
          placeholder="문제 풀이에 필요한 제약 조건 등을 작성하세요."
        />
      </div>
    </div>

    {/* 3. 결과 예시 (텍스트) */}
    <div className="space-y-1.5">
      <Label className="text-xs font-bold">결과 예시</Label>
      <Textarea
        rows={3}
        value={newExample}
        onChange={(e) => setNewExample(e.target.value)}
        placeholder="입출력 예시를 작성하세요."
      />
    </div>

    {/* 🟢 4. 결과 예시 이미지 업로드 버튼 영역 (추가된 부분) */}
    <div className="space-y-1.5">
      <Label className="text-xs font-bold flex items-center gap-1.5">
        <ImageIcon className="size-3.5 text-indigo-600" /> 결과 예시 이미지 첨부
      </Label>

      {newExampleImageUrl ? (
        <div className="relative border border-slate-200 rounded-lg p-2 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={newExampleImageUrl}
              alt="결과 예시 미리보기"
              className="h-14 w-14 object-cover rounded-md border border-slate-200 bg-white"
            />
            <span className="text-xs text-slate-600 truncate max-w-[220px]">
              {newExampleImageUrl}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleNewImageDelete}
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
                if (file) handleNewImageUpload(file)
              }}
            />
          </label>
          <span className="text-[11px] text-slate-400">
            결과 화면 스크린샷 등을 등록할 수 있습니다.
          </span>
        </div>
      )}
    </div>

    {/* 5. 배점 */}
    <div className="space-y-1.5">
      <Label className="text-xs font-bold">배점</Label>
      <Input
        type="number"
        value={newScore}
        onChange={(e) => setNewScore(e.target.value)}
        className="w-28"
      />
    </div>
  </div>
  <DialogFooter>
    <Button
      onClick={onAdd}
      disabled={isSubmitting || uploadingImage}
      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
    >
      {isSubmitting ? (
        <LoaderCircleIcon className="animate-spin" />
      ) : (
        '생성하기'
      )}
    </Button>
  </DialogFooter>
</DialogContent>
      </Dialog>

      {/* 데이터 테이블 */}
      {isLoading ? (
        <div className="py-8 flex justify-center">
          <LoaderCircleIcon className="animate-spin text-slate-400" />
        </div>
      ) : !filteredQuestions || filteredQuestions.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-400 border border-dashed rounded-xl bg-slate-50">
          등록된 문제가 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200/80 rounded-xl shadow-2xs bg-white">
          <table className="w-full text-xs text-center border-collapse">
            <thead>
              <tr className="bg-slate-100/90 text-slate-600 font-semibold border-b border-slate-200 h-11">
                <th className="w-12 px-2 text-slate-400">
                  <div className="flex items-center justify-center">
                    <GripVerticalIcon className="size-3.5" />
                  </div>
                </th>
                <th className="px-4 py-2 text-left font-medium">문제 제목</th>
                <th className="px-3 py-2 font-medium">맞춘 확률</th>
                <th className="px-3 py-2 font-medium">시도한 횟수</th>
                <th className="px-3 py-2 font-medium">최종 제출 시간</th>
                <th className="px-3 py-2 font-medium">배점</th>
                <th className="px-3 py-2 font-medium">첨부파일</th>
                {isOwner && (
                  <th className="px-3 py-2 font-medium">공개 상태</th>
                )}
                {isOwner && (
                  <th className="px-3 py-2 font-medium">문제 관리</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredQuestions.map((q, idx) => {
                const rawDate = (q as any).my_attempt?.last_submitted_at

                let formattedDate = '-'
                if (rawDate) {
                  const utcDateString =
                    typeof rawDate === 'string' &&
                    !rawDate.endsWith('Z') &&
                    !rawDate.includes('+')
                      ? `${rawDate}Z`
                      : rawDate

                  formattedDate = new Date(utcDateString).toLocaleString(
                    'ko-KR',
                    {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    }
                  )
                }

                return (
                  <tr
                    key={q.question_id}
                    onClick={() => router.push(`/problem/${problemId}/${q.question_id}?groupId=${groupId}`)}
                    className="hover:bg-slate-50/80 transition-colors h-14 cursor-pointer"
                  >
                    <td className="text-slate-400 font-medium">
                      <div className="flex items-center justify-center gap-1">
                        <GripVerticalIcon className="size-3.5 text-slate-300" />
                        <span>{q.order ?? idx + 1}</span>
                      </div>
                    </td>
                    <td className="text-left font-bold text-slate-800 px-4">
                      {q.title}
                    </td>
                    <td>
                      <AccuracyBadge accuracy={q.stats?.accuracy ?? null} />
                    </td>

                    <td className="font-bold text-slate-800">
                      {`${q.my_attempt?.attempts_count ?? 0}회`}
                    </td>

                    <td className="text-slate-600 font-mono text-[11px]">
                      {formattedDate !== '-' ? (
                        <span className="inline-flex items-center gap-1 bg-slate-50 px-2 py-1 rounded border border-slate-100 text-slate-700 font-semibold">
                          <ClockIcon className="size-3 text-slate-400" />
                          {formattedDate}
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>

                    <td
                      className="font-bold text-slate-800"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isOwner ? (
                        <input
                          type="number"
                          defaultValue={q.score}
                          onBlur={(e) => {
                            const val = Number(e.target.value)
                            if (val !== q.score) onUpdateScore(q, val)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur()
                          }}
                          className="w-14 text-center border border-slate-200 rounded px-1 py-0.5 text-xs focus:outline-none focus:border-emerald-500 font-bold"
                        />
                      ) : (
                        q.score
                      )}
                    </td>

                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        {q.attachment_name ? (
                          <div className="inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded-md text-[11px] font-medium transition-colors">
                            <PaperclipIcon className="size-3 text-emerald-600" />
                            <a
                              href={`/uploads/questions/${q.question_id}_${q.attachment_name}`}
                              download={q.attachment_name}
                              className="max-w-[80px] truncate hover:underline"
                              title={q.attachment_name}
                            >
                              {q.attachment_name}
                            </a>
                            {isOwner && (
                              <div className="flex items-center gap-1 ml-0.5">
                                <label
                                  className="cursor-pointer text-slate-400 hover:text-slate-600"
                                  title="파일 변경"
                                >
                                  <PencilIcon className="size-2.5" />
                                  <input
                                    type="file"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0]
                                      if (file) onFileUpload(q, file)
                                    }}
                                  />
                                </label>
                                <button
                                  onClick={() => onFileDelete(q)}
                                  className="text-slate-400 hover:text-rose-500 cursor-pointer"
                                  title="파일 삭제"
                                >
                                  <Trash2Icon className="size-2.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <label className="p-1.5 rounded-full bg-slate-100 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 cursor-pointer inline-flex items-center justify-center transition-colors">
                            <PaperclipIcon className="size-3.5" />
                            {isOwner && (
                              <input
                                type="file"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0]
                                  if (file) onFileUpload(q, file)
                                }}
                              />
                            )}
                          </label>
                        )}
                      </div>
                    </td>

                    {isOwner && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => toggleVisibility(q)}
                          className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors p-0.5 ${
                            q.is_visible ? 'bg-emerald-500' : 'bg-slate-300'
                          }`}
                        >
                          <span
                            className={`inline-flex items-center justify-center size-5 rounded-full bg-white transition-transform ${
                              q.is_visible
                                ? 'translate-x-5'
                                : 'translate-x-0'
                            }`}
                          >
                            <GlobeIcon
                              className={`size-3 ${
                                q.is_visible
                                  ? 'text-emerald-500'
                                  : 'text-slate-400'
                              }`}
                            />
                          </span>
                        </button>
                      </td>
                    )}

                    {isOwner && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => onDelete(q)}
                          className="text-rose-500 hover:underline font-medium text-[11px]"
                        >
                          삭제
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ProblemPageContent() {
  const router = useRouter()
  const { me } = useMe()
  const { group } = useGroup()
  const { problem, refresh } = useProblem()
  const { categories } = useCategories(group?.group_id ?? null)
  const { submission, isLoading, error, mutate } = useSubmission(
    problem?.problem_id ?? 0
  )
  const isOwner = useGroupOwner()
  const [searchTerm, setSearchTerm] = React.useState('')

  if (!problem || isLoading) return <Skeleton className="h-8 w-full" />
  if (error) {
    toast.error('문제를 불러오는 중 오류가 발생했습니다.')
    return null
  }

  const category = categories?.find(
    (c) => c.category_id === problem.category_id
  )

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
          <span>&gt;</span>
          <span className="font-medium text-slate-700 flex items-center gap-1">
            <FileTextIcon className="size-3 text-slate-400" />
            {category
              ? `${category.title} - ${problem.title}`
              : problem.title}
          </span>
        </div>
      </header>

      <div className="flex flex-col gap-5 max-w-6xl mx-auto p-6">
        {/* 상단 타이틀 및 액션 버튼 배치 */}
        <div className="flex flex-wrap items-center justify-between gap-4 mt-2">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg text-slate-500">
              <FileTextIcon className="size-6" />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {problem.title}
            </h1>
            {isOwner && (
              <EditProblemDialog
                problem={problem}
                onEdited={refresh}
                trigger={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 rounded-lg text-slate-400 hover:text-slate-600"
                  >
                    <PencilIcon className="size-4" />
                  </Button>
                }
              />
            )}
          </div>

          {isOwner && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 text-xs font-semibold rounded-lg h-9 px-4 shadow-2xs"
                onClick={() =>
                  router.push(
                    `/problem/${problem.problem_id}/status?groupId=${group?.group_id}`
                  )
                }
              >
                <BarChart2Icon className="size-3.5" /> 현황보기
              </Button>

              <Button
                size="sm"
                className="bg-[#d97706] hover:bg-[#b45309] text-white gap-1.5 text-xs font-semibold rounded-lg h-9 px-4 shadow-2xs"
                onClick={() =>
                  router.push(
                    `/submission?problemId=${problem.problem_id}&groupId=${group?.group_id}`
                  )
                }
              >
                <ClipboardCheckIcon className="size-3.5" /> 채점하기
              </Button>

              <Button
                size="sm"
                className="bg-[#10b981] hover:bg-[#059669] text-white gap-1.5 text-xs font-semibold rounded-lg h-9 px-4 shadow-2xs"
                onClick={() => {
                  const addBtn = document.getElementById(
                    'add-question-trigger'
                  )
                  if (addBtn) addBtn.click()
                }}
              >
                <PlusIcon className="size-3.5" /> 문제 추가하기
              </Button>
            </div>
          )}
        </div>

        {/* 상단 검색 바 */}
        <div className="relative w-full">
          <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <input
            type="text"
            placeholder="검색하기..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-slate-400 bg-white shadow-2xs placeholder:text-slate-400"
          />
        </div>

        {/* 소문제 목록 */}
        {group && (
          <QuestionList
            problemId={problem.problem_id}
            groupId={group.group_id}
            isOwner={isOwner}
            searchTerm={searchTerm}
          />
        )}
      </div>
    </div>
  )
}

export default function ProblemPage() {
  return (
    <Suspense fallback={<Skeleton className="h-8 w-full" />}>
      <GroupProvider>
        <ProblemProvider>
          <ProblemPageContent />
        </ProblemProvider>
      </GroupProvider>
    </Suspense>
  )
}