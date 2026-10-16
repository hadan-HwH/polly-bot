export type WsMessageType =
  | 'price_update'
  | 'arb_alert'
  | 'arb_expired'
  | 'event_update'
  | 'connection_status'
  | 'error'
  | 'heartbeat'

export interface WsMessage<T = unknown> {
  type: WsMessageType
  channel: string
  data: T
  timestamp: string
}

export interface PriceUpdate {
  eventId: string
  tokenId: string
  outcome: string
  side: 'YES' | 'NO'
  price: number
  bestAsk: number
  bestBid: number
  depth: number
}

export interface ArbAlert {
  eventId: string
  eventTitle: string
  strategy: 'YES_ARB' | 'NO_CONVERT_ARB'
  margin: number
  marginPercent: number
  roi: number
  jMax: number
  detectedAt: string
}

export type WsConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting'

export interface WsSubscription {
  channel: string
  params?: Record<string, string>
}
