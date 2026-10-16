import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WsConnection, getWsConnection, resetWsConnection } from '@lib/ws/connection'

class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readyState = MockWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null

  constructor(public url: string) {
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN
      this.onopen?.()
    }, 0)
  }

  send() {}
  close() {
    this.readyState = MockWebSocket.CLOSED
  }
}

describe('WsConnection singleton', () => {
  let originalWs: typeof globalThis.WebSocket

  beforeEach(() => {
    originalWs = globalThis.WebSocket
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket
    resetWsConnection()
    vi.useFakeTimers()
  })

  afterEach(() => {
    globalThis.WebSocket = originalWs
    vi.useRealTimers()
  })

  it('getWsConnection returns the same instance', () => {
    const a = getWsConnection({ url: 'ws://a' })
    const b = getWsConnection({ url: 'ws://b' })
    expect(a).toBe(b)
  })

  it('resetWsConnection disposes and clears singleton', () => {
    const a = getWsConnection({ url: 'ws://a' })
    resetWsConnection()
    const b = getWsConnection({ url: 'ws://c' })
    expect(a).not.toBe(b)
  })

  it('schedules reconnect on close when reconnect=true', async () => {
    const conn = new WsConnection({
      url: 'ws://test',
      reconnect: true,
      reconnectBaseDelay: 100,
      reconnectMaxDelay: 1000,
      maxReconnectAttempts: 3,
      heartbeatInterval: 30000,
    })

    const states: string[] = []
    conn.onStateChange((s) => states.push(s))

    conn.connect()
    await vi.advanceTimersByTimeAsync(10)

    expect(states).toContain('connected')
    conn.dispose()
  })

  it('does not reconnect when reconnect=false', async () => {
    const conn = new WsConnection({ url: 'ws://test', reconnect: false })

    conn.connect()
    await vi.advanceTimersByTimeAsync(10)

    conn.disconnect()
    expect(conn.state).toBe('disconnected')

    conn.dispose()
  })
})
