'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { User } from '@/types/user'

type MeProviderProps = {
  children: React.ReactNode;
}

type MeProviderState = {
  me: User | null;
  refresh: () => void;
}

const initialState: MeProviderState = {
  me: null,
  refresh: () => {},
}

const MeContext = createContext<MeProviderState>(initialState)

export const MeProvider = ({ children }: MeProviderProps) => {
  const [me, setMe] = useState<User | null>(null)

  const refresh = async () => {
    try {
      const response = await fetch('/api/user/me')
      if (response.ok) {
        const data: User = await response.json()
        setMe(data)
      } else {
        setMe(null)
      }
    } catch (error) {
      console.error('Failed to fetch user data:', error)
      setMe(null)
    }
  }

  useEffect(() => {
    // Fetch the current user data from an API or local storage
    const fetchMe = async () => {
      try {
        const response = await fetch('/api/user/me')
        if (response.ok) {
          const data: User = await response.json()
          setMe(data)
        } else {
          setMe(null)
        }
      } catch (error) {
        console.error('Failed to fetch user data:', error)
        setMe(null)
      }
    }

    fetchMe()
  }, [])

  return (
    <MeContext.Provider value={{ me, refresh }}>
      {children}
    </MeContext.Provider>
  )
}

export const useMe = () => {
  const context = useContext(MeContext)

  if (context === undefined) {
    throw new Error('useMe must be used within a MeProvider')
  }

  return context
}
