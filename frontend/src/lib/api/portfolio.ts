import { apiClient } from './client'
import { transformKeys } from './transform'

async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const response = await apiClient.get(url, { params })
  return transformKeys<T>(response.data)
}

export interface OpenPosition {
  market: string
  outcome: string
  size: number
  avgPrice: number
  currentPrice: number
  pnl: number
  realizedPnl: number
  initialValue: number
  currentValue: number
  tokenId: string
  status: string
  redeemable: boolean
  endDate: string
}

export interface ClosedPosition {
  timestamp: string
  market: string
  outcome: string
  size: number
  avgPrice: number
  exitPrice: number
  costBasis: number
  realizedValue: number
  realizedPnl: number
  status: string
  redeemed: boolean
}

export interface PositionsResponse {
  open: OpenPosition[]
  closed: OpenPosition[]
  openCount: number
  closedCount: number
}

export interface ClosedPositionsResponse {
  positions: ClosedPosition[]
  count: number
  total: number
  offset: number
  hasMore: boolean
}

export interface BalanceResponse {
  polymarketUsdc: number
  totalUsd: number
  positionsValue: number
  maticBalance?: number
  timestamp: string
  error?: string
}

export interface PnlResponse {
  daily: Record<string, unknown>
  allTime: Record<string, unknown>
  portfolio: {
    startingBalance: number
    currentBalance: number
    pnlUsd: number
    pnlPct: number
    periodStart: string
    periodEnd: string
  }
  expectedProfit: number
  realized: {
    totalPnl: number
    winningPositions: number
    losingPositions: number
    totalPositions: number
    totalCost: number
    totalValue: number
  }
}

export interface RedeemableResponse {
  positions: {
    market: string
    outcome: string
    size: number
    value: number
    pnl: number
  }[]
  count: number
  totalValue: number
  error?: string
}

export interface DailyBalanceChart {
  dates: string[]
  usdc: number[]
  positionsValue: number[]
  total: number[]
  count: number
}

export interface OrdersResponse {
  activeOrders: unknown[]
  recentExecutions: {
    timestamp: string
    market: string
    status: string
    totalCost: number
    expectedProfit: number
    profitPct: number
    timing: Record<string, unknown> | null
  }[]
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

export function getPositions(): Promise<PositionsResponse> {
  return get<PositionsResponse>('/positions')
}

export function getBalance(): Promise<BalanceResponse> {
  return get<BalanceResponse>('/balance')
}

export function getPnl(): Promise<PnlResponse> {
  return get<PnlResponse>('/pnl')
}

export function getClosedPositions(limit = 20, offset = 0): Promise<ClosedPositionsResponse> {
  return get<ClosedPositionsResponse>('/closed-positions', { limit, offset })
}

export function getRedeemable(): Promise<RedeemableResponse> {
  return get<RedeemableResponse>('/redeemable')
}

export async function redeemPositions(): Promise<Record<string, unknown>> {
  const response = await apiClient.post('/redeem')
  return transformKeys<Record<string, unknown>>(response.data)
}

export function getOrders(limit = 50, offset = 0): Promise<OrdersResponse> {
  return get<OrdersResponse>('/orders', { limit, offset })
}

export function getDailyBalanceChart(days = 30): Promise<DailyBalanceChart> {
  return get<DailyBalanceChart>('/charts/daily-balance', { days })
}

export interface FundTransfer {
  id: number
  timestamp: string
  type: 'deposit' | 'withdrawal'
  amount: number
  memo: string
}

export interface FundTransfersResponse {
  transfers: FundTransfer[]
  totalDeposits: number
  totalWithdrawals: number
  netInvested: number
}

export function getFundTransfers(): Promise<FundTransfersResponse> {
  return get<FundTransfersResponse>('/fund-transfers')
}

export interface ActivityItem {
  timestamp: string
  type: string
  side: string
  label: string
  market: string
  size: number
  usdcSize: number
  price: number
  txHash: string
}

export interface ActivityResponse {
  activities: ActivityItem[]
  count: number
  error?: string
}

export function getActivity(): Promise<ActivityResponse> {
  return get<ActivityResponse>('/activity')
}
