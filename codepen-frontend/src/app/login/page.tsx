'use client'

import React, { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import * as z from 'zod'

import './google.css'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Field,
  FieldError,
  FieldGroup,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { useMe } from '@/context/me-provider'

const formSchema = z.object({
  role: z.enum(['student', 'professor']),
  username: z.string().min(1, '이름은 필수입니다.'),
  student_no: z.number().optional(),
  grade: z.number().optional(),
  major: z.string().optional(),
  codepen_username: z.string().optional(),
  department: z.string().optional(),
  position: z.string().optional(),
  office: z.string().optional(),
}).superRefine((data, ctx) => {
  // [수정] 학생/교수 역할에 따라 필수 필드가 다릅니다. role에 따라 조건부로 검증합니다.
  if (data.role === 'student') {
    if (!data.student_no) ctx.addIssue({ code: 'custom', path: ['student_no'], message: '학번은 필수입니다.' })
    if (!data.grade) ctx.addIssue({ code: 'custom', path: ['grade'], message: '학년은 필수입니다.' })
    if (!data.major) ctx.addIssue({ code: 'custom', path: ['major'], message: '전공은 필수입니다.' })
    if (!data.codepen_username) ctx.addIssue({ code: 'custom', path: ['codepen_username'], message: 'CodePen 사용자 이름은 필수입니다.' })
  } else {
    if (!data.department) ctx.addIssue({ code: 'custom', path: ['department'], message: '소속은 필수입니다.' })
    if (!data.position) ctx.addIssue({ code: 'custom', path: ['position'], message: '직위는 필수입니다.' })
    if (!data.office) ctx.addIssue({ code: 'custom', path: ['office'], message: '연구실은 필수입니다.' })
  }
})

const grades = [
  { label: '1학년', value: 1 },
  { label: '2학년', value: 2 },
  { label: '3학년', value: 3 },
  { label: '4학년', value: 4 },
]

function AuthPageContent() {
  // [구조 변경] 기존엔 별도 /register 라우트였지만, 이 페이지 하나로 합쳐지면서
  // "구글 로그인은 했지만 아직 가입 안 한 사용자"를 곧장 2단계로 보낼 방법이
  // 없어졌습니다. 루트의 route.ts가 /login?step=2 로 보내주는 값을 초기값으로 사용합니다.
  const searchParams = useSearchParams()
  const initialStep = searchParams.get('step') === '2' ? 2 : 1
  // 1: 구글 로그인 단계, 2: 회원 정보 입력 단계
  const [step, setStep] = useState<1 | 2>(initialStep)

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      role: 'student',
      username: '',
      student_no: undefined,
      grade: 1,
      major: '',
      codepen_username: '',
      department: '',
      position: '',
      office: '',
    },
  })
  const selectedRole = form.watch('role')
  
  const { refresh } = useMe()
  const router = useRouter()

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    const resp = await fetch('/api/user/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(data),
    })

    if (resp.ok) {
      refresh()
      router.push('/groups')
    } else {
      const { error } = await resp.json()
      if (error === 'User already exists') {
        toast.error('이미 존재하는 사용자입니다. 로그인 페이지로 이동합니다.')
        setStep(1) // 다시 로그인 단계로 이동
      } else if (error === 'Student number already exists') {
        toast.error('이미 존재하는 학번입니다. 학번을 다시 확인해주세요.')
      } else {
        toast.error('회원가입에 실패했습니다. 다시 시도해주세요.')
      }
    }
  }

  // Step 1: 구글 로그인 화면
  if (step === 1) {
    return (
      <div
        className="relative min-h-screen w-full flex items-center justify-center p-4 overflow-hidden"
        style={{ backgroundColor: '#789481' }}
      >
        {/* [좌측 상단] 로고 영역 */}
        <div className="absolute top-10 left-10 z-20 flex items-center gap-3.5 select-none">
          <img
            src="/globe.svg"
            alt="Globe Icon"
            className="w-[42px] h-[42px] object-contain brightness-0 invert drop-shadow-[0_1px_3px_rgba(0,0,0,0.15)]"
          />
          <span className="text-3xl font-semibold tracking-wider text-white uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.2)]">
            NOTI WORLD
          </span>
        </div>

        {/* 로그인 카드 영역 */}
        <Card className="relative z-10 w-full max-w-[500px] border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl rounded-2xl p-8 text-white text-center">
          <div className="mb-1">
            <h1 className="text-3xl font-black text-white uppercase tracking-wider">LOGIN</h1>
            <p className="text-sm text-white/80 mt-1">구글 계정으로 로그인해 주세요.</p>
          </div>

          <CardContent className="p-5 pt-1 flex flex-col items-center w-full">
            <a
              className="gsi-material-button flex items-center w-full !h-14 transition-all hover:bg-neutral-100 active:scale-[0.98] shadow-lg overflow-hidden"
              // [수정] 절대경로(127.0.0.1:8000)로 직접 이동하면 이때 발급되는 세션
              // 쿠키가 그 origin에 묶여서, 이후 다른 화면들이 쓰는 상대경로(/api/...,
              // 프록시를 통해 localhost:3000 기준으로 나가는 요청들)에는 쿠키가 실리지
              // 않습니다. 로그인도 나머지 API 호출과 동일하게 상대경로로 통일합니다.
              href="/api/login"
              style={{
                borderRadius: '9999px',
                backgroundColor: '#ffffff',
                color: '#171717',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                width: '100%',
              }}
            >
              <div className="gsi-material-button-state" />
              <div className="gsi-material-button-content-wrapper w-full flex items-center px-4">
                <div className="gsi-material-button-icon w-6 h-6 flex items-center justify-center shrink-0">
                  <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: 'block', width: '100%', height: '100%' }}>
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                    <path fill="none" d="M0 0h48v48H0z" />
                  </svg>
                </div>
                <span className="gsi-material-button-contents font-bold text-base text-neutral-900 flex-1 text-center pr-6">
                  Sign in with Google
                </span>
              </div>
            </a>

            {/* [로컬 테스트용 - 배포 전 삭제] 구글 로그인 없이 바로 회원가입 폼(2단계)으로 이동 */}
            <button
              type="button"
              onClick={() => router.push('/login?step=2')}
              className="text-xs text-white/50 hover:text-white transition-colors mt-4 underline underline-offset-4"
            >
              (테스트용: 회원정보 입력으로 이동)
            </button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Step 2: 회원가입 단계 화면
  return (
    <div
      className="relative min-h-screen w-full flex items-center justify-center p-4 overflow-hidden"
      style={{ backgroundColor: '#789481' }}
    >
      {/* [좌측 상단] 로고 영역 */}
      <div className="absolute top-10 left-10 z-20 flex items-center gap-3.5 select-none">
        <img
          src="/globe.svg"
          alt="Globe Icon"
          className="w-[42px] h-[42px] object-contain brightness-0 invert drop-shadow-[0_1px_3px_rgba(0,0,0,0.15)]"
        />
        <span className="text-3xl font-semibold tracking-wider text-white uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.2)]">
          NOTI WORLD
        </span>
      </div>

      {/* 회원가입 카드 영역 */}
      <Card className="relative z-10 w-full sm:max-w-lg border border-white/20 bg-white/15 backdrop-blur-xl shadow-2xl rounded-2xl overflow-hidden text-white">
        <CardHeader className="pb-4 pt-8 px-8">
          <CardTitle className="text-2xl font-bold text-white text-center">회원가입</CardTitle>
          <CardDescription className="text-center text-white/80 text-xs font-normal mt-1.5">
            얼마 안남았어요! 나머지 회원 정보를 입력해주세요.
          </CardDescription>
        </CardHeader>

        <CardContent className="pb-4 px-8">
          <form id="form-register" onSubmit={form.handleSubmit(onSubmit)}>
            <FieldGroup className="space-y-3">
              {/* [0. 역할 선택] */}
              <Controller
                name="role"
                control={form.control}
                render={({ field }) => (
                  <div className="flex gap-2 mb-1">
                    <button
                      type="button"
                      onClick={() => field.onChange('student')}
                      className={`flex-1 h-12 rounded-full text-sm font-bold transition-all border ${
                        field.value === 'student'
                          ? 'bg-white text-[#173A23] border-white'
                          : 'bg-white/10 text-white border-white/20 hover:border-white/40'
                      }`}
                    >
                      학생으로 가입
                    </button>
                    <button
                      type="button"
                      onClick={() => field.onChange('professor')}
                      className={`flex-1 h-12 rounded-full text-sm font-bold transition-all border ${
                        field.value === 'professor'
                          ? 'bg-white text-[#173A23] border-white'
                          : 'bg-white/10 text-white border-white/20 hover:border-white/40'
                      }`}
                    >
                      교수로 가입
                    </button>
                  </div>
                )}
              />

              {/* [1. 이름 필드] */}
              <Controller
                name="username"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid} className="flex flex-col m-0 p-0">
                    <Input
                      {...field}
                      id="form-register-username"
                      aria-invalid={fieldState.invalid}
                      placeholder="이름*"
                      required
                      className="h-14 w-full bg-white/10 border border-white/20 hover:border-white/40 focus:border-white text-white placeholder:text-white/60 rounded-full transition-all px-6 text-base outline-none shadow-none"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} className="text-red-300 text-xs mt-1 pl-4" />
                    )}
                  </Field>
                )}
              />

              {selectedRole === 'student' && (
                <>
              {/* [2. 학번 필드] */}
              <Controller
                name="student_no"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid} className="flex flex-col m-0 p-0">
                    <Input
                      id="form-register-student_no"
                      aria-invalid={fieldState.invalid}
                      placeholder="학번*"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      required
                      value={field.value ?? ''}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, '')
                        field.onChange(val ? Number(val) : undefined)
                      }}
                      className="h-14 w-full bg-white/10 border border-white/20 hover:border-white/40 focus:border-white text-white placeholder:text-white/60 rounded-full transition-all px-6 text-base outline-none shadow-none"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} className="text-red-300 text-xs mt-1 pl-4" />
                    )}
                  </Field>
                )}
              />

              {/* [3. 학년 선택 필드] */}
              <Controller
                name="grade"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field orientation="responsive" data-invalid={fieldState.invalid} className="w-full flex flex-col m-0 p-0">
                    <Select
                      name={field.name}
                      value={field.value ? field.value.toString() : ''}
                      onValueChange={(value:string) => field.onChange(Number(value))}
                    >
                      <SelectTrigger
                        id="form-register-grade"
                        aria-invalid={fieldState.invalid}
                        className="!h-14 w-full bg-white/10 border border-white/20 hover:border-white/40 focus:border-white text-white rounded-full transition-all px-6 text-base text-left flex justify-between items-center outline-none shadow-none"
                      >
                        <SelectValue placeholder="학년*" />
                      </SelectTrigger>
                      <SelectContent
                        position="item-aligned"
                        className="bg-white border border-neutral-200 rounded-xl shadow-2xl text-black z-50 overflow-hidden"
                      >
                        {grades.map((grade) => (
                          <SelectItem
                            key={grade.value}
                            value={grade.value.toString()}
                            className="hover:bg-neutral-100 focus:bg-neutral-100 text-black font-semibold cursor-pointer py-3 px-4 transition-colors"
                          >
                            {grade.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} className="text-red-300 text-xs mt-1 pl-4" />
                    )}
                  </Field>
                )}
              />

              {/* [4. 전공 필드] */}
              <Controller
                name="major"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid} className="flex flex-col m-0 p-0">
                    <Input
                      {...field}
                      id="form-register-major"
                      aria-invalid={fieldState.invalid}
                      placeholder="전공*"
                      required
                      className="h-14 w-full bg-white/10 border border-white/20 hover:border-white/40 focus:border-white text-white placeholder:text-white/60 rounded-full transition-all px-6 text-base outline-none shadow-none"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} className="text-red-300 text-xs mt-1 pl-4" />
                    )}
                  </Field>
                )}
              />

              {/* [5. CodePen 필드] */}
              <Controller
                name="codepen_username"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid} className="flex flex-col m-0 p-0">
                    <Input
                      {...field}
                      id="form-register-codepen_username"
                      aria-invalid={fieldState.invalid}
                      placeholder="CodePen 사용자 이름*"
                      required
                      className="h-14 w-full bg-white/10 border border-white/20 hover:border-white/40 focus:border-white text-white placeholder:text-white/60 rounded-full transition-all px-6 text-base outline-none shadow-none"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} className="text-red-300 text-xs mt-1 pl-4" />
                    )}
                  </Field>
                )}
              />
                </>
              )}

              {selectedRole === 'professor' && (
                <>
              {/* [교수 - 소속] */}
              <Controller
                name="department"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid} className="flex flex-col m-0 p-0">
                    <Input
                      {...field}
                      id="form-register-department"
                      aria-invalid={fieldState.invalid}
                      placeholder="소속 학과*"
                      required
                      className="h-14 w-full bg-white/10 border border-white/20 hover:border-white/40 focus:border-white text-white placeholder:text-white/60 rounded-full transition-all px-6 text-base outline-none shadow-none"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} className="text-red-300 text-xs mt-1 pl-4" />
                    )}
                  </Field>
                )}
              />

              {/* [교수 - 직위] */}
              <Controller
                name="position"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid} className="flex flex-col m-0 p-0">
                    <Input
                      {...field}
                      id="form-register-position"
                      aria-invalid={fieldState.invalid}
                      placeholder="직위* (예: 교수, 조교수)"
                      required
                      className="h-14 w-full bg-white/10 border border-white/20 hover:border-white/40 focus:border-white text-white placeholder:text-white/60 rounded-full transition-all px-6 text-base outline-none shadow-none"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} className="text-red-300 text-xs mt-1 pl-4" />
                    )}
                  </Field>
                )}
              />

              {/* [교수 - 연구실] */}
              <Controller
                name="office"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid} className="flex flex-col m-0 p-0">
                    <Input
                      {...field}
                      id="form-register-office"
                      aria-invalid={fieldState.invalid}
                      placeholder="연구실*"
                      required
                      className="h-14 w-full bg-white/10 border border-white/20 hover:border-white/40 focus:border-white text-white placeholder:text-white/60 rounded-full transition-all px-6 text-base outline-none shadow-none"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} className="text-red-300 text-xs mt-1 pl-4" />
                    )}
                  </Field>
                )}
              />
                </>
              )}
            </FieldGroup>
          </form>
        </CardContent>

        {/* 카드 하단 버튼 영역 */}
        <CardFooter className="flex flex-col items-center gap-4 px-8 pb-8 pt-2">
          <Button
            type="submit"
            form="form-register"
            className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold rounded-full text-base shadow-lg transition-all flex items-center justify-center cursor-pointer"
          >
            가입 완료
          </Button>
          
        </CardFooter>
      </Card>
    </div>
  )
}

export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <AuthPageContent />
    </Suspense>
  )
}