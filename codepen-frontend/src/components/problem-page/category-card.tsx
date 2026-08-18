'use client'

import { useRouter } from 'next/navigation'
import { Trash2Icon, CalendarIcon, ClockIcon } from 'lucide-react'
import type { Category, Problem } from '@/types/problem-view'

interface CategoryCardProps {
  category: Category
  problems: Problem[]
  isOwner: boolean
  isExpanded: boolean
  groupId: number
  onToggle: () => void
  onDeleteCategory: (e: React.MouseEvent) => void
  onDeleteProblem: (e: React.MouseEvent, problemId: string) => void
}

// 문제지 카드 하나 (날짜/제출시간 박스는 일반/시험 공통)
function ProblemRow ({ p, isOwner, isExam, onClick, onDelete }: {
  p: Problem
  isOwner: boolean
  isExam: boolean
  onClick: () => void
  onDelete: (e: React.MouseEvent) => void
}) {
  return (
    <div
      onClick={onClick}
      className={`p-3 bg-white space-y-1.5 rounded-xl border shadow-2xs cursor-pointer transition-colors ${
        isExam
          ? 'border-rose-100/50 hover:border-rose-200 hover:bg-rose-50/20'
          : 'border-slate-100 mt-2 hover:border-emerald-200 hover:bg-emerald-50/30'
      }`}
    >
      <div className='flex justify-between items-start'>
        <h4 className='font-bold text-xs text-slate-800'>{p.title}</h4>
        {isOwner && (
          <button onClick={onDelete} className='text-slate-400 hover:text-rose-600 p-0.5'>
            <Trash2Icon className='size-3.5' />
          </button>
        )}
      </div>
      <p className='text-[11px] text-slate-400'>생성일 · {p.createdAt} | 문항수 · {p.questionCount}개</p>
      {isExam && p.description && (
        <p className='text-[11px] text-slate-500 mt-1'>문제지 설명 : {p.description}</p>
      )}
      {p.dateStr && (
        <div className={`rounded-lg p-2 text-[11px] space-y-0.5 font-medium border ${
          isExam ? 'bg-[#fff5f5] text-[#c62828] border-rose-100/60' : 'bg-[#f1f8f2] text-[#2e7d32] border-emerald-100/60'
        }`}>
          <div className='flex items-center gap-1.5'>
            <CalendarIcon className={`size-3 ${isExam ? 'text-rose-500' : 'text-emerald-600'}`} />
            <span>날짜 : <strong>{p.dateStr}</strong></span>
          </div>
          <div className='flex items-center gap-1.5'>
            <ClockIcon className={`size-3 ${isExam ? 'text-rose-500' : 'text-emerald-600'}`} />
            <span>제출시간 : <strong>{p.timeStr}</strong></span>
          </div>
        </div>
      )}
    </div>
  )
}

export function CategoryCard ({ category, problems, isOwner, isExpanded, groupId, onToggle, onDeleteCategory, onDeleteProblem }: CategoryCardProps) {
  const router = useRouter()
  const isExam = category.type === 'exam'
  const goToProblem = (problemId: string) => router.push(`/problem/${problemId}?groupId=${groupId}&categoryId=${category.id}`)

  const emptyState = (
    <div className='py-4 text-center text-xs text-slate-400 border border-dashed rounded-lg bg-white/60 mt-2'>
      등록된 문제지가 없습니다.
    </div>
  )

  const problemList = problems.length === 0 ? emptyState : problems.map((p) => (
    <ProblemRow
      key={p.id}
      p={p}
      isOwner={isOwner}
      isExam={isExam}
      onClick={() => goToProblem(p.id)}
      onDelete={(e) => onDeleteProblem(e, p.id)}
    />
  ))

  // 시험 항목 중 "현재 주차"는 문제지가 접혀도 카드 자체가 조금 더 강조된 스타일입니다.
  if (isExam && category.isCurrentWeek) {
    return (
      <div id={`category-${category.id}`} className='border border-rose-100/80 rounded-2xl bg-[#fdf2f2]/60 p-3.5 space-y-3 scroll-mt-24'>
        <div className='flex items-center justify-between cursor-pointer' onClick={onToggle}>
          <div className='flex items-center gap-2'>
            <span className='font-bold text-xs text-slate-800'>{category.title}</span>
            <span className='text-[10px] bg-rose-100 text-rose-700 font-medium px-2 py-0.5 rounded-full'>{problems.length}개</span>
            <span className='text-[11px] text-slate-400 font-normal ml-1'>{category.period}</span>
            <span className='text-[10px] font-bold bg-[#e53935] text-white px-2 py-0.5 rounded-full ml-1'>현재 주차</span>
          </div>
          {isOwner && (
            <button onClick={onDeleteCategory} className='text-slate-400 hover:text-rose-600 p-0.5 transition-colors' title='항목 삭제'>
              <Trash2Icon className='size-3.5' />
            </button>
          )}
        </div>
        {isExpanded && problemList}
      </div>
    )
  }

  return (
    <div
      id={`category-${category.id}`}
      className={`border rounded-2xl overflow-hidden transition-all scroll-mt-24 ${
        isExam ? 'border-rose-100/70 bg-[#fff5f5]/40' : 'border-emerald-100/70 bg-[#edf7ed]/50'
      }`}
    >
      <div
        onClick={onToggle}
        className={`flex justify-between items-center px-4 py-3 cursor-pointer transition-colors select-none ${
          isExam ? 'hover:bg-rose-100/40' : 'hover:bg-emerald-100/40'
        }`}
      >
        <span className='font-semibold text-xs text-slate-700'>{category.title}</span>
        <div className='flex items-center gap-2'>
          {isExam && category.period && (
            <span className='text-[11px] text-slate-400 font-normal'>{category.period}</span>
          )}
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
            isExam ? 'bg-[#ffebee] text-[#c62828]' : 'bg-[#e8f5e9] text-[#2e7d32]'
          }`}>
            {problems.length}개
          </span>
          {isOwner && (
            <button onClick={onDeleteCategory} className='text-slate-400 hover:text-rose-600 p-0.5 transition-colors' title='항목 삭제'>
              <Trash2Icon className='size-3.5' />
            </button>
          )}
        </div>
      </div>
      {isExpanded && (
        <div className={`p-3 pt-0 bg-white space-y-2 border-t ${isExam ? 'border-rose-100/50' : 'border-emerald-100/50'}`}>
          {problemList}
        </div>
      )}
    </div>
  )
}
