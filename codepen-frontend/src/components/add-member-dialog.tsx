'use client'

import React from 'react'
import { toast } from 'sonner'
import { PlusIcon, UserPlusIcon, CheckIcon, XIcon, SearchIcon, LoaderCircleIcon } from 'lucide-react'

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
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { fetcher } from '@/lib/fetcher'
import type { User } from '@/types/user'
import type { Group } from '@/types/group'

export type AddMemberDialogProps = {
  group: Group;
  onAdded?: () => void;
}

export const AddMemberDialog = ({ group, onAdded }: AddMemberDialogProps) => {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [searchResults, setSearchResults] = React.useState<User[]>([])
  const [isSearching, setIsSearching] = React.useState(false)
  const [addMemberLoading, setAddMemberLoading] = React.useState<string[]>([])

  const onSearch = async () => {
    setIsSearching(true)
    try {
      const users: User[] = await fetcher(`/api/user/search/${query}`, {
        credentials: 'include',
      })

      setSearchResults(users)
    } catch (err) {
      toast.error('사용자 검색에 실패했습니다. 잠시 후 다시 시도해주세요.')
    }
    setIsSearching(false)
  }

  const onAddMember = async (userId: string) => {
    setAddMemberLoading((prev) => [...prev, userId])
    try {
      await fetcher(`/api/group/${group.group_id}/members/${userId}`, {
        method: 'PUT',
      })

      toast.success('멤버가 성공적으로 추가되었습니다.')
      onAdded?.()
    } catch (err) {
      toast.error('멤버 추가에 실패했습니다. 잠시 후 다시 시도해주세요.')
    }
    setAddMemberLoading((prev) => prev.filter((id) => id !== userId))
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant='outline'><UserPlusIcon /> 멤버 추가</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>멤버 추가</DialogTitle>
          <DialogDescription>
            아래에서 사용자 이름을 검색하여 그룹에 멤버를 추가할 수 있습니다.
          </DialogDescription>
        </DialogHeader>
        <div className='flex gap-2 mb-4'>
          <Input
            placeholder='사용자 이름으로 검색'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isSearching) {
                onSearch()
              }
            }}
          />
          <Button onClick={onSearch} disabled={isSearching}>{isSearching ? <LoaderCircleIcon className='animate-spin' /> : <SearchIcon />} 검색</Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>학번</TableHead>
              <TableHead>이름</TableHead>
              <TableHead>학년</TableHead>
              <TableHead>전공</TableHead>
              <TableHead>메일</TableHead>
              <TableHead>액션</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {searchResults.length === 0
              ? (
                <TableRow>
                  <TableCell colSpan={6} className='text-center'>
                    검색 결과가 없습니다.
                  </TableCell>
                </TableRow>
                )
              : searchResults.map((user) => (
                <TableRow key={user.user_id}>
                  <TableCell>{user.student_no}</TableCell>
                  <TableCell>{user.username}</TableCell>
                  <TableCell>{user.grade}</TableCell>
                  <TableCell>{user.major}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    {group.members.some((member) => member.user_id === user.user_id)
                      ? (
                        <Button
                          variant='outline'
                          size='icon'
                          disabled
                        >
                          <CheckIcon />
                        </Button>
                        )
                      : (
                        <Button
                          variant='outline'
                          size='icon'
                          onClick={() => onAddMember(user.user_id)}
                          disabled={addMemberLoading.includes(user.user_id)}
                        >
                          {addMemberLoading.includes(user.user_id) ? <LoaderCircleIcon className='animate-spin' /> : <PlusIcon />}
                        </Button>
                        )}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
        <DialogFooter>
          <DialogClose asChild>
            <Button><XIcon /> 닫기</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
