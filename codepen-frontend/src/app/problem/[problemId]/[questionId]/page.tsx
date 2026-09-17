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
  SquareCodeIcon,
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
import CodeMirror from '@uiw/react-codemirror'
import { html as htmlLang } from '@codemirror/lang-html'
import { css as cssLang } from '@codemirror/lang-css'
import { javascript as jsLang } from '@codemirror/lang-javascript'
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

  // 🟢 [수정] CodePen 완전히 제거. 이제 플랫폼은 Colab, 아니면 기본값인 "자체 에디터"
  // 두 가지뿐입니다. platform 값 자체는 DB 마이그레이션 없이 그대로 'codepen' 문자열을
  // 쓰지만, 의미상으로는 "자체 에디터"입니다.
  const platform: 'codepen' | 'colab' = (group as any)?.platform === 'colab' ? 'colab' : 'codepen'
  const isColab = platform === 'colab'

  const questionId = Number(params.questionId)
  const [isEditing, setIsEditing] = useState(false)

  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  // 🟢 Colab 전용 - 제출할 Colab 노트북 링크
  const [userSubmitUrl, setUserSubmitUrl] = useState<string>('')

  // 🟢 [신규 - 2단계] 자동 생성된 내 노트북 - 더 이상 학생이 직접 링크를 붙여넣지 않고,
  // 교수 Drive 계정으로 자동 생성/공유된 노트북을 "가져오기 또는 없으면 만들기"로 받아옵니다.
  const [myNotebookUrl, setMyNotebookUrl] = useState<string | null>(null)
  const [isProvisioningNotebook, setIsProvisioningNotebook] = useState(false)
  const [notebookError, setNotebookError] = useState<string | null>(null)

  // 🟢 자체 에디터 상태 - 학생이 이 페이지 안에서 바로 작성하는 코드
  const [editorHtml, setEditorHtml] = useState('')
  const [editorCss, setEditorCss] = useState('')
  const [editorJs, setEditorJs] = useState('')
  // 🟢 [신규] HTML/CSS/JS를 한 번에 다 보여주면 세로로 너무 길어져서, 탭으로 하나씩만 보여줍니다.
  const [activeEditorTab, setActiveEditorTab] = useState<'html' | 'css' | 'js'>('html')

  const { data: question, isLoading, error, mutate } = useQuery<Question & { condition?: string; conditions?: string; example_image_url?: string; codepen_url?: string }>(
    `/api/question/${questionId}`
  )

  useEffect(() => {
    // 🟢 [수정 - 2단계] 예전엔 학생이 직접 붙여넣은 링크를 로컬에서 복원했는데, 이제는
    // 서버가 "가져오기 또는 없으면 만들기"로 노트북을 자동 준비해줍니다. 실패하면(예:
    // 교수가 아직 Drive를 연결 안 함) notebookError를 채워서 화면에서 안내하고,
    // 그럴 때만 예전처럼 수동 링크 입력을 폴백으로 보여줍니다.
    if (!questionId || !isColab) return

    const provisionNotebook = async () => {
      setIsProvisioningNotebook(true)
      setNotebookError(null)
      try {
        const res = await fetch(`/api/question/${questionId}/colab-notebook`, { method: 'POST' })
        const data = await res.json().catch(() => ({} as any))
        if (!res.ok) {
          setNotebookError(data.error || '노트북을 준비하지 못했습니다.')
          // 폴백: 예전처럼 로컬에 저장된 수동 링크가 있으면 그거라도 씀
          const savedUrl = localStorage.getItem(`${platform}_url_q_${questionId}`)
          if (savedUrl) setUserSubmitUrl(savedUrl)
          return
        }
        setMyNotebookUrl(data.colab_url)
        setUserSubmitUrl(data.colab_url) // 기존 제출 로직(activeSubmitUrl 등)이 그대로 동작하도록
      } catch (e) {
        console.error('노트북 준비 실패:', e)
        setNotebookError('노트북을 준비하는 중 오류가 발생했습니다.')
      } finally {
        setIsProvisioningNotebook(false)
      }
    }

    provisionNotebook()
  }, [questionId, platform, isColab])

  // 🟢 [수정] 자체 에디터 코드 복원 - 우선순위 2단계
  //   1순위: 로컬 임시저장본 (작성하다가 중간에 나간 경우 - 새로고침해도 안 날아가게)
  //   2순위: 로컬 임시저장본이 없으면(예: 이미 제출 완료해서 지워진 상태) 서버에 저장된
  //          "가장 최근 제출 내용"을 불러와서, 제출 후 다시 들어와도 빈 화면이 아니라
  //          직전에 낸 코드를 보고 수정한 뒤 재제출할 수 있게 합니다.
  useEffect(() => {
    if (isColab || !questionId || !me?.user_id) return

    const savedHtml = localStorage.getItem(`editor_html_q_${questionId}`)
    const savedCss = localStorage.getItem(`editor_css_q_${questionId}`)
    const savedJs = localStorage.getItem(`editor_js_q_${questionId}`)

    if (savedHtml !== null || savedCss !== null || savedJs !== null) {
      if (savedHtml !== null) setEditorHtml(savedHtml)
      if (savedCss !== null) setEditorCss(savedCss)
      if (savedJs !== null) setEditorJs(savedJs)
      return
    }

    const fetchPreviousSubmissionFile = async (filename: string): Promise<string> => {
      try {
        const res = await fetch(`/api/question/${questionId}/attempt/${me.user_id}/codepen_code/${filename}`)
        if (res.ok) return await res.text()
      } catch (e) {
        console.warn(`이전 제출 파일(${filename}) 로드 실패:`, e)
      }
      return ''
    }

    ;(async () => {
      const [html, css, js] = await Promise.all([
        fetchPreviousSubmissionFile('index.html'),
        fetchPreviousSubmissionFile('style.css'),
        fetchPreviousSubmissionFile('script.js'),
      ])
      if (html || css || js) {
        setEditorHtml(html)
        setEditorCss(css)
        setEditorJs(js)
      }
    })()
  }, [isColab, questionId, me?.user_id])

  const handleEditorChange = (field: 'html' | 'css' | 'js', value: string) => {
    if (field === 'html') setEditorHtml(value)
    if (field === 'css') setEditorCss(value)
    if (field === 'js') setEditorJs(value)
    localStorage.setItem(`editor_${field}_q_${questionId}`, value)
  }

  // 🟢 [신규] 에디터에서 흔히 쓰는 Emmet 단축키 흉내: HTML 칸에 "!"만 입력한 채
  // Tab을 누르면 기본 HTML5 뼈대로 바꿔줍니다.
  const HTML_BOILERPLATE = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Document</title>
