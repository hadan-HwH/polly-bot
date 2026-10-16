import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { WsMessage, PriceUpdate, ArbAlert } from '@src/types/ws'
import type { OutcomePrice } from '@src/types/negrisk'
import { getWsConnection } from '@lib/ws/connection'
import { subscribe } from '@lib/ws/channels'

interface NegRiskStreamState {
  prices: Map<string, Map<string, OutcomePrice>>
  alerts: ArbAlert[]
  lastUpdate: string | null
}

type StreamAction =
  | { type: 'PRICE_UPDATE'; payload: PriceUpdate }
  | { type: 'ARB_ALERT'; payload: ArbAlert }
  | { type: 'ARB_EXPIRED'; payload: { eventId: string } }

function reducer(state: NegRiskStreamState, action: StreamAction): NegRiskStreamState {
  switch (action.type) {
    case 'PRICE_UPDATE': {
      const { eventId, tokenId, outcome, price, bestAsk, depth, side } = action.payload
      const eventPrices = new Map(state.prices.get(eventId) ?? new Map<string, OutcomePrice>())
      const existing = eventPrices.get(tokenId)
      const updated: OutcomePrice = {
        tokenId,
        outcome,
        yesPrice: side === 'YES' ? price : (existing?.yesPrice ?? 0),
        noPrice: side === 'NO' ? price : (existing?.noPrice ?? 0),
        yesBestAsk: side === 'YES' ? bestAsk : (existing?.yesBestAsk ?? 0),
        noBestAsk: side === 'NO' ? bestAsk : (existing?.noBestAsk ?? 0),
        yesDepth: side === 'YES' ? depth : (existing?.yesDepth ?? 0),
        noDepth: side === 'NO' ? depth : (existing?.noDepth ?? 0),
      }
      eventPrices.set(tokenId, updated)
      const prices = new Map(state.prices)
      prices.set(eventId, eventPrices)
      return { ...state, prices, lastUpdate: new Date().toISOString() }
    }
    case 'ARB_ALERT': {
      const idx = state.alerts.findIndex(
        (a) => a.eventId === action.payload.eventId && a.strategy === action.payload.strategy,
      )
      const alerts = [...state.alerts]
      if (idx >= 0) {
        alerts[idx] = action.payload
      } else {
        alerts.push(action.payload)
      }
      alerts.sort((a, b) => b.roi - a.roi)
      return { ...state, alerts, lastUpdate: new Date().toISOString() }
    }
    case 'ARB_EXPIRED': {
      return {
        ...state,
        alerts: state.alerts.filter((a) => a.eventId !== action.payload.eventId),
        lastUpdate: new Date().toISOString(),
      }
    }
  }
}

const initialState: NegRiskStreamState = {
  prices: new Map(),
  alerts: [],
  lastUpdate: null,
}

export function useNegRiskStream() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const rafRef = useRef<number | null>(null)
  const pendingActions = useRef<StreamAction[]>([])

  const flushActions = useCallback(() => {
    const actions = pendingActions.current
    pendingActions.current = []
    rafRef.current = null
    for (const action of actions) {
      dispatch(action)
    }
  }, [])

  useEffect(() => {
    const unsub1 = subscribe({ channel: 'negrisk:prices' })
    const unsub2 = subscribe({ channel: 'negrisk:arb' })

    const conn = getWsConnection()
    const unsubMsg = conn.onMessage((event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as WsMessage
        let action: StreamAction | null = null

        if (msg.type === 'price_update') {
          action = { type: 'PRICE_UPDATE', payload: msg.data as PriceUpdate }
        } else if (msg.type === 'arb_alert') {
          action = { type: 'ARB_ALERT', payload: msg.data as ArbAlert }
        } else if (msg.type === 'arb_expired') {
          action = { type: 'ARB_EXPIRED', payload: msg.data as { eventId: string } }
        }

        if (action) {
          pendingActions.current.push(action)
          if (!rafRef.current) {
            rafRef.current = requestAnimationFrame(flushActions)
          }
        }
      } catch {
        // ignore malformed messages
      }
    })

    return () => {
      unsub1()
      unsub2()
      unsubMsg()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [flushActions])

  return state
}
