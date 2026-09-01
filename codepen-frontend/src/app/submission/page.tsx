// 'use client'

// import React, { Suspense, useState, useEffect, useCallback } from 'react'
// import { useRouter, useSearchParams } from 'next/navigation'
// import { toast } from 'sonner'
// import { ArrowLeftIcon, RotateCwIcon, CheckIcon } from 'lucide-react'

// import { Header } from '@/components/header'
// import { GroupProvider, useGroup } from '@/context/group-provider'
// import { ProblemProvider, useProblem } from '@/context/problem-provider'
// import { useMe } from '@/context/me-provider'
// import { useCategories } from '@/lib/useCategories'
// import { Skeleton } from '@/components/ui/skeleton'
// import { Button } from '@/components/ui/button'

// interface QuestionItem {
//   id: string
//   title: string
//   maxScore: number
// }

// interface QuestionScore {
//   questionId: string
//   submissionId?: number | string | null
//   aiScore?: number | null
//   professorScore?: number | null
//   submitted: boolean
// }

// interface StudentSubmissionRow {
//   userId: string
//   name: string
//   studentId: string
//   status: string
//   scores: Record<string, QuestionScore>
// }

// function SubmissionTableContent() {
//   const router = useRouter()
//   const searchParams = useSearchParams()
//   const { me } = useMe()
//   const { group } = useGroup()
//   const { problem } = useProblem()
//   const { categories } = useCategories(group?.group_id ?? null)

//   const problemIdParam = searchParams.get('problemId') || (problem ? String(problem.problem_id) : '')

//   const [questions, setQuestions] = useState<QuestionItem[]>([])
//   const [students, setStudents] = useState<StudentSubmissionRow[]>([])
//   const [isLoading, setIsLoading] = useState(true)

//   const category = categories?.find((c) => c.category_id === problem?.category_id)
//   const combinedProblemTitle = category && problem 
//     ? `${category.title}-${problem.title}` 
//     : problem?.title ?? '과제 제출 채점'

//   const totalMaxScore = questions.reduce((acc, q) => acc + (q.maxScore || 0), 0)

//   const attemptsMapHasKey = (map: Map<string, StudentSubmissionRow>, key: string) => {
//     if (!key) return false
//     for (const [k, v] of map.entries()) {
//       if (k === key || v.userId === key || v.name === key || v.studentId === key) return true
//     }
//     return false
//   }

//   const findStudentInMap = (map: Map<string, StudentSubmissionRow>, key: string) => {
//     if (!key) return undefined
//     for (const [k, v] of map.entries()) {
//       if (k === key || v.userId === key || v.name === key || v.studentId === key) return v
//     }
//     return undefined
//   }

//   const fetchData = useCallback(async () => {
//     if (!problemIdParam) {
//       setIsLoading(false)
//       return
//     }
//     setIsLoading(true)

//     try {
//       let qData: any = null
//       const qRes = await fetch(`/api/question/problem/${problemIdParam}`)
      
//       if (qRes.ok) {
//         const ct = qRes.headers.get('content-type')
//         if (ct && ct.includes('application/json')) {
//           qData = await qRes.json()
//         }
//       }

//       if (!qData) {
//         const qResFallback = await fetch(`/api/question?problem_id=${problemIdParam}`)
//         if (qResFallback.ok) {
//           const ct = qResFallback.headers.get('content-type')
//           if (ct && ct.includes('application/json')) {
//             qData = await qResFallback.json()
//           }
//         }
//       }

//       const formattedQuestions: QuestionItem[] = Array.isArray(qData)
//         ? qData.map((q: any, idx: number) => ({
//             id: String(q.question_id ?? q.id ?? idx + 1),
//             title: q.title !== undefined && q.title !== null ? String(q.title) : `문제 ${idx + 1}`,
//             maxScore: Number(q.score) || 10,
//           }))
//         : []

//       setQuestions(formattedQuestions)

//       const studentsMap = new Map<string, StudentSubmissionRow>()

