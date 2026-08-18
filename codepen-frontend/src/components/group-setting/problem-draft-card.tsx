'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ProblemDraft } from '@/types/problem-draft'

interface ProblemDraftCardProps {
  problemId: number
  questionCount: number
  draft: ProblemDraft
  onChange: (patch: Partial<ProblemDraft>) => void
}

export function ProblemDraftCard ({ problemId, questionCount, draft, onChange }: ProblemDraftCardProps) {
  return (
    <div className='border border-slate-100 rounded-2xl p-4 space-y-3 bg-slate-50/40 hover:shadow-sm transition-shadow'>
      <div className='flex items-center justify-between'>
        <Label className='text-xs'>문제지 이름</Label>
        <span className='text-[11px] text-slate-400'>문제 수: {questionCount}개</span>
      </div>
      <Input
        value={draft.title}
        onChange={(e) => onChange({ title: e.target.value })}
      />
      <Label className='text-xs'>문제지 소개</Label>
      <Textarea
        value={draft.description}
        onChange={(e) => onChange({ description: e.target.value })}
        rows={3}
      />
      <div className='flex items-center justify-between'>
        <Label className='text-xs'>시험 모드</Label>
        <button
          type='button'
          onClick={() => onChange({ examMode: !draft.examMode })}
          className={`text-xs font-bold px-3 py-1 rounded-full transition-colors ${draft.examMode ? 'bg-mydelete text-white' : 'bg-slate-200 text-slate-600'}`}
        >
          {draft.examMode ? 'ON' : 'OFF'}
        </button>
      </div>
      <div className='flex flex-col gap-1.5'>
        <Label className='text-xs'>게시 시작 시간</Label>
        <div className='flex gap-1.5'>
          <Input
            type='date'
            value={draft.date}
            onChange={(e) => onChange({ date: e.target.value })}
            className='flex-1'
          />
          <select
            value={draft.hour}
            onChange={(e) => onChange({ hour: e.target.value })}
            className='border rounded-md px-1 text-sm'
          >
            {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
          <select
            value={draft.minute}
            onChange={(e) => onChange({ minute: e.target.value })}
            className='border rounded-md px-1 text-sm'
          >
            {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
