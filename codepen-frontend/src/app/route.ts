import { NextRequest, NextResponse } from 'next/server'

// [복구] 로컬 테스트 편하려고 '/'을 무조건 /login으로 보내는 임시 stub(page.tsx)으로
// 바꿔뒀던 걸 원래 로직으로 되돌립니다. 로그인 상태를 확인해서:
// - 로그인 + 가입 완료 → /groups
// - 로그인은 됐지만 아직 가입 안 함(404) → /login?step=2 (가입 폼으로 바로)
// - 로그인 자체가 안 됨 → /login
export async function GET(request: NextRequest) {
  const resp = await fetch(`${request.nextUrl.origin}/api/user/me`, {
    headers: {
      cookie: request.headers.get('cookie') || '',
    },
  })
  if (resp.ok) {
    return NextResponse.redirect(new URL('/groups', request.url))
  } else {
    if (resp.status === 404) {
      return NextResponse.redirect(new URL('/login?step=2', request.url))
    } else {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }
}
