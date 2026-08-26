'use client'

import React, { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Header } from '@/components/header'
import { GroupProvider, useGroup } from '@/context/group-provider'
import { ProblemProvider, useProblem } from '@/context/problem-provider'
import { useMe } from '@/context/me-provider'
import { useGroupOwner } from '@/lib/useGroupOwner'
import { useCategories } from '@/lib/useCategories'
import { 
  CheckCircle2Icon, 
  XCircleIcon, 
  RotateCwIcon,
  ClockIcon,
  FileTextIcon,
  CopyIcon,
  ArrowLeftIcon
} from 'lucide-react'
import { toast } from 'sonner'

// 🟢 제출 상태 ('SUBMITTED' | 'NOT_SUBMITTED')
interface ProblemStatus {
  problemId: string
  status: 'SUBMITTED' | 'NOT_SUBMITTED'
  submittedAt?: string
  deadline: string 
}

interface StudentRow {
  id: string
  name: string
  studentId: string
  role: 'AUDITOR' | 'STUDENT' | 'TA'
  ip?: string
  isIpSuspicious?: boolean
  problems: ProblemStatus[]
}

function SubmissionStatusContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { me } = useMe()
  const { group } = useGroup()
  const { problem } = useProblem()
  const { categories } = useCategories(group?.group_id ?? null)
  const isOwner = useGroupOwner()

  const problemIdParam = searchParams.get('problemId') || (problem ? String(problem.problem_id) : '1')

  const [problemList, setProblemList] = useState<any[]>([])
  const [studentList, setStudentList] = useState<StudentRow[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // 카테고리 제목 + 문제지 제목 결합 (예: 'test-01')
  const category = categories?.find((c) => c.category_id === problem?.category_id)
  const combinedProblemTitle = category && problem 
    ? `${category.title}-${problem.title}` 
    : problem?.title ?? '문제 현황'

  const fetchStatusData = async () => {
    setIsLoading(true)
    try {
      // 1. 문제지 정보 가져오기
      const problemRes = await fetch(`/api/problem/${problemIdParam}`)
      if (!problemRes.ok) throw new Error('문제 정보를 불러오지 못했습니다.')
      const problemData = await problemRes.json()

      const formatDeadline = (isoString: string) => {
        if (!isoString) return '기한 없음'

        const utcStr = typeof isoString === 'string' && !isoString.endsWith('Z') && !isoString.includes('+')
          ? `${isoString}Z`
          : isoString

        return new Date(utcStr).toLocaleString('ko-KR', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
      }
      const deadlineStr = formatDeadline(problemData.deadline)

      // 2. 소문제 목록 가져오기
      const questionsRes = await fetch(`/api/question/problem/${problemIdParam}`)
      const questionsData = await questionsRes.json()

      // q.question_id를 순수 고유 DB PK ID로 지정
      const formattedQuestions = questionsData.map((q: any) => ({
        id: String(q.question_id || q.id),
        title: q.title || `문제 ${q.question_id || q.id}`,
        deadline: deadlineStr,
      }))
      setProblemList(formattedQuestions)

      const studentsMap = new Map<string, StudentRow>()

      // 3. 그룹 수강생 전체 목록 초기화
      if (group?.group_id) {
        try {
          const groupStudentsRes = await fetch(`/api/group/${group.group_id}/students`)
          if (groupStudentsRes.ok) {
            const groupStudents = await groupStudentsRes.json()
            groupStudents.forEach((st: any) => {
              const primaryId = String(st.user_id || st.userId || st.id || st.username)
              
              // 🟢 실명 / 학번 필드 보완 처리
              const displayName = st.name || st.user?.name || st.username || '학생'
              const displayStudentNo = st.student_no || st.studentId || st.user?.student_no || primaryId

              studentsMap.set(primaryId, {
                id: primaryId,
                name: displayName,
                studentId: displayStudentNo,
                role: 'STUDENT',
                ip: undefined,
                isIpSuspicious: false,
                problems: formattedQuestions.map((mq: { id: string }) => ({
                  problemId: mq.id,
                  status: 'NOT_SUBMITTED',
                  deadline: deadlineStr,
                })),
              })
            })
          }
        } catch (e) {
          console.warn('그룹 수강생 목록 불러오기 실패:', e)
        }
      }

      // 4. 소문제별 시도/제출 기록 매핑
      for (const q of formattedQuestions) {
        const attemptsRes = await fetch(`/api/question/${q.id}/attempts`)
        if (!attemptsRes.ok) continue

        const attemptsData = await attemptsRes.json()

        attemptsData.forEach((att: any) => {
          const attUserId = String(att.user_id || att.userId || '')
          const attUsername = String(att.name || att.username || att.user?.name || '')
          const attStudentNo = String(att.student_no || att.studentId || att.user?.student_no || '')

          // 학생 찾기 (ID / 이름 / 학번 유연 교차 매칭)
          let studentEntry: StudentRow | undefined = undefined

          for (const [k, v] of studentsMap.entries()) {
            if (
              (attUserId && (k === attUserId || v.id === attUserId)) ||
              (attUsername && (v.name === attUsername || k === attUsername)) ||
              (attStudentNo && v.studentId === attStudentNo)
            ) {
              studentEntry = v
              break
            }
          }

          if (!studentEntry) {
            const newKey = attUserId || attUsername || attStudentNo
            studentEntry = {
              id: newKey,
              name: attUsername || '학생',
              studentId: attStudentNo || newKey,
              role: 'STUDENT',
              ip: att.ip || undefined,
              isIpSuspicious: false,
              problems: formattedQuestions.map((mq: { id: string }) => ({
                problemId: mq.id,
                status: 'NOT_SUBMITTED',
                deadline: deadlineStr,
              })),
            }
            studentsMap.set(newKey, studentEntry)
          }

          // 이름과 학번 정보가 초기화 시점에 아이디로 기본 설정되어 있었다면 실데이터로 보완
          if (attUsername && (studentEntry.name === '학생' || studentEntry.name === studentEntry.id)) {
            studentEntry.name = attUsername
          }
          if (attStudentNo && studentEntry.studentId === studentEntry.id) {
            studentEntry.studentId = attStudentNo
          }

          // 소문제(q.id)의 제출 여부를 problemId로 매칭
          const probEntry = studentEntry.problems.find((p) => String(p.problemId) === String(q.id))
          if (probEntry) {
            const submissionTime = att.last_submitted_at || att.updated_at || att.submitted_at || att.created_at
            const attemptsCount = Number(att.attempts_count || 0)

            if (attemptsCount > 0 || !!submissionTime) {
              probEntry.status = 'SUBMITTED'
              if (submissionTime) {
                probEntry.submittedAt = formatDeadline(submissionTime)
              }
            }
          }
        })
      }

      setStudentList(Array.from(studentsMap.values()))
    } catch (error) {
      console.error(error)
      toast.error('현황 데이터를 불러오는데 실패했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchStatusData()
  }, [problemIdParam])

  // 🟢 수치 집계: 모든 소문제를 다 풀었을 때만 '완료 인원'으로 간주
  const totalStudentsCount = studentList.length
  
  const fullySubmittedStudentsCount = studentList.filter((s) =>
    s.problems.length > 0 && s.problems.every((p) => p.status === 'SUBMITTED')
  ).length

  const notSubmittedStudentsCount = totalStudentsCount - fullySubmittedStudentsCount

  // 셀 렌더링 (제출 완료: 초록 아이콘 / 미제출: 빨간색 아이콘 및 경고 배경)
  const renderStatusCell = (prob: ProblemStatus) => {
    const isNotSubmitted = prob.status === 'NOT_SUBMITTED'

    return (
      <td key={prob.problemId} className={`py-4 px-4 text-center ${isNotSubmitted ? 'bg-rose-50/70' : ''}`}>
        <div className="group relative inline-block">
          {prob.status === 'SUBMITTED' ? (
            <CheckCircle2Icon className="size-5 text-emerald-500 mx-auto" />
          ) : (
            <XCircleIcon className="size-5 text-rose-500 mx-auto" />
          )}
          
          {prob.submittedAt && (
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:flex items-center gap-1 whitespace-nowrap text-white text-[10px] px-2 py-1 rounded shadow-md z-10 bg-slate-900">
              <ClockIcon className="size-3" /> 
              {prob.submittedAt}
            </span>
          )}
        </div>
      </td>
    )
  }

  if (isLoading) return <div className="p-12"><Skeleton className="h-[600px] w-full" /></div>

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <Header user={me} />

      {/* 브레드크럼 */}
      <header className="w-full bg-white border-b border-slate-100 px-6 py-3 flex items-center gap-3 text-xs text-slate-500">
        <button
          onClick={() => router.back()}
          className="size-8 rounded-lg border border-slate-300 flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors shadow-2xs"
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
          <span className="font-bold text-slate-800">제출 현황</span>
        </div>
      </header>

      {/* 본문 */}
      <main className="p-8 max-w-[1400px] mx-auto space-y-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{combinedProblemTitle} - 제출 현황</h1>

        {/* 요약 카드 영역 */}
        <div className="flex gap-3">
          <div className="flex-1 rounded-xl border border-slate-200 bg-slate-100/50 px-4 py-3 text-center shadow-2xs">
            <p className="text-xs text-slate-500 font-medium">전체 인원</p>
            <p className="text-2xl font-extrabold text-slate-800">{totalStudentsCount}<span className="text-sm font-medium">명</span></p>
          </div>

          <div className="flex-1 rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3 text-center shadow-2xs">
            <p className="text-xs text-emerald-700 font-medium">완료 인원</p>
            <p className="text-2xl font-extrabold text-emerald-700">{fullySubmittedStudentsCount}<span className="text-sm font-medium">명</span></p>
          </div>

          <div className="flex-1 rounded-xl border border-rose-200 bg-rose-50/50 px-4 py-3 text-center shadow-2xs">
            <p className="text-xs text-rose-600 font-medium">미완료 인원</p>
            <p className="text-2xl font-extrabold text-rose-600">{notSubmittedStudentsCount}<span className="text-sm font-medium">명</span></p>
          </div>
        </div>

        {/* 범례 및 새로고침 */}
        <div className="flex justify-between items-center pt-2">
          <div className="flex items-center gap-5 text-xs text-slate-600 font-medium">
            <span className="flex items-center gap-1.5"><CheckCircle2Icon className="size-4 text-emerald-500" /> 제출 완료</span>
            <span className="flex items-center gap-1.5"><XCircleIcon className="size-4 text-rose-500" /> 미제출</span>
          </div>
        </div>

        {/* 데이터 테이블 영역 */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white">
            <h2 className="font-semibold text-slate-800 text-sm">학생별 문제 풀이 현황</h2>
            
            <Button 
              variant="outline" 
              size="icon" 
              onClick={fetchStatusData}
              className="size-8 text-slate-500 hover:text-slate-700 bg-white"
            >
              <RotateCwIcon className="size-4" />
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-3 px-6 font-semibold w-48">이름</th>
                  <th className="py-3 px-6 font-semibold w-36">학번</th>
                  {problemList.map((p) => (
                    <th key={p.id} className="py-3 px-4 font-semibold text-center">
                      <div className="text-slate-800">{p.title}</div>
                    </th>
                  ))}
                  <th className="py-3 px-4 font-semibold text-center text-emerald-600">제출 완료</th>
                  <th className="py-3 px-4 font-semibold text-center text-rose-500">미제출</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {studentList.map((student) => {
                  const submittedCount = student.problems.filter((p) => p.status === 'SUBMITTED').length
                  const notSubmittedCount = student.problems.filter((p) => p.status === 'NOT_SUBMITTED').length

                  return (
                    <tr key={student.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-4 px-6 font-medium text-slate-800">
                        <div className="flex items-center gap-1.5">
                          <span>{student.name}</span>
                          <CopyIcon className="size-3 text-slate-400 cursor-pointer hover:text-slate-600" />
                        </div>
                        {student.ip && <div className="text-[10px] text-slate-400 mt-0.5">IP: {student.ip}</div>}
                      </td>
                      <td className="py-4 px-6 text-slate-600 font-mono">{student.studentId}</td>

                      {/* 소문제별 상태 셀 */}
                      {student.problems.map((prob) => renderStatusCell(prob))}

                      <td className="py-4 px-4 text-center font-bold text-emerald-600">{submittedCount}</td>
                      <td className="py-4 px-4 text-center font-bold text-rose-500">{notSubmittedCount}</td>
                    </tr>
                  )
                })}
                
                {studentList.length === 0 && (
                  <tr>
                    <td colSpan={4 + problemList.length} className="py-8 text-center text-slate-500">
                      현황 데이터가 존재하지 않습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}

export default function SubmissionStatusPage() {
  return (
    <Suspense fallback={<Skeleton className="h-20 w-full" />}>
      <GroupProvider>
        <ProblemProvider>
          <SubmissionStatusContent />
        </ProblemProvider>
      </GroupProvider>
    </Suspense>
  )
}