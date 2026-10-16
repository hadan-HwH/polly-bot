import { apiClient } from './client'
import { transformKeys } from './transform'

async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const response = await apiClient.get(url, { params })
  return transformKeys<T>(response.data)
}

export interface NegRiskExecuteParams {
  eventId: string
  strategy: string
  jQuantity: number
  slippageTolerance: number
}

export interface NegRiskExecutionOrder {
  marketId: string
  tokenId: string
  side: string
  price: number
  size: number
  status: string
  orderId: string | null
  filledSize: number
  error: string | null
}

export interface NegRiskExecutionResult {
  eventId: string
  strategy: string
  status: string
  orders: NegRiskExecutionOrder[]
  totalCost: number
  expectedProfit: number
  gasCost: number
  netProfit: number
  jQuantity: number
  conversionSteps: Record<string, unknown>[]
  mergeSteps: Record<string, unknown>[]
  dryRun: boolean
  timestamp: string
  timingMs: number
}

export interface PureArbExecuteParams {
  conditionId: string
  size: number
}

export interface PureArbExecutionResult {
  status: string
  conditionId: string
  slug: string
  market: string
  size: number
  dryRun: boolean
  yesPrice: number
  noPrice: number
  combined: number
  profitPct: number
  totalCost: number
  expectedProfit: number
  yesOrderId: string | null
  noOrderId: string | null
}

export type ExecutionType = 'pure_arb' | 'negrisk'

export interface ExecutionHistoryItem {
  timestamp: string
  market: string
  status: string
  totalCost: number
  expectedProfit: number
  profitPct: number
  slug: string
  executionType: ExecutionType
}

export interface ExecutionHistoryResponse {
  executions: ExecutionHistoryItem[]
  count: number
  offset: number
}

export async function executeNegRisk(params: NegRiskExecuteParams): Promise<NegRiskExecutionResult> {
  const response = await apiClient.post('/execute/negrisk', {
    event_id: params.eventId,
    strategy: params.strategy,
    j_quantity: params.jQuantity,
    slippage_tolerance: params.slippageTolerance,
  })
  return transformKeys<NegRiskExecutionResult>(response.data)
}

export async function executePureArb(params: PureArbExecuteParams): Promise<PureArbExecutionResult> {
  const response = await apiClient.post('/execute/pure-arb', {
    condition_id: params.conditionId,
    size: params.size,
  })
  return transformKeys<PureArbExecutionResult>(response.data)
}

export function getExecutionHistory(limit = 50, offset = 0): Promise<ExecutionHistoryResponse> {
  return get<ExecutionHistoryResponse>('/executions', { limit, offset })
}
