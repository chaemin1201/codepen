export const dateStringify = (dateString: string, withTime = true) => {
  const date = new Date(dateString + 'Z') // consider as UTC date
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: withTime ? 'numeric' : undefined,
    minute: withTime ? '2-digit' : undefined,
    second: withTime ? '2-digit' : undefined,
  })
}