//       if (group?.group_id) {
//         try {
//           const groupStudentsRes = await fetch(`/api/group/${group.group_id}/students`)
//           if (groupStudentsRes.ok) {
//             const ct = groupStudentsRes.headers.get('content-type')
//             if (ct && ct.includes('application/json')) {
//               const groupStudents = await groupStudentsRes.json()
//               const studentList = Array.isArray(groupStudents) ? groupStudents : groupStudents.students
//               if (Array.isArray(studentList)) {
//                 studentList.forEach((st: any) => {
//                   const primaryId = String(st.user_id || st.userId || st.id || st.username)
//                   const displayName = st.username || st.name || st.user?.name || '학생'
//                   const displayStudentNo = st.student_no || st.studentId || primaryId

//                   studentsMap.set(primaryId, {
//                     userId: primaryId,
//                     name: displayName,
//                     studentId: displayStudentNo,
//                     status: '대기',
//                     scores: {}
//                   })
//                 })
//               }
//             }
//           }
//         } catch (e) {
//           console.warn('수강생 목록 조회 실패:', e)
//         }
//       }

//       for (const q of formattedQuestions) {
//         try {
//           const attemptsRes = await fetch(`/api/question/${q.id}/attempts`)
//           if (!attemptsRes.ok) continue
          
//           const ct = attemptsRes.headers.get('content-type')
//           if (!ct || !ct.includes('application/json')) continue

//           const rawAttemptsData = await attemptsRes.json()
//           const attemptsData = Array.isArray(rawAttemptsData) 
//             ? rawAttemptsData 
//             : rawAttemptsData.attempts || []

//           if (Array.isArray(attemptsData)) {
//             attemptsData.forEach((att: any) => {
//               if (!att) return
              
//               const attUserId = String(att.user_id || att.userId || att.user?.id || '')
//               const attUsername = String(att.username || att.name || att.user?.name || '')
//               const attStudentNo = String(att.student_no || att.studentId || att.user?.student_no || '')

//               let studentEntry: StudentSubmissionRow | undefined = undefined

//               if (attemptsMapHasKey(studentsMap, attUserId)) {
//                 studentEntry = findStudentInMap(studentsMap, attUserId)
//               } else if (attemptsMapHasKey(studentsMap, attUsername)) {
//                 studentEntry = findStudentInMap(studentsMap, attUsername)
//               } else if (attemptsMapHasKey(studentsMap, attStudentNo)) {
//                 studentEntry = findStudentInMap(studentsMap, attStudentNo)
//               }

//               if (!studentEntry) {
//                 const newKey = attUserId || attUsername || attStudentNo
//                 studentEntry = {
//                   userId: newKey,
//                   name: attUsername || '알 수 없음',
//                   studentId: attStudentNo || newKey,
//                   status: att.status || '대기',
//                   scores: {}
//                 }
//                 studentsMap.set(newKey, studentEntry)
//               }

//               if (attUsername && (studentEntry.name === '학생' || studentEntry.name === '알 수 없음')) {
//                 studentEntry.name = attUsername
//               }
//               if (attStudentNo && studentEntry.studentId === studentEntry.userId) {
//                 studentEntry.studentId = attStudentNo
//               }

//               const subId = att.submission_id || att.submissionId || att.attempt_id || att.id || null
//               const attemptsCount = Number(att.attempts_count ?? att.attempts ?? 0)
//               const hasSubmissionTime = !!(att.last_submitted_at || att.submitted_at || att.created_at || att.updated_at)
//               const isSubmitted = attemptsCount > 0 || hasSubmissionTime || !!att.codepen_url

//               if (isSubmitted) {
//                 studentEntry.scores[q.id] = {
//                   questionId: q.id,
//                   submissionId: subId,
//                   aiScore: att.ai_score ?? null,
//                   // 🟢 백엔드 필드명(professor_score / score)을 확실하게 매핑
//                   professorScore: att.professor_score ?? att.score ?? null,
//                   submitted: true
//                 }
//               }
//             })
//           }
//         } catch (e) {
//           console.error(`Question ${q.id} attempts fetch error:`, e)
//         }
//       }

