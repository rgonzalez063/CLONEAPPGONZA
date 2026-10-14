'use client'
import { useCallback, useEffect, useState } from 'react'
import { getSession } from './store'
import type { Session } from './types'

/** Loads a session. undefined = loading, null = not found. A network or server problem sets `error` instead. */
export function useSession(id: string, onLoad?: (s: Session | null) => void) {
  const [s, setS] = useState<Session | null | undefined>(undefined)
  const [error, setError] = useState('')
  const load = useCallback(() => {
    setError('')
    getSession(id).then((x) => { setS(x); onLoad?.(x) }).catch((e: Error) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  useEffect(load, [load])
  return { s, setS, error, reload: load }
}
