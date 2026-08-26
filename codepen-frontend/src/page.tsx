// app/page.tsx
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function HomePage() {
  const reqHeaders = await headers()
  const cookieHeader = reqHeaders.get('cookie') || ''

  let status = 401

  try {
    // 💡 NEXT_PUBLIC_... 대신 FastAPI 서버 주소(예: http://localhost:8000)를 직접 넣어보세요!
    const resp = await fetch('http://localhost:8000/user/me', {
      headers: {
        cookie: cookieHeader,
      },
      cache: 'no-store',
    })

    status = resp.status
  } catch (error) {
    // FastAPI 서버가 꺼져있거나 통신 실패 시 바로 로그인으로 이동
    redirect('/login')
  }

  // FastAPI 상태코드 기준 분기
  if (status === 200) {
    redirect('/groups')
  } else if (status === 404) {
    redirect('/login?step=2')
  } else {
    // 401 (비로그인) 포함 나머지는 전부 로그인 페이지로!
    redirect('/login')
  }
}