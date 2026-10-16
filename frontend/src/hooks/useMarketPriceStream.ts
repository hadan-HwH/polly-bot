import { useCallback, useEffect, useReducer, useRef } from 'react'

const CLOB_WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market'
const RECONNECT_BASE = 1_000
const RECONNECT_MAX = 30_000
const PRICE_HISTORY_MAX = 600

export interface BookLevel {
  price: number
  size: number
}

export interface LastTrade {
  price: number
  side: string
  size: number
  timestamp: string
}

export interface PricePoint {
  time: number
  yesAsk: number
  noAsk: number
}

export interface MarketPriceState {
  yesBestBid: number | null
  yesBestAsk: number | null
  noBestBid: number | null
  noBestAsk: number | null
  yesBestAskSize: number | null
  noBestAskSize: number | null
  yesAsks: BookLevel[]
  yesBids: BookLevel[]
  noAsks: BookLevel[]
  noBids: BookLevel[]
  lastTrade: LastTrade | null
  priceHistory: PricePoint[]
  connected: boolean
  lastUpdate: string | null
}

type Action =
  | { type: 'BOOK'; tokenIndex: 0 | 1; bids: BookLevel[]; asks: BookLevel[] }
  | { type: 'PRICE_CHANGE'; tokenIndex: 0 | 1; bestBid: number | null; bestAsk: number | null }
  | { type: 'LAST_TRADE'; trade: LastTrade }
  | { type: 'CONNECTED' }
  | { type: 'DISCONNECTED' }

const TOP_N = 5

function topLevels(levels: BookLevel[], n: number, desc: boolean): BookLevel[] {
  const sorted = [...levels].sort((a, b) => desc ? b.price - a.price : a.price - b.price)
  return sorted.slice(0, n)
}

function reducer(state: MarketPriceState, action: Action): MarketPriceState {
  const now = new Date().toISOString()

  switch (action.type) {
    case 'BOOK': {
      const bids = topLevels(action.bids, TOP_N, true)
      const asks = topLevels(action.asks, TOP_N, false)
      const bestBid = bids.length > 0 ? bids[0]!.price : null
      const bestAsk = asks.length > 0 ? asks[0]!.price : null
      const bestAskSize = asks.length > 0 ? asks[0]!.size : null

      const next = { ...state, lastUpdate: now }
      if (action.tokenIndex === 0) {
        next.yesBestBid = bestBid
        next.yesBestAsk = bestAsk
        next.yesBestAskSize = bestAskSize
        next.yesBids = bids
        next.yesAsks = asks
      } else {
        next.noBestBid = bestBid
        next.noBestAsk = bestAsk
        next.noBestAskSize = bestAskSize
        next.noBids = bids
        next.noAsks = asks
      }

      if (next.yesBestAsk !== null && next.noBestAsk !== null) {
        const point: PricePoint = { time: Date.now(), yesAsk: next.yesBestAsk, noAsk: next.noBestAsk }
        next.priceHistory = [...state.priceHistory, point].slice(-PRICE_HISTORY_MAX)
      }
      return next
    }

    case 'PRICE_CHANGE': {
      const next = { ...state, lastUpdate: now }
      if (action.tokenIndex === 0) {
        if (action.bestBid !== null) next.yesBestBid = action.bestBid
        if (action.bestAsk !== null) next.yesBestAsk = action.bestAsk
      } else {
        if (action.bestBid !== null) next.noBestBid = action.bestBid
        if (action.bestAsk !== null) next.noBestAsk = action.bestAsk
      }

      if (next.yesBestAsk !== null && next.noBestAsk !== null) {
        const last = state.priceHistory[state.priceHistory.length - 1]
        if (!last || Date.now() - last.time > 1_000) {
          const point: PricePoint = { time: Date.now(), yesAsk: next.yesBestAsk, noAsk: next.noBestAsk }
          next.priceHistory = [...state.priceHistory, point].slice(-PRICE_HISTORY_MAX)
        }
      }
      return next
    }

    case 'LAST_TRADE':
      return { ...state, lastTrade: action.trade, lastUpdate: now }

    case 'CONNECTED':
      return { ...state, connected: true }

    case 'DISCONNECTED':
      return { ...state, connected: false }
  }
}

