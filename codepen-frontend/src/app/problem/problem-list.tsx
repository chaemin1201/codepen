'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  PlusIcon,
  LoaderCircleIcon,
  PaperclipIcon,
  SearchIcon,
  GripVerticalIcon,
  BarChart2Icon,
  UsersIcon,
} from 'lucide-react'

import { useQuestions } from '@/lib/useQuestions'
import { fetcher } from '@/lib/fetcher'
import { Button } from '@/components/ui/button'
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
import type { Question } from '@/types/question'

const AccuracyBadge = ({ accuracy }: { accuracy: number | null }) => {
  if (accuracy === null) {
    return (
      <span className='inline-flex items-center gap-1 bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full text-[11px] font-medium'>
        <span className='text-[10px] font-bold'>•••</span> 집계중
      </span>
    )
  }
  const isSuccess = accuracy >= 50
  return (
    <div className={`inline-flex flex-col items-center justify-center px-2.5 py-1 rounded-xl text-xs font-bold border w-[80px] mx-auto ${isSuccess ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
      <div className='flex items-center gap-1.5'>
        <span className={`size-3.5 rounded-full flex items-center justify-center text-[8px] text-white font-black ${isSuccess ? 'bg-emerald-600' : 'bg-rose-600'}`}>
          {isSuccess ? 'S' : 'D'}
        </span>
        <span className='text-[11px]'>{Math.round(accuracy)}%</span>
      </div>
      <div className='w-full bg-slate-200 h-[3px] rounded-full mt-1 overflow-hidden'>
        <div className={`h-full ${isSuccess ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${accuracy}%` }} />
      </div>
    </div>
  )
}

function GraderSettingsDialog ({ groupId }: { groupId: number }) {
  const [open, setOpen] = React.useState(false)
  const [students, setStudents] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(false)

  const loadStudents = async () => {
    setLoading(true)
    try {
      const data = await fetcher(`/api/group/${groupId}/students`)
      setStudents((data as any[]) || [])
    } catch {
      toast.error('수강생 목록을 불러오지 못했습니다.')
      setStudents([])
    }
    setLoading(false)
  }

  const toggleGraderRole = async (studentId: string, currentRole: boolean) => {
    try {
      await fetcher(`/api/group/${groupId}/grader`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, is_grader: !currentRole }),
      })
      toast.success('채점자 권한이 변경되었습니다.')
      loadStudents()
    } catch {
      toast.error('권한 변경에 실패했습니다.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) loadStudents() }}>
      <DialogTrigger asChild>
        <button className='flex items-center gap-1.5 px-3.5 py-2 bg-[#5c7cfa] text-white rounded-lg hover:bg-[#4c6ef5] transition-colors shadow-2xs text-xs font-semibold cursor-pointer'>
          <UsersIcon className='size-3.5' /> 채점자 설정
        </button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>수강생 채점자 권한 설정</DialogTitle>
        </DialogHeader>
        <div className='space-y-3 py-2 max-h-80 overflow-y-auto'>
          {loading ? (
            <div className='py-6 flex justify-center'><LoaderCircleIcon className='animate-spin text-slate-400' /></div>
          ) : students.length === 0 ? (
            <div className='text-xs text-center text-slate-400 py-4'>수강 중인 학생이 없습니다.</div>
          ) : (
            students.map((student) => (
              <div key={student.user_id} className='flex items-center justify-between p-2.5 rounded-lg border border-slate-100 bg-slate-50/50'>
                <div>
                  <div className='text-xs font-bold text-slate-800'>{student.username || student.name}</div>
                  <div className='text-[11px] text-slate-400'>{student.student_no || '학번 미등록'}</div>
                </div>
                <Button size='sm' variant={student.is_grader ? 'default' : 'outline'} className={student.is_grader ? 'bg-indigo-600 text-xs h-7' : 'text-xs h-7'} onClick={() => toggleGraderRole(student.user_id, student.is_grader)}>
                  {student.is_grader ? '채점자' : '권한 부여'}
                </Button>
              </div>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => setOpen(false)}>닫기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function QuestionList ({ problemId, groupId, isOwner }: { problemId: number, groupId: number, isOwner: boolean }) {
  const router = useRouter()
  const { questions, isLoading, mutate } = useQuestions(problemId)
  const [searchTerm, setSearchTerm] = React.useState('')
  const [isAddOpen, setIsAddOpen] = React.useState(false)
  const [newTitle, setNewTitle] = React.useState('')
  const [newDescription, setNewDescription] = React.useState('')
  const [newExample, setNewExample] = React.useState('')
  const [newScore, setNewScore] = React.useState('10')
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const onAdd = async () => {
    if (!newTitle.trim()) return toast.error('문제 이름(제목)을 입력해주세요.')
    setIsSubmitting(true)
    try {
      await fetcher('/api/question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problem_id: problemId, title: newTitle, description: newDescription, example_output: newExample, score: Number(newScore) || 0, order: questions?.length ?? 0, is_visible: true }),
      })
      toast.success('문제가 추가되었습니다.')
      setNewTitle(''); setNewDescription(''); setNewExample(''); setIsAddOpen(false); mutate()
    } catch {
      toast.error('문제 추가에 실패했습니다.')
    }
    setIsSubmitting(false)
  }

  const onDelete = async (q: Question) => {
    if (!confirm(`'${q.title}' 문제를 삭제하시겠습니까?`)) return
    try {
      await fetcher(`/api/question/${q.question_id}`, { method: 'DELETE' })
      toast.success('문제가 삭제되었습니다.'); mutate()
    } catch {
      toast.error('삭제 실패')
    }
  }

  const filteredQuestions = questions?.filter((q) => q.title.toLowerCase().includes(searchTerm.toLowerCase()))

  return (
    <div className='w-full space-y-5 text-slate-800'>
      <div className='flex flex-wrap justify-between items-center gap-3'>
        <div className='text-xl font-bold text-slate-900'>나의 문제들</div>
        {isOwner && (
          <div className='flex items-center gap-2 text-xs font-semibold'>
            {/* ✏️ 현황보기 경로 쿼리스트링 방식으로 수정 */}
            <button onClick={() => router.push(`/problem?groupId=${groupId}&problemId=${problemId}`)} className='flex items-center gap-1.5 px-3.5 py-2 bg-mygreen text-white rounded-lg hover:bg-mydarkgreen transition-colors shadow-2xs cursor-pointer'>
              <BarChart2Icon className='size-3.5' /> 현황보기
            </button>
            <GraderSettingsDialog groupId={groupId} />
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
              <DialogTrigger asChild>
                <button className='flex items-center gap-1.5 px-3.5 py-2 bg-[#5b9368] text-white rounded-lg hover:bg-[#4f825b] transition-colors shadow-2xs cursor-pointer'>
                  <PlusIcon className='size-3.5' /> 문제 추가하기
                </button>
              </DialogTrigger>
              <DialogContent className='sm:max-w-lg'>
                <DialogHeader><DialogTitle>새 문제 생성</DialogTitle></DialogHeader>
                <div className='space-y-4 py-2 text-xs'>
                  <div className='space-y-1.5'><Label className='text-xs font-bold'>문제 이름</Label><Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder='예: 1번. 두 수의 합 구하기' /></div>
                  <div className='space-y-1.5'><Label className='text-xs font-bold'>문제 설명</Label><Textarea rows={4} value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder='문제 풀이에 필요한 조건을 작성하세요.' /></div>
                  <div className='space-y-1.5'><Label className='text-xs font-bold'>결과 예시</Label><Textarea rows={3} value={newExample} onChange={(e) => setNewExample(e.target.value)} placeholder='입출력 예시를 작성하세요.' /></div>
                  <div className='space-y-1.5'><Label className='text-xs font-bold'>배점</Label><Input type='number' value={newScore} onChange={(e) => setNewScore(e.target.value)} /></div>
                </div>
                <DialogFooter><Button onClick={onAdd} disabled={isSubmitting}>{isSubmitting ? <LoaderCircleIcon className='animate-spin' /> : '생성하기'}</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      <div className='relative'>
        <SearchIcon className='absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400' />
        <input type='text' placeholder='검색하기...' value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className='w-full pl-10 pr-4 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 bg-slate-50/50' />
      </div>

      {isLoading ? (
        <div className='py-8 flex justify-center'><LoaderCircleIcon className='animate-spin text-slate-400' /></div>
      ) : !filteredQuestions || filteredQuestions.length === 0 ? (
        <div className='py-8 text-center text-xs text-slate-400 border border-dashed rounded-xl bg-slate-50'>등록된 문제가 없습니다.</div>
      ) : (
        <div className='overflow-x-auto border border-slate-100 rounded-xl shadow-2xs bg-white'>
          <table className='w-full text-xs text-center border-collapse'>
            <thead><tr className='bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200/60 h-11'><th className='w-12 px-2'>▲▼</th><th className='px-4 py-2 text-left'>문제 제목</th><th className='px-3 py-2'>맞춘 확률</th><th className='px-3 py-2'>시도한 횟수</th><th className='px-3 py-2'>맞은 횟수</th><th className='px-3 py-2'>배점</th><th className='px-3 py-2'>첨부파일</th>{isOwner && <th className='px-3 py-2'>공개 상태</th>}{isOwner && <th className='px-3 py-2'>삭제</th>}</tr></thead>
            <tbody className='divide-y divide-slate-100'>
              {filteredQuestions.map((q, idx) => (
                <tr
                  key={q.question_id}
                  /* ✏️ 문제 클릭 시 이동할 경로를 평탄화 구조(쿼리 파라미터)로 수정 */
                  onClick={() => router.push(`/question?groupId=${groupId}&problemId=${problemId}&questionId=${q.question_id}`)}
                  className='hover:bg-slate-50/60 transition-colors h-14 cursor-pointer'
                >
                  <td className='text-slate-400 font-medium'><div className='flex items-center justify-center gap-0.5'><GripVerticalIcon className='size-3.5 text-slate-300 cursor-grab' /><span>{q.order ?? idx + 1}</span></div></td>
                  <td className='text-left font-bold text-slate-800 px-4'>{q.title}</td>
                  <td><AccuracyBadge accuracy={q.stats?.accuracy ?? null} /></td>
                  <td className='font-bold text-slate-800'>{isOwner ? q.stats?.total_attempts ?? 0 : q.my_attempt?.attempts_count ?? 0}</td>
                  <td className='font-bold text-slate-800'>{q.stats?.total_correct ?? 0}</td>
                  <td className='font-bold text-slate-800'>{q.score}</td>
                  <td><button onClick={(e) => e.stopPropagation()} className='p-1 rounded-full bg-slate-100 text-slate-400 hover:text-slate-600'><PaperclipIcon className='size-3.5' /></button></td>
                  {isOwner && (<td><span className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${q.is_visible ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>{q.is_visible ? '공개' : '비공개'}</span></td>)}
                  {isOwner && (<td><button onClick={(e) => { e.stopPropagation(); onDelete(q) }} className='text-rose-500 hover:underline font-medium cursor-pointer'>삭제</button></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}