'use client'

import React from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import * as z from 'zod'
import { toast } from 'sonner'
import { LoaderCircleIcon, PlusIcon, XIcon } from 'lucide-react'

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
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { DateAndTimePicker } from '@/components/ui/date-and-time-picker'

export type CreateProblemDialogProps = {
  groupId: number;
  onCreated?: () => void;
}

const formSchema = z.object({
  title: z.string().min(1, '문제 제목은 필수입니다.'),
  description: z.string().min(0, '문제 설명은 필수입니다.'),
  starts_at: z.date(),
  deadline: z.date().min(new Date(), '마감 날짜는 현재 시간 이후여야 합니다.'),
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

export const CreateProblemDialog = ({ groupId, onCreated }: CreateProblemDialogProps) => {
  const [open, setOpen] = React.useState(false)
  const [isCreating, setIsCreating] = React.useState(false)
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      description: '',
      starts_at: new Date(),
      deadline: new Date(),
      hide_before_start: false,
    }
  })

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    setIsCreating(true)
    try {
      const response = await fetch('/api/problem/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ ...data, group_id: groupId }),
      })

      if (!response.ok) {
        throw new Error('문제 생성에 실패했습니다.')
      }

      toast.success('문제가 성공적으로 생성되었습니다.')
      form.reset()
      setOpen(false)
      onCreated?.()
    } catch (error) {
      toast.error((error as Error).message || '알 수 없는 오류가 발생했습니다.')
    }
    setIsCreating(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <form id='form-create-problem' onSubmit={form.handleSubmit(onSubmit)}>
        <DialogTrigger asChild>
          <Button variant='outline'><PlusIcon /> 문제 생성</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>문제 생성</DialogTitle>
            <DialogDescription>
              문제 생성을 위해 아래 정보를 입력해주세요.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className='mt-4'>
            <Controller
              name='title'
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor='form-create-problem-title'>
                    제목
                  </FieldLabel>
                  <Input
                    {...field}
                    id='form-create-problem-title'
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
                  <FieldLabel htmlFor='form-create-problem-description'>
                    설명
                  </FieldLabel>
                  <Textarea
                    {...field}
                    id='form-create-problem-description'
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
              name='starts_at'
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor='form-create-problem-starts_at'>
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
                  <FieldLabel htmlFor='form-create-problem-deadline'>
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
            <Button type='submit' form='form-create-problem' disabled={isCreating}>{isCreating ? <LoaderCircleIcon className='animate-spin' /> : <PlusIcon />} 생성</Button>
          </DialogFooter>
        </DialogContent>
      </form>
    </Dialog>
  )
}