const initialState: MarketPriceState = {
  yesBestBid: null,
  yesBestAsk: null,
  noBestBid: null,
  noBestAsk: null,
  yesBestAskSize: null,
  noBestAskSize: null,
  yesAsks: [],
  yesBids: [],
  noAsks: [],
  noBids: [],
  lastTrade: null,
  priceHistory: [],
  connected: false,
  lastUpdate: null,
}

export function useMarketPriceStream(yesTokenId: string | undefined, noTokenId: string | undefined) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectDelay = useRef(RECONNECT_BASE)
  const mountedRef = useRef(true)
  const tokenIdsRef = useRef({ yes: yesTokenId, no: noTokenId })
  tokenIdsRef.current = { yes: yesTokenId, no: noTokenId }

  const tokenIndex = useCallback((assetId: string): 0 | 1 | null => {
    if (assetId === tokenIdsRef.current.yes) return 0
    if (assetId === tokenIdsRef.current.no) return 1
    return null
  }, [])

  const handleMessage = useCallback((raw: string) => {
    let data: unknown
    try {
      data = JSON.parse(raw)
    } catch {
      return
    }

    const events = Array.isArray(data) ? data : [data]
    for (const evt of events) {
      if (typeof evt !== 'object' || evt === null) continue
      const e = evt as Record<string, unknown>
      const eventType = e.event_type as string | undefined

      if (eventType === 'book') {
        const idx = tokenIndex(e.asset_id as string)
        if (idx === null) continue
        const parseLevels = (arr: unknown): BookLevel[] => {
          if (!Array.isArray(arr)) return []
          return arr.map((l: Record<string, string>) => ({
            price: parseFloat(l.price || '0'),
            size: parseFloat(l.size || '0'),
          }))
        }
        dispatch({
          type: 'BOOK',
          tokenIndex: idx,
          bids: parseLevels(e.bids),
          asks: parseLevels(e.asks),
        })
      } else if (eventType === 'price_change') {
        const changes = e.price_changes as Array<Record<string, unknown>> | undefined
        if (!changes) continue
        for (const c of changes) {
          const idx = tokenIndex(c.asset_id as string)
          if (idx === null) continue
          dispatch({
            type: 'PRICE_CHANGE',
            tokenIndex: idx,
            bestBid: c.best_bid != null ? parseFloat(String(c.best_bid)) : null,
            bestAsk: c.best_ask != null ? parseFloat(String(c.best_ask)) : null,
          })
        }
      } else if (eventType === 'last_trade_price') {
        const idx = tokenIndex(e.asset_id as string)
        if (idx === null) continue
        dispatch({
          type: 'LAST_TRADE',
          trade: {
            price: parseFloat(String(e.price || '0')),
            side: String(e.side || ''),
            size: parseFloat(String(e.size || '0')),
            timestamp: String(e.timestamp || ''),
          },
        })
      }
    }
  }, [tokenIndex])

  const connect = useCallback(() => {
    if (!yesTokenId || !noTokenId) return
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) return

    const ws = new WebSocket(CLOB_WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return }
      reconnectDelay.current = RECONNECT_BASE
      dispatch({ type: 'CONNECTED' })

      ws.send(JSON.stringify({
        assets_ids: [yesTokenId, noTokenId],
        type: 'market',
      }))
    }

    ws.onmessage = (event) => {
      handleMessage(event.data as string)
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      dispatch({ type: 'DISCONNECTED' })
      const delay = Math.min(reconnectDelay.current + Math.random() * 500, RECONNECT_MAX)
      reconnectDelay.current = Math.min(reconnectDelay.current * 2, RECONNECT_MAX)
      reconnectRef.current = setTimeout(connect, delay)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [yesTokenId, noTokenId, handleMessage])

  useEffect(() => {
    mountedRef.current = true
    connect()

    return () => {
      mountedRef.current = false
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [connect])

  return state
}
