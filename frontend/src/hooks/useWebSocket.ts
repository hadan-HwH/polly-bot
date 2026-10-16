import { useCallback, useEffect, useRef, useState } from 'react'
import type { WsConnectionState, WsMessage } from '@src/types/ws'
import { getWsConnection } from '@lib/ws/connection'
import type { WsConfig } from '@lib/ws/types'

interface UseWebSocketReturn {
  state: WsConnectionState
  lastMessage: WsMessage | null
  send: (data: unknown) => void
  connect: () => void
  disconnect: () => void
}

export function useWebSocket(config?: Partial<WsConfig>): UseWebSocketReturn {
  const [state, setState] = useState<WsConnectionState>('disconnected')
  const [lastMessage, setLastMessage] = useState<WsMessage | null>(null)
  const connectionRef = useRef(getWsConnection(config))

  useEffect(() => {
    const conn = connectionRef.current

    const unsubState = conn.onStateChange(setState)
    const unsubMsg = conn.onMessage((event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data as string) as WsMessage
        setLastMessage(parsed)
      } catch {
        // ignore malformed messages
      }
    })

    if (conn.state === 'disconnected') {
      conn.connect()
    }
    setState(conn.state)

    return () => {
      unsubState()
      unsubMsg()
    }
  }, [])

  const send = useCallback((data: unknown) => {
    connectionRef.current.send(data)
  }, [])

  const connect = useCallback(() => {
    connectionRef.current.connect()
  }, [])

  const disconnect = useCallback(() => {
    connectionRef.current.disconnect()
  }, [])

  return { state, lastMessage, send, connect, disconnect }
}