//       setStudents(Array.from(studentsMap.values()))
//     } catch (err) {
//       console.error(err)
//       toast.error('채점 데이터를 불러오는데 실패했습니다.')
//     } finally {
//       setIsLoading(false)
//     }
//   }, [problemIdParam, group?.group_id])

//   useEffect(() => {
//     fetchData()

//     const handleFocus = () => {
//       fetchData()
//     }

//     window.addEventListener('focus', handleFocus)
//     return () => {
//       window.removeEventListener('focus', handleFocus)
//     }
//   }, [fetchData])

//   const calculateTotalProfScore = (student: StudentSubmissionRow) => {
//     let sum = 0
//     if (student?.scores) {
//       Object.values(student.scores).forEach((s) => {
//         if (s?.professorScore !== null && s?.professorScore !== undefined) {
//           sum += Number(s.professorScore) || 0
//         }
//       })
//     }
//     return sum.toFixed(1)
//   }

//   const isAllGraded = (student: StudentSubmissionRow) => {
//     if (!questions.length) return false
//     return questions.every((q) => {
//       const qScore = student.scores?.[q.id]
//       return qScore?.professorScore !== null && qScore?.professorScore !== undefined
//     })
//   }

//   const getScoreColorClass = (score: number | null | undefined) => {
//     if (score === null || score === undefined) return 'text-slate-400'
//     if (score >= 9) return 'text-emerald-600 font-bold'
//     if (score >= 5) return 'text-amber-500 font-bold'
//     return 'text-rose-500 font-bold'
//   }

//   return (
//     <div className="min-h-screen bg-[#f8fafc] flex flex-col">
//       <Header user={me} />

//       <header className="w-full bg-white border-b border-slate-200/80 px-6 py-3 flex items-center gap-3 text-xs text-slate-500">
//         <button
//           onClick={() => router.back()}
//           className="size-8 rounded-lg border border-slate-300 flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors shadow-2xs"
//           title="뒤로 가기"
//         >
//           <ArrowLeftIcon className="size-4" />
//         </button>

//         <div className="flex items-center gap-2">
//           <span className="cursor-pointer hover:underline hover:text-slate-700" onClick={() => router.push('/groups')}>
//             나의 그룹들
//           </span>
//           {group && (
//             <>
//               <span>&gt;</span>
//               <span className="cursor-pointer hover:underline hover:text-slate-700 flex items-center gap-1" onClick={() => router.push(`/problem?groupId=${group.group_id}`)}>
//                 📚 {group.group_name}
//               </span>
//             </>
//           )}
//           {problem && (
//             <>
//               <span>&gt;</span>
//               <span className="cursor-pointer hover:underline hover:text-slate-700" onClick={() => router.push(`/problem/${problem.problem_id}?groupId=${group?.group_id}`)}>
//                 📄 {combinedProblemTitle}
//               </span>
//             </>
//           )}
//           <span>&gt;</span>
//           <span className="font-bold text-slate-800">채점 테이블</span>
//         </div>
//       </header>

//       <main className="max-w-[1440px] w-full mx-auto p-6 space-y-4">
//         <div className="flex items-center justify-between">
//           <h1 className="text-xl font-bold text-slate-900 tracking-tight">학생 제출물 채점</h1>
//           <div className="flex items-center gap-4 text-xs font-medium text-slate-600">
//             <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-emerald-500 inline-block" /> 10-9점</span>
//             <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-amber-400 inline-block" /> 5-8점</span>
//             <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-rose-500 inline-block" /> 0-4점</span>
//           </div>
//         </div>

//         <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs overflow-hidden">
//           <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white">
//             <h2 className="font-bold text-slate-800 text-sm">채점 테이블</h2>
//             <Button variant="outline" size="sm" onClick={fetchData} className="h-8 gap-1.5 text-xs text-slate-600 bg-white">
//               <RotateCwIcon className="size-3.5" /> 새로고침
//             </Button>
//           </div>

