import type { WsConnectionState } from '@src/types/ws'
import type { WsConfig, WsMessageHandler, WsStateHandler } from './types'
import { DEFAULT_WS_CONFIG } from './types'

export class WsConnection {
  private ws: WebSocket | null = null
  private config: WsConfig
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private messageHandlers = new Set<WsMessageHandler>()
  private stateHandlers = new Set<WsStateHandler>()
  private _state: WsConnectionState = 'disconnected'
  private disposed = false

  constructor(config?: Partial<WsConfig>) {
    this.config = { ...DEFAULT_WS_CONFIG, ...config }
  }

  get state(): WsConnectionState {
    return this._state
  }

  connect(): void {
    if (this.disposed) return
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return
    }

    this.setState('connecting')

    try {
      this.ws = new WebSocket(this.config.url)
      this.ws.onopen = this.handleOpen
      this.ws.onclose = this.handleClose
      this.ws.onerror = this.handleError
      this.ws.onmessage = this.handleMessage
    } catch {
      this.scheduleReconnect()
    }
  }

  disconnect(): void {
    this.clearTimers()
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
    this.reconnectAttempts = 0
    this.setState('disconnected')
  }

  dispose(): void {
    this.disposed = true
    this.disconnect()
    this.messageHandlers.clear()
    this.stateHandlers.clear()
  }

  send(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  onMessage(handler: WsMessageHandler): () => void {
    this.messageHandlers.add(handler)
    return () => this.messageHandlers.delete(handler)
  }

  onStateChange(handler: WsStateHandler): () => void {
    this.stateHandlers.add(handler)
    return () => this.stateHandlers.delete(handler)
  }

  private setState(state: WsConnectionState): void {
    this._state = state
    this.stateHandlers.forEach((handler) => handler(state))
  }

  private handleOpen = (): void => {
    this.reconnectAttempts = 0
    this.setState('connected')
    this.startHeartbeat()
  }

  private handleClose = (): void => {
    this.clearTimers()
    if (!this.disposed && this.config.reconnect) {
      this.scheduleReconnect()
    } else {
      this.setState('disconnected')
    }
  }

  private handleError = (): void => {
    // onclose will fire after onerror, reconnection handled there
  }

  private handleMessage = (event: MessageEvent): void => {
    this.messageHandlers.forEach((handler) => handler(event))
  }

  private scheduleReconnect(): void {
    if (this.disposed) return
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.setState('disconnected')
      return
    }

    this.setState('reconnecting')
    const jitter = Math.random() * 500
    const backoff = Math.min(
      this.config.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts) + jitter,
      this.config.reconnectMaxDelay,
    )
    this.reconnectAttempts += 1

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, backoff)
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'heartbeat' })
    }, this.config.heartbeatInterval)
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }
}

let _instance: WsConnection | null = null

export function getWsConnection(config?: Partial<WsConfig>): WsConnection {
  if (!_instance) {
    _instance = new WsConnection(config)
  }
  return _instance
}

export function resetWsConnection(): void {
  _instance?.dispose()
  _instance = null
}
