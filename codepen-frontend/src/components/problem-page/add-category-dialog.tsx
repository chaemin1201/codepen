'use client'

import React from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { fetcher } from '@/lib/fetcher'
import type { Category as ApiCategory } from '@/types/category'

interface AddCategoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId: number
  defaultType: 'general' | 'exam'
  onCreated: (createdCategoryId: string) => void
}

export function AddCategoryDialog ({ open, onOpenChange, groupId, defaultType, onCreated }: AddCategoryDialogProps) {
  const [title, setTitle] = React.useState('')
  const [startDate, setStartDate] = React.useState('')

  const onSubmit = async () => {
    if (!title.trim()) return toast.error('항목 이름을 입력해주세요.')

    try {
      // [신규] 시작일만 입력하면 종료일(마감/현재주차 판정)은 서버가 +7일로 자동 계산합니다.
      const startsAtIso = startDate ? new Date(`${startDate}T00:00:00`).toISOString() : null
      const created = await fetcher<ApiCategory>('/api/category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: groupId, title, type: defaultType, starts_at: startsAtIso }),
      })
      toast.success(`'${title}' 항목이 추가되었습니다.`)
      setTitle('')
      setStartDate('')
      onOpenChange(false)
      onCreated(String(created.category_id))
    } catch (err) {
      toast.error('항목 추가에 실패했습니다. 잠시 후 다시 시도해주세요.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{defaultType === 'general' ? '일반 문제지' : '시험 문제지'} 항목 추가</DialogTitle>
        </DialogHeader>
        <div className='space-y-4 py-2'>
          <div className='space-y-2'>
            <Label htmlFor='cat-title'>항목명 (예: 6주차, 기말고사 등)</Label>
            <Input
              id='cat-title'
              placeholder='이름을 입력하세요'
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='cat-start-date'>시작 날짜 (선택 - 입력하면 7일 뒤가 자동으로 종료일이 되고, 현재 기간에 맞춰 &quot;현재 주차&quot;로 표시돼요)</Label>
            <Input
              id='cat-start-date'
              type='date'
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onSubmit}>항목 추가하기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
