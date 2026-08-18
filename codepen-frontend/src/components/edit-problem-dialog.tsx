'use client'

import React from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import * as z from 'zod'
import { toast } from 'sonner'
import { EditIcon, LoaderCircleIcon, XIcon } from 'lucide-react'

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldDescription,
  FieldContent
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { DateAndTimePicker } from '@/components/ui/date-and-time-picker'
import { Checkbox } from '@/components/ui/checkbox'
import type { Problem } from '@/types/problem'

export type EditProblemDialogProps = {
  problem: Problem
  onEdited?: () => void;
}

const createFormSchema = (originalDeadline: Date) => z.object({
  title: z.string().min(1, '문제 제목은 필수입니다.'),
  description: z.string().min(1, '문제 설명은 필수입니다.'),
  difficulty: z.string().min(1, '문제 난이도는 필수입니다.'),
  starts_at: z.date(),
  deadline: z.date().refine(
    (date) => {
      // Only validate if the date has changed from the original
      if (date.getTime() === originalDeadline.getTime()) {
        return true
      }
      return date > new Date()
    },
    { message: '마감 날짜는 현재 시간 이후여야 합니다.' }
  ),
  hide_before_start: z.boolean(),
}).superRefine((data, ctx) => {
  if (data.starts_at >= data.deadline) {
    ctx.addIssue({
      code: 'custom',
      message: '시작 날짜는 마감 날짜보다 이전이어야 합니다.',
      path: ['starts_at'],
    })
    ctx.addIssue({
      code: 'custom',
      message: '마감 날짜는 시작 날짜보다 이후여야 합니다.',
      path: ['deadline'],
    })
  }
})

export const EditProblemDialog = ({ problem, onEdited }: EditProblemDialogProps) => {
  const [open, setOpen] = React.useState(false)
  const [isEditing, setIsEditing] = React.useState(false)
  const originalStartsAt = React.useMemo(() => new Date(problem.starts_at + 'Z'), [problem.starts_at])
  const originalDeadline = React.useMemo(() => new Date(problem.deadline + 'Z'), [problem.deadline])
  const formSchema = React.useMemo(() => createFormSchema(originalDeadline), [originalDeadline])
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: problem.title,
      description: problem.description,
      difficulty: problem.difficulty,
      starts_at: originalStartsAt,
      deadline: originalDeadline,
      hide_before_start: problem.hide_before_start,
    }
  })

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    setIsEditing(true)
    try {
      const response = await fetch(`/api/problem/${problem.problem_id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          ...data,
          group_id: problem.group_id,
          // [버그 수정] 백엔드 PartialProblem이 category_id/question_count도
          // 필수로 받는데 이 폼에는 해당 입력이 없어서 누락되어 있었습니다.
          // 편집 폼에서 다루지 않는 값이므로 기존 값을 그대로 유지해서 보냅니다.
          category_id: problem.category_id,
          question_count: problem.question_count,
        }),
      })

      if (!response.ok) {
        throw new Error('문제 수정에 실패했습니다.')
      }

      toast.success('문제가 성공적으로 수정되었습니다.')
      setOpen(false)
      onEdited?.()
    } catch (error) {
      toast.error((error as Error).message || '알 수 없는 오류가 발생했습니다.')
    }
    setIsEditing(false)
  }

  React.useEffect(() => {
    form.reset({
      title: problem.title,
      description: problem.description,
      difficulty: problem.difficulty,
      starts_at: originalStartsAt,
      deadline: originalDeadline,
      hide_before_start: problem.hide_before_start,
    })
  }, [problem, form, originalStartsAt, originalDeadline])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <form id='form-edit-problem' onSubmit={form.handleSubmit(onSubmit)}>
        <DialogTrigger asChild>
          <Button variant='outline' size='icon'><EditIcon /></Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>문제 수정</DialogTitle>
            <DialogDescription>
              문제 수정을 위해 아래 정보를 입력해주세요.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className='mt-4'>
            <Controller
              name='title'
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor='form-edit-problem-title'>
                    제목
                  </FieldLabel>
                  <Input
                    {...field}
                    id='form-edit-problem-title'
                    aria-invalid={fieldState.invalid}
                    placeholder='Table 만들기'
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name='description'
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor='form-edit-problem-description'>
                    설명
                  </FieldLabel>
                  <Textarea
                    {...field}
                    id='form-edit-problem-description'
                    aria-invalid={fieldState.invalid}
                    placeholder='HTML의 table 태그를 사용하여 표를 만들어보세요.'
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name='difficulty'
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor='form-edit-problem-difficulty'>
                    난이도
                  </FieldLabel>
                  <Input
                    {...field}
                    id='form-edit-problem-difficulty'
                    aria-invalid={fieldState.invalid}
                    placeholder='쉬움'
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name='starts_at'
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor='form-edit-problem-starts_at'>
                    시작 날짜
                  </FieldLabel>
                  <DateAndTimePicker
                    date={field.value}
                    onDateChange={(date) => field.onChange(date)}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name='deadline'
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor='form-edit-problem-deadline'>
                    마감 날짜
                  </FieldLabel>
                  <DateAndTimePicker
                    date={field.value}
                    onDateChange={(date) => field.onChange(date)}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name='hide_before_start'
              control={form.control}
              render={({ field }) => (
                <Field orientation='horizontal' data-invalid={Boolean(form.formState.errors.hide_before_start)}>
                  <Checkbox
                    id='form-create-problem-hide_before_start'
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked)}
                    aria-invalid={Boolean(form.formState.errors.hide_before_start)}
                  />
                  <FieldContent>
                    <FieldLabel htmlFor='form-create-problem-hide_before_start'>
                      시작 전 숨김
                    </FieldLabel>
                    <FieldDescription>
                      문제의 시작 날짜가 되기 전 까지 학생들에게 문제를 숨길 수 있습니다.
                    </FieldDescription>
                  </FieldContent>
                </Field>
              )}
            />
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant='outline' onClick={() => form.reset()}><XIcon /> 취소</Button>
            </DialogClose>
            <Button type='submit' form='form-edit-problem' disabled={isEditing}>{isEditing ? <LoaderCircleIcon className='animate-spin' /> : <EditIcon />} 수정</Button>
          </DialogFooter>
        </DialogContent>
      </form>
    </Dialog>
  )
}
