'use client'

import React from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import * as z from 'zod'
import { EditIcon, LoaderCircleIcon, XIcon, UserIcon, BriefcaseIcon, Building2Icon, DoorClosedIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useMe } from '@/context/me-provider'
import type { User } from '@/types/user'

const formSchema = z.object({
  username: z.string().min(1, '이름은 필수입니다.'),
  position: z.string().min(1, '직책은 필수입니다.'),
  department: z.string().min(1, '학과는 필수입니다.'),
  office: z.string().min(1, '사무실은 필수입니다.'),
})

type EditProfessorDialogProps = {
  user: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const EditProfessorDialog = ({ user, open, onOpenChange: setOpen }: EditProfessorDialogProps) => {
  const [isEditing, setIsEditing] = React.useState(false)
  const { refresh } = useMe()
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: user.username,
      position: user.position ?? '',
      department: user.department ?? '',
      office: user.office ?? '',
    }
  })

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    setIsEditing(true)
    const resp = await fetch('/api/user/me', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(data),
    })
    if (resp.ok) {
      toast.success('회원 정보가 성공적으로 수정되었습니다.')
      setOpen(false)
      refresh()
    } else {
      toast.error('회원 정보 수정에 실패했습니다. 다시 시도해주세요.')
    }
    setIsEditing(false)
  }

  React.useEffect(() => {
    form.reset({
      username: user.username,
      position: user.position ?? '',
      department: user.department ?? '',
      office: user.office ?? '',
    })
  }, [user, form])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>회원 정보 수정</DialogTitle>
          <DialogDescription>
            아래에서 회원 정보를 수정할 수 있습니다.
          </DialogDescription>
        </DialogHeader>
        <form id='form-edit-professor' onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup className='mt-4'>
            <Controller
              name='username'
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor='form-edit-professor-username' className='flex items-center gap-1.5'>
                    <UserIcon className='size-3.5 text-muted-foreground' />이름
                  </FieldLabel>
                  <Input
                    {...field}
                    id='form-edit-professor-username'
                    aria-invalid={fieldState.invalid}
                    placeholder='홍길동'
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name='position'
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor='form-edit-professor-position' className='flex items-center gap-1.5'>
                    <BriefcaseIcon className='size-3.5 text-muted-foreground' />직위
                  </FieldLabel>
                  <Input
                    {...field}
                    id='form-edit-professor-position'
                    aria-invalid={fieldState.invalid}
                    placeholder='교수'
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name='department'
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor='form-edit-professor-department' className='flex items-center gap-1.5'>
                    <Building2Icon className='size-3.5 text-muted-foreground' />소속 학과
                  </FieldLabel>
                  <Input
                    {...field}
                    id='form-edit-professor-department'
                    aria-invalid={fieldState.invalid}
                    placeholder='소프트웨어학부'
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name='office'
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor='form-edit-professor-office' className='flex items-center gap-1.5'>
                    <DoorClosedIcon className='size-3.5 text-muted-foreground' />연구실
                  </FieldLabel>
                  <Input
                    {...field}
                    id='form-edit-professor-office'
                    aria-invalid={fieldState.invalid}
                    placeholder='연구실'
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </FieldGroup>
        </form>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant='outline' onClick={() => form.reset()}><XIcon /> 취소</Button>
          </DialogClose>
          <Button type='submit' form='form-edit-professor' disabled={isEditing}>{isEditing ? <LoaderCircleIcon className='animate-spin' /> : <EditIcon />} 수정</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
