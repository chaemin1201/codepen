'use client'

import React from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { fetcher } from '@/lib/fetcher'
import type { Category } from '@/types/problem-view'

interface CreateProblemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId: number
  categories: Category[]
  defaultCategoryId: string
  onCreated: (categoryId: string) => void
}

const formatDatePart = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function CreateProblemDialog ({ open, onOpenChange, groupId, categories, defaultCategoryId, onCreated }: CreateProblemDialogProps) {
  const now = new Date()
  const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [difficulty, setDifficulty] = React.useState('medium')
  const [targetCat, setTargetCat] = React.useState(defaultCategoryId)
  const [startDate, setStartDate] = React.useState(formatDatePart(now))
  const [startHour, setStartHour] = React.useState('00')
  const [startMinute, setStartMinute] = React.useState('00')
  const [deadlineDate, setDeadlineDate] = React.useState(formatDatePart(weekLater))
  const [deadlineHour, setDeadlineHour] = React.useState('23')
  const [deadlineMinute, setDeadlineMinute] = React.useState('59')

  // 열릴 때마다 기본값을 다시 채워줍니다 (직전에 선택했던 항목 기준).
  React.useEffect(() => {
    if (open) {
      setTitle('')
      setDescription('')
      setDifficulty('medium')
      setTargetCat(defaultCategoryId)
      const n = new Date()
      const w = new Date(n.getTime() + 7 * 24 * 60 * 60 * 1000)
      setStartDate(formatDatePart(n))
      setStartHour('00')
      setStartMinute('00')
      setDeadlineDate(formatDatePart(w))
      setDeadlineHour('23')
      setDeadlineMinute('59')
    }
  }, [open, defaultCategoryId])

  const onSubmit = async () => {
    if (!title.trim()) return toast.error('문제지 제목을 입력해주세요.')
    if (!startDate || !deadlineDate) return toast.error('시작일과 마감일을 입력해주세요.')

    const startsAt = new Date(`${startDate}T${startHour}:${startMinute}:00`)
    const deadline = new Date(`${deadlineDate}T${deadlineHour}:${deadlineMinute}:00`)
    if (deadline <= startsAt) return toast.error('마감일은 시작일보다 이후여야 합니다.')

    try {
      await fetcher('/api/problem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group_id: groupId,
          category_id: targetCat ? Number(targetCat) : null,
          question_count: 0,
          title,
          description,
          difficulty,
          starts_at: startsAt.toISOString(),
          deadline: deadline.toISOString(),
          hide_before_start: false,
        }),
      })
      toast.success(`'${title}' 문제지가 생성되었습니다.`)
      onOpenChange(false)
      onCreated(targetCat)
    } catch (err) {
      toast.error('문제지 생성에 실패했습니다. 잠시 후 다시 시도해주세요.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>새 문제지 생성하기</DialogTitle>
        </DialogHeader>
        <div className='space-y-4 py-2 max-h-[70vh] overflow-y-auto'>
          <div className='space-y-2'>
            <Label htmlFor='prob-title'>문제지 제목</Label>
            <Input
              id='prob-title'
              placeholder='문제지 제목을 입력하세요'
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='prob-desc'>문제지 소개</Label>
            <Textarea
              id='prob-desc'
              placeholder='문제지에 대한 간단한 설명을 입력하세요 (선택)'
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='prob-cat'>등록할 항목 선택</Label>
            <select
              id='prob-cat'
              className='w-full border rounded-md p-2 text-sm bg-background'
              value={targetCat}
              onChange={(e) => setTargetCat(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  [{c.type === 'general' ? '일반' : '시험'}] {c.title}
                </option>
              ))}
            </select>
          </div>
          <div className='space-y-2'>
            <Label>게시 시작 시간</Label>
            <div className='flex gap-1.5'>
              <Input
                type='date'
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className='flex-1'
              />
              <select value={startHour} onChange={(e) => setStartHour(e.target.value)} className='border rounded-md px-1 text-sm'>
                {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
              <select value={startMinute} onChange={(e) => setStartMinute(e.target.value)} className='border rounded-md px-1 text-sm'>
                {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
          <div className='space-y-2'>
            <Label>제출 마감 시간</Label>
            <div className='flex gap-1.5'>
              <Input
                type='date'
                value={deadlineDate}
                onChange={(e) => setDeadlineDate(e.target.value)}
                className='flex-1'
              />
              <select value={deadlineHour} onChange={(e) => setDeadlineHour(e.target.value)} className='border rounded-md px-1 text-sm'>
                {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
              <select value={deadlineMinute} onChange={(e) => setDeadlineMinute(e.target.value)} className='border rounded-md px-1 text-sm'>
                {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>취소</Button>
          <Button className='bg-emerald-600 hover:bg-emerald-700 text-white' onClick={onSubmit}>
            생성 및 추가
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
