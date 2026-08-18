export class FetchError extends Error {
  status: number
  constructor (status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'FetchError'
  }
}

export const fetcher = async <T>(url: string, options?: RequestInit): Promise<T> => {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
  })
  if (!res.ok) {
    throw new FetchError(res.status, 'An error occurred while fetching the data.')
  }
  return res.json()
}