//           {isLoading ? (
//             <div className="p-12"><Skeleton className="h-[400px] w-full rounded-xl" /></div>
//           ) : (
//             <div className="overflow-x-auto">
//               <table className="w-full text-left text-xs border-collapse">
//                 <thead className="bg-slate-50/70 border-b border-slate-200 text-slate-600 font-semibold">
//                   <tr>
//                     <th className="py-3 px-6 w-28">이름</th>
//                     <th className="py-3 px-6 w-32">학번</th>
//                     <th className="py-3 px-6 text-center w-36">
//                       총점
//                     </th>

//                     {questions.map((q, idx) => (
//                       <th key={q.id} className="py-3 px-4 text-center">
//                         <div className="font-bold text-slate-800">문제 {idx + 1}</div>
//                         <div className="text-[11px] text-slate-500">{q.title}</div>
//                         <div className="text-[10px] text-slate-400 font-normal">(배점: {q.maxScore}점)</div>
//                       </th>
//                     ))}

//                     <th className="py-3 px-6 text-center w-24">상태</th>
//                   </tr>
//                 </thead>

//                 <tbody className="divide-y divide-slate-100">
//                   {students.map((student) => {
//                     const profTotal = calculateTotalProfScore(student)
//                     const completed = isAllGraded(student) || student.status === '완료'

//                     return (
//                       <tr 
//                         key={student.userId} 
//                         className="h-16 hover:bg-slate-50/50 transition-colors"
//                       >
//                         <td className="py-4 px-6 font-bold text-slate-800">{student.name}</td>
//                         <td className="py-4 px-6 font-mono text-slate-600">{student.studentId}</td>
                        
//                         <td className="py-4 px-6 text-center">
//                           <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-indigo-50/80 border border-indigo-100 text-indigo-700 font-extrabold text-xs">
//                             {profTotal} <span className="text-slate-400 font-normal">/ {totalMaxScore}</span>
//                           </span>
//                         </td>

//                         {questions.map((q) => {
//                           const qScore = student.scores?.[q.id]
//                           const isSubmitted = qScore?.submitted === true
//                           const profScore = qScore?.professorScore
//                           const submissionId = qScore?.submissionId
//                           const hasScore = profScore !== null && profScore !== undefined

//                           return (
//                             <td 
//                               key={q.id} 
//                               className="py-4 px-4 text-center font-mono cursor-pointer hover:bg-indigo-50/50 transition-colors"
//                               onClick={() => {
//                                 if (isSubmitted) {
//                                   const targetPath = submissionId && !isNaN(Number(submissionId))
//                                     ? `/submission/${submissionId}?groupId=${group?.group_id}&problemId=${problemIdParam}&questionId=${q.id}&userId=${student.userId}`
//                                     : `/submission/detail?questionId=${q.id}&userId=${student.userId}&groupId=${group?.group_id}&problemId=${problemIdParam}`
                                  
//                                   router.push(targetPath)
//                                 } else {
//                                   toast.error('학생의 제출물이 존재하지 않습니다.')
//                                 }
//                               }}
//                               title={isSubmitted ? `${student.name} 학생의 ${q.title} 제출물 확인` : '미제출 항목'}
//                             >
//                               {isSubmitted ? (
//                                 <div className="inline-flex items-center justify-center gap-1 px-2 py-1 rounded bg-slate-50 hover:bg-white border border-slate-200/60 shadow-2xs transition-colors min-w-[60px]">
//                                   <span className={getScoreColorClass(profScore)}>
//                                     {hasScore ? profScore : '-'}
//                                   </span>
//                                   <span className="text-slate-300 font-normal">/</span>
//                                   <span className="text-slate-500 font-medium">{q.maxScore}</span>
//                                 </div>
//                               ) : (
//                                 <span className="text-slate-300 font-normal">-</span>
//                               )}
//                             </td>
//                           )
//                         })}

//                         <td className="py-4 px-6 text-center">
//                           <div className="flex flex-col items-center justify-center gap-1">
//                             {completed ? (
//                               <>
//                                 <span className="size-6 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-2xs">
//                                   <CheckIcon className="size-3.5 stroke-[3]" />
//                                 </span>
//                                 <span className="text-[10px] font-bold text-emerald-600">완료</span>
//                               </>
//                             ) : (
//                               <>
//                                 <span className="size-6 rounded-full bg-slate-200 inline-block" />
//                                 <span className="text-[10px] text-slate-500">대기</span>
//                               </>
//                             )}
//                           </div>
//                         </td>
//                       </tr>
//                     )
//                   })}

