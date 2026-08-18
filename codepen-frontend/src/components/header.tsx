'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, ChevronDown, ChevronUp, UserCog, LogOut, LogIn } from 'lucide-react'

import { useMe } from '@/context/me-provider'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EditStudentDialog } from '@/components/edit-student-dialog'
import { EditProfessorDialog } from '@/components/edit-professor-dialog'
import type { User } from '@/types/user'

interface HeaderProps {
  user?: User | null
  breadcrumbs?: string[]
  onLogout?: () => void
}

export function Header({ user: propUser, breadcrumbs = [], onLogout: propOnLogout }: HeaderProps) {
  const router = useRouter()
  const { me: contextUser } = useMe()

  const user = propUser ?? contextUser

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  // 📌 [추가] 자체적으로 로그아웃을 처리하는 함수
  const handleLogout = async () => {
    if (propOnLogout) {
      propOnLogout()
      return
    }

    try {
      // [수정] 절대경로(localhost:8000)로 직접 호출하면, 로그인 때 쓰인 origin과
      // 달라서 세션 쿠키가 안 실려 로그아웃이 "성공"만 하고 실제로는 아무 효과가
      // 없는 문제가 있었습니다. 다른 API 호출들과 동일하게 상대경로(프록시)로 통일합니다.
      const res = await fetch('/api/user/logout', {
        method: 'GET',
        credentials: 'include',
      })
      
      if (res.ok) {
        // 1. 로그아웃 성공시에만 로그인 페이지로 이동
        window.location.href = '/login'
      } else {
        // 2. 서버 응답 에러 발생 시 알림 후 현재 페이지 유지
        console.error('로그아웃 실패:', res.status)
        alert('로그아웃 처리 중 오류가 발생했습니다. 다시 시도해 주세요.')
      }
    } catch (error) {
      // 3. 네트워크 에러 발생 시 알림 후 현재 페이지 유지
      console.error('로그아웃 요청 네트워크 에러:', error)
      alert('서버와 연결할 수 없습니다. 네트워크 상태를 확인해 주세요.')
    }
  }

  return (
    <>
      <header className='sticky top-0 z-50 w-full bg-[#FCFCFC]/90 backdrop-blur border-b border-[#EBF1F4] px-6 py-3.5 flex items-center justify-between text-[#173A23] font-sans'>
        {/* ... (생략: 왼쪽 로고 및 브레드크럼) ... */}
        <div className='flex items-center gap-2 text-base font-bold'>
          <Link href='/groups' className='hover:opacity-80 transition-opacity'>
            noti world
          </Link>

          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={idx}>
              <ChevronRight className='w-4 h-4 text-gray-400 shrink-0' />
              <span className='text-sm font-semibold text-gray-700 line-clamp-1'>
                {crumb}
              </span>
            </React.Fragment>
          ))}
        </div>

        {/* 오른쪽 영역 */}
        <div className='flex items-center gap-3'>
          {user ? (
            <DropdownMenu onOpenChange={setIsMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button 
                  type='button'
                  className='flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-transparent hover:bg-[#F4F7F6] text-sm font-semibold text-[#173A23] transition-colors cursor-pointer outline-none'
                >
                  <span>{user.username}님</span>
                  {isMenuOpen ? (
                    <ChevronUp className='w-3.5 h-3.5 text-gray-500' />
                  ) : (
                    <ChevronDown className='w-3.5 h-3.5 text-gray-500' />
                  )}
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align='end' className='w-48 bg-white border-[#EBF1F4] shadow-lg rounded-2xl p-1 z-[60]'>
                <DropdownMenuLabel className='text-xs text-gray-500 font-normal px-3 py-1.5'>
                  {user.email || `${user.student_no ?? ''} (${user.role === 'professor' ? '교수' : '학생'})`}
                </DropdownMenuLabel>
                <DropdownMenuSeparator className='bg-[#EBF1F4]' />

                {/* 회원 정보 수정 */}
                <DropdownMenuItem
                  className='cursor-pointer text-sm gap-2.5 px-3 py-2 focus:bg-[#F4F7F6] text-[#173A23] rounded-xl'
                  onClick={() => setIsEditDialogOpen(true)}
                >
                  <UserCog className='w-4 h-4 text-[#589960]' />
                  <span>회원 정보 수정</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator className='bg-[#EBF1F4]' />

                {/* 📌 [수정] onClick={handleLogout} 으로 변경 */}
                <DropdownMenuItem
                  className='cursor-pointer text-sm gap-2.5 px-3 py-2 text-red-600 focus:bg-red-50 focus:text-red-600 rounded-xl'
                  onClick={handleLogout}
                >
                  <LogOut className='w-4 h-4' />
                  <span>로그아웃</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              variant='outline'
              size='sm'
              onClick={() => router.push('/login')}
              className='rounded-xl text-xs border-[#CBD9E1] gap-1.5 font-bold text-[#173A23]'
            >
              <LogIn className='w-3.5 h-3.5' /> 로그인
            </Button>
          )}
        </div>
      </header>

      {/* 회원 정보 수정 Dialog: 역할에 따라 학생용/교수용을 분기합니다 */}
      {user && user.role === 'professor' && (
        <EditProfessorDialog
          user={user}
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
        />
      )}
      {user && user.role !== 'professor' && (
        <EditStudentDialog
          user={user}
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
        />
      )}
    </>
  )
}