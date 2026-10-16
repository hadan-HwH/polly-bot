import type { WsSubscription } from '@src/types/ws'
import { getWsConnection } from './connection'

const activeSubscriptions = new Map<string, number>()

function channelKey(sub: WsSubscription): string {
  const paramStr = sub.params ? JSON.stringify(sub.params) : ''
  return `${sub.channel}:${paramStr}`
}

export function subscribe(subscription: WsSubscription): () => void {
  const key = channelKey(subscription)
  const count = activeSubscriptions.get(key) ?? 0
  activeSubscriptions.set(key, count + 1)

  if (count === 0) {
    const conn = getWsConnection()
    conn.send({ type: 'subscribe', channel: subscription.channel, params: subscription.params })
  }

  return () => unsubscribe(subscription)
}

function unsubscribe(subscription: WsSubscription): void {
  const key = channelKey(subscription)
  const count = activeSubscriptions.get(key) ?? 0

  if (count <= 1) {
    activeSubscriptions.delete(key)
    const conn = getWsConnection()
    conn.send({ type: 'unsubscribe', channel: subscription.channel, params: subscription.params })
  } else {
    activeSubscriptions.set(key, count - 1)
  }
}

export function getActiveSubscriptions(): ReadonlyMap<string, number> {
  return activeSubscriptions
}
