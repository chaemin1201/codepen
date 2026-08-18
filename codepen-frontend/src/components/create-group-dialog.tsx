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
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export type CreateGroupDialogProps = {
  onCreated?: () => void;
}

const formSchema = z.object({
  name: z.string().min(1, '그룹 이름은 필수입니다.'),
  description: z.string().optional(),
})

export const CreateGroupDialog = ({ onCreated }: CreateGroupDialogProps) => {
  const [open, setOpen] = React.useState(false)
  const [isCreating, setIsCreating] = React.useState(false)
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
    }
  })

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    setIsCreating(true)
    try {
      const response = await fetch('/api/group/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        throw new Error('그룹 생성에 실패했습니다.')
      }

      toast.success('그룹이 성공적으로 생성되었습니다.')
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
      <form id='form-create-group' onSubmit={form.handleSubmit(onSubmit)}>
        <DialogTrigger asChild>
          <Button variant='outline' size='icon'><PlusIcon /></Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>그룹 생성</DialogTitle>
            <DialogDescription>
              그룹 생성을 위해 아래 정보를 입력해주세요.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className='mt-4'>
            <Controller
              name='name'
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor='form-create-group-name'>
                    이름
                  </FieldLabel>
                  <Input
                    {...field}
                    id='form-create-group-name'
                    aria-invalid={fieldState.invalid}
                    placeholder='HTML 기본기'
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
                  <FieldLabel htmlFor='form-create-group-description'>
                    설명
                  </FieldLabel>
                  <Textarea
                    {...field}
                    id='form-create-group-description'
                    aria-invalid={fieldState.invalid}
                    placeholder='HTML에 대해 깊이 있게 배워봅시다.'
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant='outline' onClick={() => form.reset()}><XIcon /> 취소</Button>
            </DialogClose>
            <Button type='submit' form='form-create-group' disabled={isCreating}>{isCreating ? <LoaderCircleIcon className='animate-spin' /> : <PlusIcon />} 생성</Button>
          </DialogFooter>
        </DialogContent>
      </form>
    </Dialog>
  )
}
