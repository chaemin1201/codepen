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
import type { Problem } from '@/types/problem'

// 🟢 [수정] 시작/마감 날짜는 완전히 제거했습니다. "시작 전 숨김"은 그대로 유지합니다.
// 이제 문제지의 날짜(기간)는 그룹 설정 쪽에서만 관리하고, 여기서는
// 제목/설명/시작 전 숨김만 고칠 수 있게 했어요.
export type EditProblemDialogProps = {
  problem: Problem
  onEdited?: () => void
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

// 🟢 [수정] 제목/설명은 그대로, "시작 전 숨김"은 유지. 날짜(starts_at/deadline)만 제거.
const formSchema = z.object({
  title: z.string().min(1, '문제 제목은 필수입니다.'),
  description: z.string().optional(),
  hide_before_start: z.boolean(),
})

// 🟢 공통 인풋 스타일: 그룹 개설하기 다이얼로그와 동일한 톤 + 포커스 시 연한 초록색 링
const fieldInputClass =
  'w-full bg-background text-foreground border-input rounded-xl h-11 px-3.5 ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A8D5B0] focus-visible:border-[#589960]'

const fieldTextareaClass =
  'w-full bg-background text-foreground border-input rounded-xl resize-none min-h-[90px] p-3.5 text-sm ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A8D5B0] focus-visible:border-[#589960]'

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

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: problem.title,
      description: problem.description ?? '', // 🟢 null/undefined 보정
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
          // 🟢 [수정] 제목/설명/시작 전 숨김을 전송합니다. starts_at/deadline은
          // 아예 보내지 않아서, 백엔드가 "값이 없으면 기존 값을 그대로 둔다"는
          // 규칙에 따라 날짜 관련 값은 건드리지 않습니다 (그룹 설정에서만 변경).
          title: data.title,
          description: data.description ?? '', // 🟢 백엔드 검증 통과를 위한 빈 문자열 세이프가드
          hide_before_start: data.hide_before_start,
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
        hide_before_start: problem.hide_before_start,
      })
    }
  }, [isOpen, problem, form])

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
        {/* 🟢 그룹 개설하기 다이얼로그와 동일한 톤(연한 배경 + 초록 계열)으로 통일 */}
        <DialogContent className="bg-[#FCFCFC] text-foreground border-slate-100 rounded-3xl p-6 shadow-lg max-w-md">
          <DialogHeader className="border-b border-slate-100 pb-4">
            <DialogTitle className="text-xl font-bold text-foreground">문제 수정</DialogTitle>
            <DialogDescription className="text-xs text-[#868C88]">
              제목, 설명, 시작 전 숨김 여부를 수정할 수 있어요. 시작/마감 날짜는 그룹 설정에서 관리해요.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="flex flex-col gap-3.5 py-4">
            <Controller
              name="title"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="flex flex-col gap-1.5">
                  <FieldLabel
                    htmlFor="form-edit-problem-title"
                    className="text-xs font-bold text-[#173A23] px-0.5"
                  >
                    제목
                  </FieldLabel>
                  <Input
                    {...field}
                    id="form-edit-problem-title"
                    aria-invalid={fieldState.invalid}
                    placeholder="Table 만들기"
                    className={fieldInputClass}
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
                <Field data-invalid={fieldState.invalid} className="flex flex-col gap-1.5">
                  <FieldLabel
                    htmlFor="form-edit-problem-description"
                    className="text-xs font-bold text-[#173A23] px-0.5"
                  >
                    설명 <span className="text-xs text-[#868C88] font-normal">(선택)</span>
                  </FieldLabel>
                  <Textarea
                    {...field}
                    id="form-edit-problem-description"
                    aria-invalid={fieldState.invalid}
                    placeholder="HTML의 table 태그를 사용하여 표를 만들어보세요."
                    className={fieldTextareaClass}
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
                  className="flex items-start gap-2.5 bg-[#f7fbf8] border border-[#EBF1F4] rounded-xl p-3.5"
                >
                  <Checkbox
                    id="form-edit-problem-hide_before_start"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked)}
                    aria-invalid={Boolean(form.formState.errors.hide_before_start)}
                    className="data-[state=checked]:bg-[#589960] data-[state=checked]:border-[#589960] mt-0.5"
                  />
                  <FieldContent>
                    <FieldLabel
                      htmlFor="form-edit-problem-hide_before_start"
                      className="text-xs font-bold text-[#173A23]"
                    >
                      시작 전 숨김
                    </FieldLabel>
                    <FieldDescription className="text-[11px] text-[#868C88]">
                      문제의 시작 날짜가 되기 전까지 학생들에게 문제를 숨길 수 있습니다.
                    </FieldDescription>
                  </FieldContent>
                </Field>
              )}
            />
          </FieldGroup>
          <DialogFooter className="sm:justify-center">
            <DialogClose asChild>
              <Button
                variant="outline"
                onClick={() => form.reset()}
                className="rounded-xl border-[#EBF1F4] text-[#868C88] hover:bg-[#FCFCFC] hover:text-[#173A23]"
              >
                <XIcon /> 취소
              </Button>
            </DialogClose>
            <Button
              type="submit"
              form="form-edit-problem"
              disabled={isEditing}
              className="bg-[#589960] hover:bg-[#173A23] text-white font-bold rounded-xl px-5 transition-colors"
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
