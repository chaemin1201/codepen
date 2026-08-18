'use client'

import React from 'react'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { LogOutIcon, SunIcon, MoonIcon, EditIcon } from 'lucide-react'

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu'
import { EditStudentDialog } from '@/components/edit-student-dialog'
import { EditProfessorDialog } from '@/components/edit-professor-dialog'
import type { User } from '@/types/user'

type NavigationBarProps = {
  user: User | null;
}

export const NavigationBar = ({
  user,
}: NavigationBarProps) => {
  const [open, setOpen] = React.useState(false)
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <>
      <NavigationMenu className='flex items-center justify-between max-w-full'>
        <NavigationMenuList className='wrap'>
          <NavigationMenuItem>
            <NavigationMenuLink asChild className={navigationMenuTriggerStyle()}>
              <Link href='/'>Noti World</Link>
            </NavigationMenuLink>
          </NavigationMenuItem>
        </NavigationMenuList>
        <NavigationMenuList className='wrap'>
          <NavigationMenuItem>
            <NavigationMenuTrigger><span className='font-bold'>{user ? user.username : 'Guest'}</span>&nbsp;님</NavigationMenuTrigger>
            <NavigationMenuContent className='md:w-36'>
              <NavigationMenuLink className='flex flex-row gap-2 items-center cursor-pointer' onClick={() => setTheme(resolvedTheme === 'light' ? 'dark' : 'light')}>
                <SunIcon className='block dark:hidden' />
                <MoonIcon className='hidden dark:block' />
                테마 변경
              </NavigationMenuLink>
              <NavigationMenuLink className='flex flex-row gap-2 items-center cursor-pointer' onClick={() => setOpen(true)}>
                <EditIcon />
                회원 정보 수정
              </NavigationMenuLink>
              <NavigationMenuLink asChild>
                <Link href='/api/logout' className='flex-row items-center gap-2'>
                  <LogOutIcon />
                  로그아웃
                </Link>
              </NavigationMenuLink>
            </NavigationMenuContent>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
      {user?.role === 'student' && (<EditStudentDialog user={user} open={open} onOpenChange={setOpen} />)}
      {user?.role === 'professor' && (<EditProfessorDialog user={user} open={open} onOpenChange={setOpen} />)}
    </>
  )
}