</head>
<body>

</body>
</html>`

  // 🟢 [수정] CodeMirror로 바꾸면서 e.currentTarget.value(텍스트박스 전용) 대신
  // React state(editorHtml)를 직접 확인하도록 변경 - 에디터 종류가 바뀌어도 안전합니다.
  const handleHtmlEditorKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab' && editorHtml.trim() === '!') {
      e.preventDefault()
      handleEditorChange('html', HTML_BOILERPLATE)
    }
  }

  // 🟢 자체 에디터 라이브 미리보기 문서
  const editorPreviewDoc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>${editorCss}</style>
</head>
<body>
${editorHtml}
<script>${editorJs}<\/script>
</body>
</html>`

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

  // 🟢 Colab 기본 링크 (자체 에디터는 링크가 필요 없어서 해당 없음)
  const baseSubmitUrl = question.codepen_url || 'https://colab.research.google.com/#create=true'
  const activeSubmitUrl = userSubmitUrl.trim() || baseSubmitUrl

  // 🟢 Colab은 구글이 iframe 삽입을 막아둬서 라이브 미리보기가 불가능함.
  // 대신 "유효한 링크 형식인지"만 검증하고, 실제 확인은 새 탭에서 하도록 안내.
  const isColabUrlValid = isColab ? isValidColabUrl(activeSubmitUrl) : true

  const handleInitialSubmit = () => {
    if (isColab) {
      if (!userSubmitUrl.trim() || userSubmitUrl === baseSubmitUrl) {
        return toast.error('본인의 Colab 제출 링크(URL)를 입력해 주세요.')
      }
      if (!isValidColabUrl(userSubmitUrl)) {
        return toast.error("유효하지 않은 Colab 링크입니다. 'https://colab.research.google.com/drive/...' 형식이어야 합니다.")
      }
      setIsSubmitModalOpen(true)
      setIsExecuting(true)
      setTimeout(() => {
        setIsExecuting(false)
      }, 1200)
      return
    }

    // 🟢 자체 에디터는 URL이 아니라 실제로 작성한 코드가 있는지만 확인
    if (!editorHtml.trim() && !editorCss.trim() && !editorJs.trim()) {
      return toast.error('제출할 코드를 작성해 주세요 (HTML/CSS/JS 중 하나 이상).')
    }
    setIsSubmitModalOpen(true)
  }

  // 🟢 [수정] CodePen 의존성을 완전히 제거했습니다. 이제 "자체 에디터"에서 학생이 작성한
  // html/css/js를 곧바로 서버로 보내고, 서버는 그걸 그대로 zip으로 묶어 저장합니다.
  // 외부 사이트 CORS/봇차단 문제 자체가 더 이상 존재하지 않는 구조입니다.
  const handleFinalSubmit = async () => {
    try {
      setIsExecuting(true)

      const res = await fetch(`/api/question/${questionId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isColab
            ? {
                question_id: questionId,
                codepen_url: activeSubmitUrl,
              }
            : {
                question_id: questionId,
                html: editorHtml,
                css: editorCss,
                js: editorJs,
              }
        ),
      })

      const submitData = await res.json().catch(() => ({} as any))

      if (!res.ok) {
        throw new Error(submitData.error || submitData.message || '제출 처리 실패')
      }

      if (isColab) {
        localStorage.removeItem(`${platform}_url_q_${questionId}`)
      } else {
        localStorage.removeItem(`editor_html_q_${questionId}`)
        localStorage.removeItem(`editor_css_q_${questionId}`)
        localStorage.removeItem(`editor_js_q_${questionId}`)
      }

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

      <div className="w-full px-6 py-6 space-y-6">
        <div className="flex items-center justify-end gap-2">
          <span className={`px-3 py-1 text-xs font-bold rounded-full shadow-2xs border flex items-center gap-1.5 ${
            isColab ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'
          }`}>
            {isColab ? <BookOpenIcon className="size-3.5" /> : <SquareCodeIcon className="size-3.5" />}
            {isColab ? 'Colab' : '자체 에디터'}
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
          /* 🟢 [수정] 왼쪽:오른쪽 비율을 1:1 → 3:7로 변경 (코드 작성/결과에 더 넓은 공간) */
          <div className="grid grid-cols-1 lg:grid-cols-10 gap-6 items-start">
            {/* 왼쪽: 문제 정보 (10칸 중 3칸) */}
            <div className="lg:col-span-3 bg-white border border-slate-100 rounded-xl p-6 shadow-2xs space-y-6">
              <h1 className="text-2xl font-bold text-slate-900">{question.title}</h1>

              <div className="space-y-4">
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
            </div>

            {/* 오른쪽: 코드 작성 + 결과 (10칸 중 7칸) - Colab이면 URL 입력창, 아니면(기본값) 자체 에디터 */}
            <div className="lg:col-span-7 lg:sticky lg:top-6">
              {!isColab ? (
                // 🟢 [수정] 화면 안에 편집창+미리보기가 다 들어오도록 고정 높이(뷰포트 기준) +
                // flex-col로 재구성. 입력칸은 남는 공간을 다 채우고(flex-1), 그 높이를 넘는
                // 코드는 페이지 전체가 늘어나는 대신 입력칸 안에서만 스크롤됩니다.
                <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-2xs flex flex-col gap-3 lg:h-[calc(100vh-19rem)]">
                  <Label className="text-xs font-bold flex items-center gap-1.5 text-emerald-700 shrink-0">
                    <SquareCodeIcon className="size-4 text-emerald-600" />
                    여기서 바로 HTML/CSS/JS를 작성하세요
                  </Label>

                  {/* 🟢 [수정] 위아래 대신 좌우로: 왼쪽 코드 입력 / 오른쪽 실시간 미리보기 */}
                  <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* 왼쪽: 탭 + 코드 입력 */}
                    <div className="flex flex-col min-h-0">
                      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg w-fit shrink-0 mb-2">
                        {(['html', 'css', 'js'] as const).map((tab) => (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setActiveEditorTab(tab)}
                            className={`px-4 py-1.5 text-xs font-bold rounded-md uppercase transition-colors ${
                              activeEditorTab === tab
                                ? 'bg-emerald-600 text-white shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                            }`}
                          >
                            {tab}
                          </button>
                        ))}
                      </div>

                      <div className="flex-1 min-h-0 rounded-md border border-slate-200 overflow-hidden">
                        {activeEditorTab === 'html' && (
                          <CodeMirror
                            value={editorHtml}
                            height="100%"
                            extensions={[htmlLang()]}
                            onChange={(value) => handleEditorChange('html', value)}
                            onKeyDown={handleHtmlEditorKeyDown}
                            placeholder="! 입력 후 Tab을 누르면 기본 HTML 틀이 채워져요"
                            className="h-full text-xs"
                            basicSetup={{ lineNumbers: true, foldGutter: true, autocompletion: true, bracketMatching: true, closeBrackets: true }}
                          />
                        )}
                        {activeEditorTab === 'css' && (
                          <CodeMirror
                            value={editorCss}
                            height="100%"
                            extensions={[cssLang()]}
                            onChange={(value) => handleEditorChange('css', value)}
                            placeholder="div { color: red; }"
                            className="h-full text-xs"
                            basicSetup={{ lineNumbers: true, foldGutter: true, autocompletion: true, bracketMatching: true, closeBrackets: true }}
                          />
                        )}
                        {activeEditorTab === 'js' && (
                          <CodeMirror
                            value={editorJs}
                            height="100%"
                            extensions={[jsLang()]}
                            onChange={(value) => handleEditorChange('js', value)}
                            placeholder="console.log('hi')"
                            className="h-full text-xs"
                            basicSetup={{ lineNumbers: true, foldGutter: true, autocompletion: true, bracketMatching: true, closeBrackets: true }}
                          />
                        )}
                      </div>
                    </div>

                    {/* 오른쪽: 실시간 미리보기 */}
                    <div className="flex flex-col min-h-0">
                      <Label className="text-[11px] font-bold text-slate-500 flex items-center gap-1 shrink-0 mb-2 h-[30px]">
                        <PlayIcon className="size-3 text-emerald-600" /> 실시간 미리보기
                      </Label>
                      <div className="flex-1 min-h-0 rounded-lg border border-slate-200 bg-white overflow-hidden">
                        <iframe
                          srcDoc={editorPreviewDoc}
                          title="Live Preview"
                          className="w-full h-full border-0"
                          sandbox="allow-scripts"
                        />
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500 shrink-0">
                    입력하는 대로 자동으로 임시 저장돼요. 미리보기가 실제 제출될 결과와 동일합니다.
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-xl space-y-2 border bg-amber-50/50 border-amber-100">
                  <Label className="text-xs font-bold flex items-center gap-1.5 text-amber-900">
                    <BookOpenIcon className="size-4 text-amber-600" />
                    내 Colab 노트북
                  </Label>

                  {isProvisioningNotebook ? (
                    <div className="flex items-center gap-2 text-xs text-amber-700 py-2">
                      <LoaderCircleIcon className="size-4 animate-spin" />
                      노트북을 준비하는 중입니다...
                    </div>
                  ) : myNotebookUrl ? (
                    <>
                      <a href={myNotebookUrl} target="_blank" rel="noopener noreferrer">
                        <Button className="w-full bg-amber-600 hover:bg-amber-700 text-white gap-2 text-xs font-semibold">
                          <BookOpenIcon className="size-4" />
                          내 노트북 열어서 작성하기
                          <ExternalLinkIcon className="size-3 opacity-70" />
                        </Button>
                      </a>
                      <p className="text-[11px] text-slate-500">
                        교수님 계정으로 자동 생성되어 본인 이메일로 공유된 노트북이에요. 여기서 작성하고 저장한 뒤, 아래 "과제 제출하기"를 눌러주세요.
                      </p>
                      <p className="text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-2 flex items-start gap-1.5">
                        <span>⚠️</span>
                        <span>
                          <b>반드시 셀을 전부 실행(런타임 → 모두 실행, 또는 Ctrl/Cmd+F9)한 뒤 저장</b>해주세요.
                          실행하지 않고 코드만 작성한 채로 제출하면, 채점 화면에 <b>실행 결과(출력)가 보이지 않아요</b>.
                          코드만 저장돼요.
                        </span>
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-[11px] text-rose-600 font-medium bg-rose-50 border border-rose-100 rounded-lg p-2">
                        ⚠️ {notebookError || '노트북을 준비하지 못했습니다.'}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        자동 준비가 안 되면, 직접 만든 Colab 링크를 아래에 붙여넣어도 제출할 수 있어요 (링크가 있는 모든 사용자로 공유 필요).
                      </p>
                      <p className="text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-2">
                        ⚠️ 이 경우에도 <b>셀을 전부 실행한 뒤 저장</b>해야 결과(출력)가 채점 화면에 보여요.
                      </p>
                      <Input
                        type="url"
                        placeholder="예: https://colab.research.google.com/drive/xxxxxxxxxxxx"
                        value={userSubmitUrl}
                        onChange={(e) => handleSubmitUrlChange(e.target.value)}
                        className="bg-white text-xs font-mono"
                      />
                    </>
                  )}
                </div>
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
                {/* 🟢 [수정] myNotebookUrl이 있으면 위쪽에 이미 "내 노트북 열기" 버튼이 있어서
                    중복이라 숨기고, 자동 준비가 실패해 수동 링크 입력으로 폴백된 경우에만 보여줌 */}
                {isColab && !myNotebookUrl && (
                  <a href={baseSubmitUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" className="text-xs font-semibold gap-2 shadow-2xs">
                      <BookOpenIcon className="size-4" />
                      Colab으로 이동하여 풀기
                      <ExternalLinkIcon className="size-3 opacity-60" />
                    </Button>
                  </a>
                )}

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

                <p className="text-xs text-center font-semibold bg-amber-50 text-amber-700 py-2 rounded-lg border border-amber-100">
                  ⚠️ Colab에서 <b>런타임 → 모두 실행</b>(또는 Ctrl/Cmd+F9)으로 셀을 전부 실행하고 저장했는지 꼭 확인해주세요.
                  실행하지 않으면 채점 화면에 결과(출력)가 안 보이고 코드만 보여요.
                </p>
                <p className="text-xs text-center font-medium bg-rose-50 text-rose-600 py-2 rounded-lg">
                  최종 제출 후에는 코드를 수정할 수 없습니다. 결과가 올바른지 확인해주세요.
                </p>
              </div>
            ) : !isColab ? (
              // 🟢 [신규] 자체 에디터 전용 확인 화면 - 이미 메인 페이지에서 작성한 코드를
              // 그대로 다시 렌더링해서 "이게 최종 제출될 결과가 맞는지" 확인만 시킵니다.
              <div className="space-y-4 animate-in fade-in duration-300">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                    <PlayIcon className="size-4 text-emerald-500" /> Output (최종 제출될 결과)
                  </h3>
                </div>
                <div className="w-full aspect-video bg-white rounded-xl border border-slate-200 shadow-inner overflow-hidden">
                  <iframe
                    srcDoc={editorPreviewDoc}
                    title="Final Preview"
                    className="w-full h-full border-0"
                    sandbox="allow-scripts"
                  />
                </div>
                <p className="text-xs text-center font-medium bg-rose-50 text-rose-600 py-2 rounded-lg">
                  최종 제출 후에는 코드를 수정할 수 없습니다. 결과가 올바른지 확인해주세요.
                </p>
              </div>
            ) : null}
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
              disabled={
                isExecuting ||
                (isColab
                  ? !isColabUrlValid
                  : !editorHtml.trim() && !editorCss.trim() && !editorJs.trim())
              }
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