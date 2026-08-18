import { useGroup } from '@/context/group-provider'
import { useMe } from '@/context/me-provider'

export const useGroupOwner = () => {
  const { group } = useGroup()
  const { me } = useMe()

  if (!group || !me) {
    return false
  }

  return group.owner.user_id === me.user_id
}