//                   {students.length === 0 && (
//                     <tr>
//                       <td colSpan={4 + questions.length} className="py-12 text-center text-slate-400">
//                         등록된 채점 데이터가 없습니다.
//                       </td>
//                     </tr>
//                   )}
//                 </tbody>
//               </table>
//             </div>
//           )}
//         </div>
//       </main>
//     </div>
//   )
// }

// export default function SubmissionTablePage() {
//   return (
//     <Suspense fallback={<Skeleton className="h-screen w-full" />}>
//       <GroupProvider>
//         <ProblemProvider>
//           <SubmissionTableContent />
//         </ProblemProvider>
//       </GroupProvider>
//     </Suspense>
//   )
// }

'use client'

import React, { Suspense, useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeftIcon, RotateCwIcon, CheckIcon, ExternalLinkIcon, CopyIcon } from 'lucide-react'

import { Header } from '@/components/header'
import { GroupProvider, useGroup } from '@/context/group-provider'
import { ProblemProvider, useProblem } from '@/context/problem-provider'
import { useMe } from '@/context/me-provider'
import { useCategories } from '@/lib/useCategories'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'

interface QuestionItem {
  id: string
  title: string
  maxScore: number
}

interface QuestionScore {
  questionId: string
  submissionId?: number | string | null
  aiScore?: number | null
  professorScore?: number | null
  submitted: boolean
  codepenUrl?: string | null // 🟢 [추가] 개별 문제 제출물의 CodePen 링크
}

interface StudentSubmissionRow {
  userId: string
  name: string
  studentId: string
  status: string
  scores: Record<string, QuestionScore>
}

function SubmissionTableContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { me } = useMe()
  const { group } = useGroup()
  const { problem } = useProblem()
  const { categories } = useCategories(group?.group_id ?? null)

  const problemIdParam = searchParams.get('problemId') || (problem ? String(problem.problem_id) : '')

  const [questions, setQuestions] = useState<QuestionItem[]>([])
  const [students, setStudents] = useState<StudentSubmissionRow[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const category = categories?.find((c) => c.category_id === problem?.category_id)
  const combinedProblemTitle = category && problem 
    ? `${category.title}-${problem.title}` 
    : problem?.title ?? '과제 제출 채점'

  const totalMaxScore = questions.reduce((acc, q) => acc + (q.maxScore || 0), 0)

  const attemptsMapHasKey = (map: Map<string, StudentSubmissionRow>, key: string) => {
    if (!key) return false
    for (const [k, v] of map.entries()) {
      if (k === key || v.userId === key || v.name === key || v.studentId === key) return true
    }
    return false
  }

  const findStudentInMap = (map: Map<string, StudentSubmissionRow>, key: string) => {
    if (!key) return undefined
    for (const [k, v] of map.entries()) {
      if (k === key || v.userId === key || v.name === key || v.studentId === key) return v
    }
    return undefined
  }

  const fetchData = useCallback(async () => {
    if (!problemIdParam) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)

    try {
      let qData: any = null
      const qRes = await fetch(`/api/question/problem/${problemIdParam}`)
      
      if (qRes.ok) {
        const ct = qRes.headers.get('content-type')
        if (ct && ct.includes('application/json')) {
          qData = await qRes.json()
        }
      }

      if (!qData) {
        const qResFallback = await fetch(`/api/question?problem_id=${problemIdParam}`)
        if (qResFallback.ok) {
          const ct = qResFallback.headers.get('content-type')
          if (ct && ct.includes('application/json')) {
            qData = await qResFallback.json()
          }
        }
      }

      const formattedQuestions: QuestionItem[] = Array.isArray(qData)
        ? qData.map((q: any, idx: number) => ({
            id: String(q.question_id ?? q.id ?? idx + 1),
            title: q.title !== undefined && q.title !== null ? String(q.title) : `문제 ${idx + 1}`,
            maxScore: Number(q.score) || 10,
          }))
        : []

      setQuestions(formattedQuestions)

      const studentsMap = new Map<string, StudentSubmissionRow>()

      if (group?.group_id) {
        try {
          const groupStudentsRes = await fetch(`/api/group/${group.group_id}/students`)
          if (groupStudentsRes.ok) {
            const ct = groupStudentsRes.headers.get('content-type')
            if (ct && ct.includes('application/json')) {
              const groupStudents = await groupStudentsRes.json()
              const studentList = Array.isArray(groupStudents) ? groupStudents : groupStudents.students
              if (Array.isArray(studentList)) {
                studentList.forEach((st: any) => {
                  const primaryId = String(st.user_id || st.userId || st.id || st.username)
                  const displayName = st.username || st.name || st.user?.name || '학생'
                  const displayStudentNo = st.student_no || st.studentId || primaryId

                  studentsMap.set(primaryId, {
                    userId: primaryId,
                    name: displayName,
                    studentId: displayStudentNo,
                    status: '대기',
                    scores: {}
                  })
                })
              }
            }
          }
        } catch (e) {
          console.warn('수강생 목록 조회 실패:', e)
        }
      }

      for (const q of formattedQuestions) {
        try {
          const attemptsRes = await fetch(`/api/question/${q.id}/attempts`)
          if (!attemptsRes.ok) continue
          
          const ct = attemptsRes.headers.get('content-type')
          if (!ct || !ct.includes('application/json')) continue

          const rawAttemptsData = await attemptsRes.json()
          const attemptsData = Array.isArray(rawAttemptsData) 
            ? rawAttemptsData 
            : rawAttemptsData.attempts || []

          if (Array.isArray(attemptsData)) {
            attemptsData.forEach((att: any) => {
              if (!att) return
              
              const attUserId = String(att.user_id || att.userId || att.user?.id || '')
              const attUsername = String(att.username || att.name || att.user?.name || '')
              const attStudentNo = String(att.student_no || att.studentId || att.user?.student_no || '')

              let studentEntry: StudentSubmissionRow | undefined = undefined

              if (attemptsMapHasKey(studentsMap, attUserId)) {
                studentEntry = findStudentInMap(studentsMap, attUserId)
              } else if (attemptsMapHasKey(studentsMap, attUsername)) {
                studentEntry = findStudentInMap(studentsMap, attUsername)
              } else if (attemptsMapHasKey(studentsMap, attStudentNo)) {
                studentEntry = findStudentInMap(studentsMap, attStudentNo)
              }

              if (!studentEntry) {
                const newKey = attUserId || attUsername || attStudentNo
                studentEntry = {
                  userId: newKey,
                  name: attUsername || '알 수 없음',
                  studentId: attStudentNo || newKey,
                  status: att.status || '대기',
                  scores: {}
                }
                studentsMap.set(newKey, studentEntry)
              }

              if (attUsername && (studentEntry.name === '학생' || studentEntry.name === '알 수 없음')) {
                studentEntry.name = attUsername
              }
              if (attStudentNo && studentEntry.studentId === studentEntry.userId) {
                studentEntry.studentId = attStudentNo
              }

              const subId = att.submission_id || att.submissionId || att.attempt_id || att.id || null
              const attemptsCount = Number(att.attempts_count ?? att.attempts ?? 0)
              const hasSubmissionTime = !!(att.last_submitted_at || att.submitted_at || att.created_at || att.updated_at)
              const isSubmitted = attemptsCount > 0 || hasSubmissionTime || !!att.codepen_url

              if (isSubmitted) {
                studentEntry.scores[q.id] = {
                  questionId: q.id,
                  submissionId: subId,
                  aiScore: att.ai_score ?? null,
                  // 🟢 백엔드 필드명(professor_score / score)을 확실하게 매핑
                  professorScore: att.professor_score ?? att.score ?? null,
                  submitted: true,
                  codepenUrl: att.codepen_url ?? null, // 🟢 [추가] CodePen 링크 저장
                }
              }
            })
          }
        } catch (e) {
          console.error(`Question ${q.id} attempts fetch error:`, e)
        }
      }

      setStudents(Array.from(studentsMap.values()))
    } catch (err) {
      console.error(err)
      toast.error('채점 데이터를 불러오는데 실패했습니다.')
    } finally {
      setIsLoading(false)
    }
  }, [problemIdParam, group?.group_id])

  useEffect(() => {
    fetchData()

    const handleFocus = () => {
      fetchData()
    }

    window.addEventListener('focus', handleFocus)
    return () => {
      window.removeEventListener('focus', handleFocus)
    }
  }, [fetchData])

  const calculateTotalProfScore = (student: StudentSubmissionRow) => {
    let sum = 0
    if (student?.scores) {
      Object.values(student.scores).forEach((s) => {
        if (s?.professorScore !== null && s?.professorScore !== undefined) {
          sum += Number(s.professorScore) || 0
        }
      })
    }
    return sum.toFixed(1)
  }

  const isAllGraded = (student: StudentSubmissionRow) => {
    if (!questions.length) return false
    return questions.every((q) => {
      const qScore = student.scores?.[q.id]
      return qScore?.professorScore !== null && qScore?.professorScore !== undefined
    })
  }

  const getScoreColorClass = (score: number | null | undefined) => {
    if (score === null || score === undefined) return 'text-slate-400'
    if (score >= 9) return 'text-emerald-600 font-bold'
    if (score >= 5) return 'text-amber-500 font-bold'
    return 'text-rose-500 font-bold'
  }

  // 🟢 [추가] 이 문제에 제출된 모든 CodePen 링크를 한 번에 복사
  const handleCopyAllLinks = () => {
    const urls = new Set<string>()
    students.forEach((student) => {
      Object.values(student.scores).forEach((s) => {
        if (s.codepenUrl) urls.add(s.codepenUrl)
      })
    })

    if (urls.size === 0) {
      toast.error('복사할 CodePen 링크가 없습니다.')
      return
    }

    navigator.clipboard.writeText(Array.from(urls).join('\n'))
    toast.success(`CodePen 링크 ${urls.size}개를 복사했습니다.`)
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col">
      <Header user={me} />

      <header className="w-full bg-white border-b border-slate-200/80 px-6 py-3 flex items-center gap-3 text-xs text-slate-500">
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
              <span className="cursor-pointer hover:underline hover:text-slate-700" onClick={() => router.push(`/problem/${problem.problem_id}?groupId=${group?.group_id}`)}>
                📄 {combinedProblemTitle}
              </span>
            </>
          )}
          <span>&gt;</span>
          <span className="font-bold text-slate-800">채점 테이블</span>
        </div>
      </header>

      <main className="max-w-[1440px] w-full mx-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">학생 제출물 채점</h1>
          <div className="flex items-center gap-4 text-xs font-medium text-slate-600">
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-emerald-500 inline-block" /> 10-9점</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-amber-400 inline-block" /> 5-8점</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-rose-500 inline-block" /> 0-4점</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white">
            <h2 className="font-bold text-slate-800 text-sm">채점 테이블</h2>
            <div className="flex items-center gap-2">
              {/* 🟢 [추가] 전체 CodePen 링크 복사 버튼 (Collection에 붙여넣기용) */}
              <Button variant="outline" size="sm" onClick={handleCopyAllLinks} className="h-8 gap-1.5 text-xs text-slate-600 bg-white">
                <CopyIcon className="size-3.5" /> CodePen 링크 전체 복사
              </Button>
              <Button variant="outline" size="sm" onClick={fetchData} className="h-8 gap-1.5 text-xs text-slate-600 bg-white">
                <RotateCwIcon className="size-3.5" /> 새로고침
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="p-12"><Skeleton className="h-[400px] w-full rounded-xl" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50/70 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="py-3 px-6 w-28">이름</th>
                    <th className="py-3 px-6 w-32">학번</th>
                    <th className="py-3 px-6 text-center w-36">
                      총점
                    </th>

                    {questions.map((q, idx) => (
                      <th key={q.id} className="py-3 px-4 text-center">
                        <div className="font-bold text-slate-800">문제 {idx + 1}</div>
                        <div className="text-[11px] text-slate-500">{q.title}</div>
                        <div className="text-[10px] text-slate-400 font-normal">(배점: {q.maxScore}점)</div>
                      </th>
                    ))}

                    <th className="py-3 px-6 text-center w-24">상태</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {students.map((student) => {
                    const profTotal = calculateTotalProfScore(student)
                    const completed = isAllGraded(student) || student.status === '완료'

                    return (
                      <tr 
                        key={student.userId} 
                        className="h-16 hover:bg-slate-50/50 transition-colors"
                      >
                        <td className="py-4 px-6 font-bold text-slate-800">{student.name}</td>
                        <td className="py-4 px-6 font-mono text-slate-600">{student.studentId}</td>
                        
                        <td className="py-4 px-6 text-center">
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-indigo-50/80 border border-indigo-100 text-indigo-700 font-extrabold text-xs">
                            {profTotal} <span className="text-slate-400 font-normal">/ {totalMaxScore}</span>
                          </span>
                        </td>

                        {questions.map((q) => {
                          const qScore = student.scores?.[q.id]
                          const isSubmitted = qScore?.submitted === true
                          const profScore = qScore?.professorScore
                          const submissionId = qScore?.submissionId
                          const hasScore = profScore !== null && profScore !== undefined

                          return (
                            <td 
                              key={q.id} 
                              className="py-4 px-4 text-center font-mono cursor-pointer hover:bg-indigo-50/50 transition-colors"
                              onClick={() => {
                                if (isSubmitted) {
                                  const targetPath = submissionId && !isNaN(Number(submissionId))
                                    ? `/submission/${submissionId}?groupId=${group?.group_id}&problemId=${problemIdParam}&questionId=${q.id}&userId=${student.userId}`
                                    : `/submission/detail?questionId=${q.id}&userId=${student.userId}&groupId=${group?.group_id}&problemId=${problemIdParam}`
                                  
                                  router.push(targetPath)
                                } else {
                                  toast.error('학생의 제출물이 존재하지 않습니다.')
                                }
                              }}
                              title={isSubmitted ? `${student.name} 학생의 ${q.title} 제출물 확인` : '미제출 항목'}
                            >
                              {isSubmitted ? (
                                <div className="inline-flex items-center justify-center gap-1 px-2 py-1 rounded bg-slate-50 hover:bg-white border border-slate-200/60 shadow-2xs transition-colors min-w-[60px]">
                                  <span className={getScoreColorClass(profScore)}>
                                    {hasScore ? profScore : '-'}
                                  </span>
                                  <span className="text-slate-300 font-normal">/</span>
                                  <span className="text-slate-500 font-medium">{q.maxScore}</span>
                                  {/* 🟢 [추가] CodePen 바로 열기 아이콘 */}
                                  {qScore?.codepenUrl && (
                                    <a
                                      href={qScore.codepenUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      title="CodePen에서 열기"
                                      className="text-slate-400 hover:text-indigo-600 ml-0.5"
                                    >
                                      <ExternalLinkIcon className="size-3" />
                                    </a>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-300 font-normal">-</span>
                              )}
                            </td>
                          )
                        })}

                        <td className="py-4 px-6 text-center">
                          <div className="flex flex-col items-center justify-center gap-1">
                            {completed ? (
                              <>
                                <span className="size-6 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-2xs">
                                  <CheckIcon className="size-3.5 stroke-[3]" />
                                </span>
                                <span className="text-[10px] font-bold text-emerald-600">완료</span>
                              </>
                            ) : (
                              <>
                                <span className="size-6 rounded-full bg-slate-200 inline-block" />
                                <span className="text-[10px] text-slate-500">대기</span>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}

                  {students.length === 0 && (
                    <tr>
                      <td colSpan={4 + questions.length} className="py-12 text-center text-slate-400">
                        등록된 채점 데이터가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default function SubmissionTablePage() {
  return (
    <Suspense fallback={<Skeleton className="h-screen w-full" />}>
      <GroupProvider>
        <ProblemProvider>
          <SubmissionTableContent />
        </ProblemProvider>
      </GroupProvider>
    </Suspense>
  )
}
