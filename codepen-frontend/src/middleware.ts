import { NextResponse, NextRequest } from 'next/server'

// [버그 수정] 예전엔 이 파일이 `proxy.ts`라는 이름이었고 함수도 `proxy`라는
// 이름으로 export 돼 있었어요. Next.js는 정확히 `middleware.ts` 파일 안의
// `middleware`라는 이름의 export만 실제 미들웨어로 등록합니다. 즉 이 로그인
// 가드는 이름이 안 맞아서 지금까지 한 번도 실제로 실행된 적이 없었습니다.
// 파일명/함수명을 맞추고, 로그인 없이 접근하면 안 되는 나머지 라우트
// (/problem, /submission)도 matcher에 추가했습니다.
export async function middleware (request: NextRequest) {
  const resp = await fetch(`${request.nextUrl.origin}/api/user/me`, {
    headers: {
      cookie: request.headers.get('cookie') || '',
    },
  })

  if (resp.ok) {
    return NextResponse.next()
  } else {
    return NextResponse.redirect(new URL('/', request.url))
  }
}

export const config = {
  matcher: ['/groups/:path*', '/problem/:path*', '/submission/:path*'],
}
