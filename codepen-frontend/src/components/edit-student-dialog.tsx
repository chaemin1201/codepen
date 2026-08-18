'use client'

import React, { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import * as z from 'zod'
import { EditIcon, LoaderCircleIcon, XIcon, UserIcon, HashIcon, GraduationCapIcon, BookOpenIcon, CodeIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useMe } from '@/context/me-provider'
import type { User } from '@/types/user'

const formSchema = z.object({
  username: z.string().min(1, '이름은 필수입니다.'),
  student_no: z.coerce.number().min(1, '학번은 필수입니다.'),
  grade: z.coerce.number().min(1).max(4),
  major: z.string(),
  codepen_username: z.string().min(1, 'CodePen 사용자 이름은 필수입니다.'),
})

type FormValues = z.infer<typeof formSchema>

const grades = [
  { label: '1학년', value: 1 },
  { label: '2학년', value: 2 },
  { label: '3학년', value: 3 },
  { label: '4학년', value: 4 },
]

interface EditStudentDialogProps {
  user?: User | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditStudentDialog({ user, open, onOpenChange }: EditStudentDialogProps) {
  const [isEditing, setIsEditing] = useState(false)
  const { refresh } = useMe()

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      username: user?.username || '',
      student_no: user?.student_no ?? undefined,
      grade: user?.grade ?? 1,
      major: user?.major ?? '',
      codepen_username: user?.codepen_username ?? '',
    },
  })

  React.useEffect(() => {
    if (open && user) {
      form.reset({
        username: user.username || '',
        student_no: user.student_no ?? undefined,
        grade: user.grade ?? 1,
        major: user.major ?? '',
        codepen_username: user.codepen_username ?? '',
      })
    }
  }, [user, open, form])

  const onSubmit = async (data: FormValues) => {
    if (isEditing) return
    setIsEditing(true)

    try {
      const resp = await fetch('/api/user/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      })

      if (resp.status === 409) {
        form.setError('student_no', { message: '이미 존재하거나 등록된 학번입니다.' })
        toast.error('이미 존재하는 학번입니다.')
        setIsEditing(false)
        return
      }

      if (resp.ok) {
        toast.success('회원 정보가 성공적으로 수정되었습니다.')
        onOpenChange(false)
        if (typeof refresh === 'function') {
          refresh()
        }
      } else {
        const errorData = await resp.json().catch(() => ({}))
        if (errorData.message?.includes('student_no') || errorData.message?.includes('학번')) {
          form.setError('student_no', { message: '이미 존재하는 학번입니다.' })
          toast.error('이미 존재하는 학번입니다.')
        } else {
          toast.error('회원 정보 수정에 실패했습니다.')
        }
      }
    } catch (err) {
      console.error(err)
      toast.error('서버와 통신하는 중 오류가 발생했습니다.')
    } finally {
      setIsEditing(false)
    }
  }

  const inputStyle = 'w-full bg-background text-foreground border-input focus-visible:ring-1 focus-visible:ring-ring focus:outline-none rounded-xl [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'

  return (
    <Dialog open={open} onOpenChange={(val) => !isEditing && onOpenChange(val)}>
      <DialogContent className='bg-background text-foreground border-slate-100 rounded-3xl p-6 shadow-lg max-w-md'>
        <DialogHeader>
          <DialogTitle className='text-xl font-bold text-foreground'>회원 정보 수정</DialogTitle>
          <DialogDescription className='text-xs text-muted-foreground'>
            아래에서 회원 정보를 수정할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <form 
          id='form-edit-student' 
          onSubmit={(e) => {
            e.preventDefault()
            form.handleSubmit(onSubmit as any)(e)
          }}
        >
          <FieldGroup className='mt-4 space-y-3.5'>
            {/* 이름 */}
            <Controller
              name='username'
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor='form-edit-student-username' className='text-xs font-semibold text-foreground flex items-center gap-1.5'><UserIcon className='size-3.5 text-muted-foreground' />이름</FieldLabel>
                  <Input {...field} id='form-edit-student-username' placeholder='홍길동' className={inputStyle} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            {/* 학번 */}
            <Controller
              name='student_no'
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor='form-edit-student-student_no' className='text-xs font-semibold text-foreground flex items-center gap-1.5'><HashIcon className='size-3.5 text-muted-foreground' />학번</FieldLabel>
                  <Input
                    {...field}
                    id='form-edit-student-student_no'
                    placeholder='20250000'
                    type='number'
                    className={inputStyle}
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            {/* 학년 */}
            <Controller
              name='grade'
              control={form.control}
              render={({ field, fieldState }) => (
                <Field orientation='responsive' data-invalid={fieldState.invalid}>
                  <FieldContent>
                    <FieldLabel htmlFor='form-edit-student-grade' className='text-xs font-semibold text-foreground flex items-center gap-1.5'><GraduationCapIcon className='size-3.5 text-muted-foreground' />학년</FieldLabel>
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </FieldContent>
                  <Select
                    name={field.name}
                    value={field.value ? field.value.toString() : '1'}
                    onValueChange={(value) => field.onChange(Number(value))}
                  >
                    <SelectTrigger id='form-edit-student-grade' className={`${inputStyle} min-w-28`}>
                      <SelectValue placeholder='Select' />
                    </SelectTrigger>
                    <SelectContent position='item-aligned' className='bg-popover text-popover-foreground border-border'>
                      {grades.map((grade) => (
                        <SelectItem key={grade.value} value={grade.value.toString()}>
                          {grade.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />

            {/* 전공 */}
            <Controller
              name='major'
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor='form-edit-student-major' className='text-xs font-semibold text-foreground flex items-center gap-1.5'><BookOpenIcon className='size-3.5 text-muted-foreground' />전공</FieldLabel>
                  <Input {...field} id='form-edit-student-major' placeholder='소프트웨어학부' className={inputStyle} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            {/* CodePen 사용자 이름 */}
            <Controller
              name='codepen_username'
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor='form-edit-student-codepen_username' className='text-xs font-semibold text-foreground flex items-center gap-1.5'><CodeIcon className='size-3.5 text-muted-foreground' />CodePen 사용자 이름</FieldLabel>
                  <Input {...field} id='form-edit-student-codepen_username' placeholder='codepen_username' className={inputStyle} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </FieldGroup>
        </form>

        <DialogFooter className='mt-6 flex flex-row justify-end gap-3'>
          <Button 
            type='button'
            variant='outline' 
            disabled={isEditing}
            onClick={() => {
              form.reset()
              onOpenChange(false)
            }} 
            className='rounded-xl px-4 py-2 text-foreground border-input hover:bg-accent'
          >
            <XIcon className='w-4 h-4 mr-1' /> 취소
          </Button>
          <Button 
            type='submit' 
            form='form-edit-student' 
            disabled={isEditing}
            className='bg-[#589960] hover:bg-[#173A23] text-white font-bold rounded-xl transition-colors px-4 py-2'
          >
            {isEditing ? <LoaderCircleIcon className='w-4 h-4 animate-spin mr-1' /> : <EditIcon className='w-4 h-4 mr-1' />} 
            수정
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}