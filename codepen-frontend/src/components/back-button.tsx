import { useRouter } from 'next/navigation'
import { ArrowLeftIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'

export const BackButton = () => {
  const router = useRouter()

  return (
    <Button
      variant='outline'
      size='icon'
      onClick={() => {
        // [버그 수정] router.push('../')는 실제 방문 이력이 아니라 현재 경로에서
        // 문자열로 한 단계만 잘라내는 방식이라, 페이지 깊이에 따라 엉뚱한 경로로
        // (많은 경우 '/'로) 이동했습니다. 지금 '/'는 무조건 /login으로 리다이렉트
        // 하는 임시 스텁이라, 뒤로가기를 누르면 항상 로그인 화면으로 튕겼던 것입니다.
        // 실제 브라우저 방문 기록을 따라가는 router.back()으로 교체합니다.
        router.back()
      }}
    >
      <ArrowLeftIcon />
    </Button>
  )
}
