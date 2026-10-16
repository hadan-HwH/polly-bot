import { useCallback, useEffect, useRef, useState } from 'react'
import type { WsMessage, WsMessageType, WsSubscription } from '@src/types/ws'
import { getWsConnection } from '@lib/ws/connection'
import { subscribe } from '@lib/ws/channels'

interface UseRealtimeDataOptions<T> {
  subscription: WsSubscription
  messageType: WsMessageType
  transform?: (data: unknown) => T
  debounceMs?: number
}

export function useRealtimeData<T>(options: UseRealtimeDataOptions<T>): T | null {
  const { subscription, messageType, transform, debounceMs = 0 } = options
  const [data, setData] = useState<T | null>(null)
  const rafRef = useRef<number | null>(null)
  const latestRef = useRef<T | null>(null)

  const flush = useCallback(() => {
    if (latestRef.current !== null) {
      setData(latestRef.current)
      latestRef.current = null
    }
    rafRef.current = null
  }, [])

  useEffect(() => {
    const unsubChannel = subscribe(subscription)

    const conn = getWsConnection()
    const unsubMsg = conn.onMessage((event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as WsMessage
        if (msg.type !== messageType) return
        if (msg.channel !== subscription.channel) return

        const value = transform ? transform(msg.data) : (msg.data as T)
        latestRef.current = value

        if (debounceMs > 0) {
          if (!rafRef.current) {
            rafRef.current = requestAnimationFrame(flush)
          }
        } else {
          setData(value)
        }
      } catch {
        // ignore
      }
    })

    return () => {
      unsubChannel()
      unsubMsg()
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [subscription.channel, messageType, debounceMs, flush, transform, subscription])

  return data
}
