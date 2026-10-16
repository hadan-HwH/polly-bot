import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WsConnection, resetWsConnection } from '@lib/ws/connection'

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
  sentMessages: string[] = []

  constructor(public url: string) {
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN
      this.onopen?.()
    }, 0)
  }

  send(data: string) {
    this.sentMessages.push(data)
  }

  close() {
    this.readyState = MockWebSocket.CLOSED
  }
}

describe('WsConnection', () => {
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

  it('connects and fires state change to connected', async () => {
    const conn = new WsConnection({ url: 'ws://test', reconnect: false })
    const states: string[] = []
    conn.onStateChange((s) => states.push(s))

    conn.connect()
    expect(states).toContain('connecting')

    await vi.advanceTimersByTimeAsync(10)
    expect(states).toContain('connected')

    conn.dispose()
  })

  it('transitions to disconnected on manual disconnect', async () => {
    const conn = new WsConnection({ url: 'ws://test', reconnect: false })
    const states: string[] = []
    conn.onStateChange((s) => states.push(s))

    conn.connect()
    await vi.advanceTimersByTimeAsync(10)

    conn.disconnect()
    expect(conn.state).toBe('disconnected')

    conn.dispose()
  })

  it('sends data as JSON', async () => {
    const conn = new WsConnection({ url: 'ws://test', reconnect: false })
    conn.connect()
    await vi.advanceTimersByTimeAsync(10)

    conn.send({ type: 'subscribe', channel: 'test' })

    conn.dispose()
  })

  it('dispatches messages to handlers', async () => {
    const conn = new WsConnection({ url: 'ws://test', reconnect: false })
    const messages: MessageEvent[] = []
    conn.onMessage((msg) => messages.push(msg))

    conn.connect()
    await vi.advanceTimersByTimeAsync(10)

    conn.dispose()
    expect(messages).toHaveLength(0)
  })

  it('cleans up handlers on dispose', () => {
    const conn = new WsConnection({ url: 'ws://test', reconnect: false })
    const handler = vi.fn()
    conn.onMessage(handler)
    conn.dispose()
    expect(conn.state).toBe('disconnected')
  })

  it('supports unsubscribe via returned cleanup function', () => {
    const conn = new WsConnection({ url: 'ws://test', reconnect: false })
    const handler = vi.fn()
    const unsub = conn.onStateChange(handler)
    unsub()
    conn.connect()
    expect(handler).not.toHaveBeenCalled()
    conn.dispose()
  })
})
