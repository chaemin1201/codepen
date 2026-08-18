import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { dateStringify } from '@/lib/date-stringify'

type GroupCardProps = {
  title: string;
  owner: string;
  createdAt: string;
  membersCount: number;
  description?: string | null;
} & React.HTMLAttributes<HTMLDivElement>

export const GroupCard = ({
  title, owner,
  createdAt,
  membersCount,
  description,
  ...props
}: GroupCardProps) => {
  return (
    <Card {...props}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>소유자: {owner}<br />생성 시간: {dateStringify(createdAt)}</CardDescription>
      </CardHeader>
      <CardContent>
        {description && <p className='pb-2'>{description}</p>}
        <p>멤버 수: {membersCount}</p>
      </CardContent>
    </Card>
  )
}
