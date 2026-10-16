import { apiClient } from './client'
import { transformKeys } from './transform'

async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const response = await apiClient.get(url, { params })
  return transformKeys<T>(response.data)
}

export interface ScannerStatus {
  bot: {
    dryRun: boolean
    minProfit: string
    maxPosition: string
    wallet: string | null
  }
  scanner: {
    markets: number
    priceUpdates: number
    arbitrageAlerts: number
    wsConnected: boolean
    lastUpdate: string | null
  }
  timestamp: string
}

export interface ArbAlertItem {
  timestamp: string
  market: string
  slug: string
  conditionId: string
  profitPct: number
  combined: number
  yesAsk: number
  noAsk: number
  yesLiquidity: number
  noLiquidity: number
  duration?: number
}

export interface AlertsResponse {
  alerts: ArbAlertItem[]
  count: number
  total: number
  offset: number
  hasMore: boolean
}

export interface NearMissItem {
  timestamp: string
  market: string
  slug: string
  profitPct: number
  combined: number
  yesAsk: number
  noAsk: number
  yesLiquidity: number
  noLiquidity: number
  minRequired: number
  reason: string
}

export interface NearMissResponse {
  alerts: NearMissItem[]
  count: number
  total: number
  offset: number
  hasMore: boolean
}

export interface OrderExecution {
  timestamp: string
  market: string
  slug: string
  status: string
  yesOrder: {
    orderId: string | null
    status: string
    price: number
    size: number
    filledSize: number
    error: string | null
  }
  noOrder: {
    orderId: string | null
    status: string
    price: number
    size: number
    filledSize: number
    error: string | null
  }
  totalCost: number
  expectedProfit: number
  profitPct: number
  marketLiquidity: number
}

export interface OrdersResponse {
  activeOrders: unknown[]
  recentExecutions: OrderExecution[]
  stats: {
    totalAttempts: number
    successful: number
    partial: number
    failed: number
    cancelled: number
    totalVolume: number
    totalProfit: number
    successRate: number
  }
  updatedAt: string
}

export interface DailyAlertsChart {
  dates: string[]
  counts: number[]
  count: number
}

export interface ArbWindowStats {
  avgDuration: number
  medianDuration: number
  maxDuration: number
  minDuration: number
  totalWindows: number
  durationBuckets: Record<string, number>
}

export function getScannerStatus(): Promise<ScannerStatus> {
  return get<ScannerStatus>('/status')
}

export function getAlerts(limit = 20, offset = 0): Promise<AlertsResponse> {
  return get<AlertsResponse>('/alerts', { limit, offset })
}

export function getNearMissAlerts(limit = 20, offset = 0): Promise<NearMissResponse> {
  return get<NearMissResponse>('/near-miss-alerts', { limit, offset })
}

export function getOrders(limit = 50, offset = 0): Promise<OrdersResponse> {
  return get<OrdersResponse>('/orders', { limit, offset })
}

export function getDailyAlertsChart(days = 7): Promise<DailyAlertsChart> {
  return get<DailyAlertsChart>('/charts/daily-alerts', { days })
}

export function getArbWindowStats(): Promise<ArbWindowStats> {
  return get<ArbWindowStats>('/arb-window-stats')
}
