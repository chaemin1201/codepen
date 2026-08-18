'use client'

import { UsersIcon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
import { memberColumns, type UserWithGroupIDAndSelfID } from '../../app/problem/member-columns'
import { useQuery } from '@/lib/useQuery'
import type { GroupMemberUser } from '@/types/group'

interface AttendanceRow {
  user_id: string
  submitted_count: number
  total_problems: number
  attendance_rate: number
}

interface MembersDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId: number
  ownerId: string
  currentUserId: string
  members: GroupMemberUser[]
  onEdited: () => void
}

// 전공(학과) 분포 - 나이/국적 대신 전공 기준으로 학생 구성을 한눈에 보여줍니다
function MajorDistribution ({ students }: { students: GroupMemberUser[] }) {
  const counts: Record<string, number> = {}
  for (const m of students) {
    const key = m.major?.trim() || '미입력'
    counts[key] = (counts[key] ?? 0) + 1
  }
  const entries: Array<[string, number]> = Object.keys(counts)
    .map((key) => [key, counts[key]] as [string, number])
    .sort((a, b) => b[1] - a[1])

  if (entries.length === 0) return null
  const max = entries[0][1]

  return (
    <div className='bg-slate-50/60 border border-slate-100 rounded-2xl p-4 space-y-2'>
      <p className='text-xs font-bold text-slate-600'>전공 분포 (총 {students.length}명)</p>
      <div className='space-y-1.5'>
        {entries.map(([major, count]) => (
          <div key={major} className='flex items-center gap-2 text-xs'>
            <span className='w-20 shrink-0 text-slate-600'>{major}</span>
            <div className='flex-1 h-2 rounded-full bg-slate-200 overflow-hidden'>
              <div className='h-full bg-mygreen rounded-full' style={{ width: `${(count / max) * 100}%` }} />
            </div>
            <span className='w-6 text-right text-slate-500 font-medium'>{count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function MembersDialog ({ open, onOpenChange, groupId, ownerId, currentUserId, members, onEdited }: MembersDialogProps) {
  // [버그 수정] 그룹 생성 시 백엔드가 오너(교수님)도 GroupMember로 같이 추가해두기 때문에,
  // 그대로 두면 "그룹원 목록"에 교수님이 학생처럼 같이 뜹니다. 교수님은 스스로를 제거할
  // 수도 없으므로 목록에서 아예 제외하고 실제 학생들만 보여줍니다.
  const students = members.filter((m) => m.user_id !== ownerId)

  // [신규] 출석률 - 전체 문제지 중 몇 개를 냈는지 대략적인 비율
  const { data: attendance } = useQuery<AttendanceRow[]>(open ? `/api/group/${groupId}/attendance` : null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant='secondary'><UsersIcon /> 그룹원 조회</Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>그룹원 목록</DialogTitle>
        </DialogHeader>
        <MajorDistribution students={students} />
        {attendance && (
          <div className='bg-slate-50/60 border border-slate-100 rounded-2xl p-4 space-y-1.5'>
            <p className='text-xs font-bold text-slate-600 mb-1'>출석률 (전체 문제지 기준 제출 비율)</p>
            {students.map((s) => {
              const a = attendance.find((r) => r.user_id === s.user_id)
              const rate = a?.attendance_rate ?? 0
              return (
                <div key={s.user_id} className='flex items-center gap-2 text-xs'>
                  <span className='w-16 shrink-0 text-slate-600'>{s.username}</span>
                  <div className='flex-1 h-2 rounded-full bg-slate-200 overflow-hidden'>
                    <div className={`h-full rounded-full ${rate >= 80 ? 'bg-mygreen' : rate >= 50 ? 'bg-amber-400' : 'bg-mydelete'}`} style={{ width: `${rate}%` }} />
                  </div>
                  <span className='w-24 text-right text-slate-500 font-medium'>{a ? `${a.submitted_count}/${a.total_problems} (${rate}%)` : '-'}</span>
                </div>
              )
            })}
          </div>
        )}
        <DataTable<UserWithGroupIDAndSelfID, unknown>
          data={students.map((m) => ({
            ...m,
            group_id: groupId,
            current_user_id: currentUserId,
            onEdited,
          }))}
          columns={memberColumns}
        />
      </DialogContent>
    </Dialog>
  )
}
