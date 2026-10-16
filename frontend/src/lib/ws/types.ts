export type { WsMessageType, WsMessage, PriceUpdate, ArbAlert, WsConnectionState, WsSubscription } from '@src/types/ws'

export interface WsConfig {
  url: string
  reconnect: boolean
  maxReconnectAttempts: number
  reconnectBaseDelay: number
  reconnectMaxDelay: number
  heartbeatInterval: number
}

export const DEFAULT_WS_CONFIG: WsConfig = {
  url: `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/ws/negrisk`,
  reconnect: true,
  maxReconnectAttempts: Infinity,
  reconnectBaseDelay: 1_000,
  reconnectMaxDelay: 30_000,
  heartbeatInterval: 30_000,
}

export type WsMessageHandler = (message: MessageEvent) => void
export type WsStateHandler = (state: import('@src/types/ws').WsConnectionState) => void
