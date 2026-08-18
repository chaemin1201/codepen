'use client'

import { ArrowUpDownIcon } from 'lucide-react'

import { ColumnDef } from '@tanstack/react-table'
import { User } from '@/types/user'
import { Button } from '@/components/ui/button'

export interface UserWithStatus extends User {
  status: 'pending' | 'submitted'
  verificationStatus?: 'verified' | 'tampered' | 'verifying' | 'unknown'
  score?: number | null
}

export const submissionColumns: ColumnDef<UserWithStatus>[] = [
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
    )
  },
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <Button variant='ghost' onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        제출 상태
        <ArrowUpDownIcon className='ml-2 h-4 w-4' />
      </Button>
    ),
    cell: ({ row }) => {
      return <div>{row.original.status === 'submitted' ? '제출 완료' : '제출되지 않음'}</div>
    }
  },
  {
    accessorKey: 'verificationStatus',
    header: ({ column }) => (
      <Button variant='ghost' onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        검증 상태
        <ArrowUpDownIcon className='ml-2 h-4 w-4' />
      </Button>
    ),
    cell: ({ row }) => {
      return <div>{row.original.verificationStatus === 'verified' ? '검증 완료' : row.original.verificationStatus === 'tampered' ? '변조됨' : row.original.verificationStatus === 'verifying' ? '검증 중' : '알 수 없음'}</div>
    }
  },
  {
    accessorKey: 'grade',
    header: ({ column }) => (
      <Button variant='ghost' onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        학년
        <ArrowUpDownIcon className='ml-2 h-4 w-4' />
      </Button>
    )
  },
  {
    accessorKey: 'major',
    header: ({ column }) => (
      <Button variant='ghost' onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        전공
        <ArrowUpDownIcon className='ml-2 h-4 w-4' />
      </Button>
    )
  },
  {
    accessorKey: 'email',
    header: ({ column }) => (
      <Button variant='ghost' onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        메일
        <ArrowUpDownIcon className='ml-2 h-4 w-4' />
      </Button>
    )
  },
  {
    accessorKey: 'score',
    header: ({ column }) => (
      <Button className='text-right' variant='ghost' onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        점수
        <ArrowUpDownIcon className='ml-2 h-4 w-4' />
      </Button>
    ),
    cell: ({ row }) => {
      const score = row.original.score
      return <div className='text-right'>{score !== null && score !== undefined ? score : '-'}</div>
    }
  }
]
