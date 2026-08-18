'use client'

import React from 'react'
import { LoaderCircleIcon, TrashIcon, XIcon, ArrowUpDownIcon } from 'lucide-react'
import { toast } from 'sonner'

import { ColumnDef } from '@tanstack/react-table'
import { User } from '@/types/user'
import { fetcher } from '@/lib/fetcher'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

export interface UserWithGroupIDAndSelfID extends User {
  group_id: number
  current_user_id: string
  onEdited: () => void
}

export const memberColumns: ColumnDef<UserWithGroupIDAndSelfID>[] = [
  {
    accessorKey: 'student_no',
    header: ({ column }) => (
      <Button variant='ghost' onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        학번
        <ArrowUpDownIcon className='ml-2 h-4 w-4' />
      </Button>
    ),
    cell: ({ row }) => {
      return <div className='font-medium'>{row.original.student_no}</div>
    }
  },
  {
    accessorKey: 'username',
    header: ({ column }) => (
      <Button variant='ghost' onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        이름
        <ArrowUpDownIcon className='ml-2 h-4 w-4' />
      </Button>
    ),
  },
  {
    accessorKey: 'grade',
    header: ({ column }) => (
      <Button variant='ghost' onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        학년
        <ArrowUpDownIcon className='ml-2 h-4 w-4' />
      </Button>
    ),
  },
  {
    accessorKey: 'major',
    header: ({ column }) => (
      <Button variant='ghost' onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        전공
        <ArrowUpDownIcon className='ml-2 h-4 w-4' />
      </Button>
    ),
  },
  {
    accessorKey: 'email',
    header: ({ column }) => (
      <Button variant='ghost' onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        메일
        <ArrowUpDownIcon className='ml-2 h-4 w-4' />
      </Button>
    ),
  },
  {
    id: 'remove',
    cell: ({ row }) => {
      const user = row.original
      // seems like cell is indeed a react component, so we can use hooks here
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const [apiLoading, setApiLoading] = React.useState(false)

      if (user.user_id === user.current_user_id) {
        return null
      }

      const onRemoveMember = async () => {
        setApiLoading(true)
        try {
          await fetcher(`/api/group/${user.group_id}/members/${user.user_id}`, {
            method: 'DELETE',
          })

          toast.success('멤버가 성공적으로 제거되었습니다.')
          user.onEdited()
        } catch (err) {
          toast.error('멤버 제거에 실패했습니다. 잠시 후 다시 시도해주세요.')
        }
        setApiLoading(false)
      }

      return (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant='outline' size='icon' className='border-destructive/20 dark:border-destructive/40'>
              <TrashIcon className='text-destructive' />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>멤버 제거</AlertDialogTitle>
              <AlertDialogDescription>
                정말 {user.username} 님을 그룹에서 제거하시겠습니까? 이 작업은 되돌릴 수 없습니다.
                <br />
                {user.username} 님의 제출물도 함께 제거됩니다.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel><XIcon /> 취소</AlertDialogCancel>
              <AlertDialogAction onClick={onRemoveMember} className={buttonVariants({ variant: 'destructive' })} disabled={apiLoading}>
                {apiLoading ? <LoaderCircleIcon className='animate-spin' /> : <TrashIcon />} 제거
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )
    }
  }
]
