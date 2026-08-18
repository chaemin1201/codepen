'use client'

import { toast } from 'sonner'
import { UserCheckIcon, Trash2Icon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { fetcher } from '@/lib/fetcher'
import type { Member } from '@/types/problem-view'

interface MembersDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId: number
  members: Member[]
  isOwner: boolean
  onChanged: () => void
}

export function MembersDialog ({ open, onOpenChange, groupId, members, isOwner, onChanged }: MembersDialogProps) {
  const onDeleteMember = async (memberId: string, memberName: string) => {
    if (!confirm(`${memberName} 학생을 그룹에서 제외하시겠습니까?`)) return
    try {
      await fetcher(`/api/group/${groupId}/members/${memberId}`, { method: 'DELETE' })
      toast.success('학생을 수강 목록에서 삭제했습니다.')
      onChanged()
    } catch (err) {
      toast.error('학생 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <UserCheckIcon className='size-5 text-emerald-600' />
            참여 중인 수강생 ({members.length}명)
          </DialogTitle>
        </DialogHeader>
        <div className='space-y-3 py-2 max-h-80 overflow-y-auto'>
          {members.map((m) => (
            <div key={m.id} className='flex items-center justify-between p-3 border rounded-xl bg-muted/20'>
              <div className='space-y-0.5'>
                <div className='flex items-center gap-2'>
                  <span className='font-bold text-sm'>{m.name}</span>
                  <span className='text-xs text-muted-foreground'>({m.studentId})</span>
                </div>
                <p className='text-xs text-muted-foreground'>가입일: {m.joinedAt}</p>
              </div>
              {isOwner && (
                <Button
                  variant='ghost'
                  size='sm'
                  className='text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 size-8 p-0'
                  onClick={() => onDeleteMember(m.id, m.name)}
                  title='수강생 강퇴'
                >
                  <Trash2Icon className='size-4' />
                </Button>
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant='outline' className='w-full' onClick={() => onOpenChange(false)}>닫기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
