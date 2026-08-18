import { redirect } from 'next/navigation'

export default function Home() {
  // 로그인 페이지 경로가 /login 이라면 아래와 같이 이동시킵니다.
  redirect('/login')
}