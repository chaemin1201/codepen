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
  FieldContent,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { DateAndTimePicker } from '@/components/ui/date-and-time-picker'
import { Checkbox } from '@/components/ui/checkbox'
import type { Problem } from '@/types/problem'

// 1. open, onOpenChange props 추가
export type EditProblemDialogProps = {
  problem: Problem
  onEdited?: () => void
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const createFormSchema = (originalDeadline: Date) =>
  z
    .object({
      title: z.string().min(1, '문제 제목은 필수입니다.'),
      description: z.string().optional(),
      starts_at: z.date(),
      deadline: z.date().refine(
        (date) => {
          if (date.getTime() === originalDeadline.getTime()) {
            return true
          }
          return date > new Date()
        },
        { message: '마감 날짜는 현재 시간 이후여야 합니다.' }
      ),
      hide_before_start: z.boolean(),
    })
    .superRefine((data, ctx) => {
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

export const EditProblemDialog = ({
  problem,
  onEdited,
  trigger,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
}: EditProblemDialogProps) => {
  // 제어(Controlled) / 비제어(Uncontrolled) 상태 지원
  const [internalOpen, setInternalOpen] = React.useState(false)
  const isControlled = controlledOpen !== undefined
  const isOpen = isControlled ? controlledOpen : internalOpen

  const handleOpenChange = (newOpen: boolean) => {
    if (isControlled) {
      setControlledOpen?.(newOpen)
    } else {
      setInternalOpen(newOpen)
    }
  }

  const [isEditing, setIsEditing] = React.useState(false)
  const originalStartsAt = React.useMemo(
    () => new Date(problem.starts_at + 'Z'),
    [problem.starts_at]
  )
  const originalDeadline = React.useMemo(
    () => new Date(problem.deadline + 'Z'),
    [problem.deadline]
  )
  const formSchema = React.useMemo(
    () => createFormSchema(originalDeadline),
    [originalDeadline]
  )

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: problem.title,
      description: problem.description ?? '', // 🟢 null/undefined 보정
      starts_at: originalStartsAt,
      deadline: originalDeadline,
      hide_before_start: problem.hide_before_start,
    },
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
          description: data.description ?? '', // 🟢 백엔드 검증 통과를 위한 빈 문자열 세이프가드
          group_id: problem.group_id,
          category_id: problem.category_id,
          question_count: problem.question_count,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || errorData.message || '문제 수정에 실패했습니다.')
      }

      toast.success('문제가 성공적으로 수정되었습니다.')
      handleOpenChange(false)
      onEdited?.()
    } catch (error) {
      toast.error((error as Error).message || '알 수 없는 오류가 발생했습니다.')
    } finally {
      setIsEditing(false)
    }
  }

  // 모달이 열릴 때 폼 데이터를 전달된 problem 값으로 갱신
  React.useEffect(() => {
    if (isOpen) {
      form.reset({
        title: problem.title,
        description: problem.description ?? '', // 🟢 null/undefined 보정
        starts_at: originalStartsAt,
        deadline: originalDeadline,
        hide_before_start: problem.hide_before_start,
      })
    }
  }, [isOpen, problem, form, originalStartsAt, originalDeadline])

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <form id="form-edit-problem" onSubmit={form.handleSubmit(onSubmit)}>
        {/* trigger가 주어졌거나 비제어 모드일 때만 Trigger 버튼을 렌더링 */}
        {(trigger || !isControlled) && (
          <DialogTrigger asChild>
            {trigger || (
              <Button variant="outline" size="icon">
                <EditIcon />
              </Button>
            )}
          </DialogTrigger>
        )}
        <DialogContent>
          <DialogHeader>
            <DialogTitle>문제 수정</DialogTitle>
            <DialogDescription>
              문제 수정을 위해 아래 정보를 입력해주세요.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="mt-4">
            <Controller
              name="title"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-edit-problem-title">
                    제목
                  </FieldLabel>
                  <Input
                    {...field}
                    id="form-edit-problem-title"
                    aria-invalid={fieldState.invalid}
                    placeholder="Table 만들기"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="description"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-edit-problem-description">
                    설명 <span className="text-xs text-slate-400 font-normal">(선택)</span>
                  </FieldLabel>
                  <Textarea
                    {...field}
                    id="form-edit-problem-description"
                    aria-invalid={fieldState.invalid}
                    placeholder="HTML의 table 태그를 사용하여 표를 만들어보세요."
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="starts_at"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-edit-problem-starts_at">
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
              name="deadline"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-edit-problem-deadline">
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
              name="hide_before_start"
              control={form.control}
              render={({ field }) => (
                <Field
                  orientation="horizontal"
                  data-invalid={Boolean(form.formState.errors.hide_before_start)}
                >
                  <Checkbox
                    id="form-create-problem-hide_before_start"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked)}
                    aria-invalid={Boolean(
                      form.formState.errors.hide_before_start
                    )}
                  />
                  <FieldContent>
                    <FieldLabel htmlFor="form-create-problem-hide_before_start">
                      시작 전 숨김
                    </FieldLabel>
                    <FieldDescription>
                      문제의 시작 날짜가 되기 전 까지 학생들에게 문제를 숨길
                      수 있습니다.
                    </FieldDescription>
                  </FieldContent>
                </Field>
              )}
            />
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" onClick={() => form.reset()}>
                <XIcon /> 취소
              </Button>
            </DialogClose>
            <Button
              type="submit"
              form="form-edit-problem"
              disabled={isEditing}
            >
              {isEditing ? (
                <LoaderCircleIcon className="animate-spin" />
              ) : (
                <EditIcon />
              )}{' '}
              수정
            </Button>
          </DialogFooter>
        </DialogContent>
      </form>
    </Dialog>
  )
}