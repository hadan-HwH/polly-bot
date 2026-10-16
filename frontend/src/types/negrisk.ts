export type StrategyType = 'YES_ARB' | 'NO_CONVERT_ARB'

export interface MarketPrice {
  marketId: string
  question: string
  yesBestAsk: number | null
  yesBestBid: number | null
  noBestAsk: number | null
  noBestBid: number | null
  yesDepth: number
  noDepth: number
  hasPrices?: boolean
  isActive?: boolean
  lastUpdated?: string
}

export interface NegRiskEvent {
  eventId: string
  title: string
  slug: string
  numOutcomes: number
  activeOutcomesYes?: number
  activeOutcomesNo?: number
  endDate: string | null
  yesPriceSum: number | null
  noPriceSum: number | null
  yesPriceSumActive?: number | null
  noPriceSumActive?: number | null
  yesCoverage: string
  noCoverage: string
  yesCoveragePct: number
  noCoveragePct: number
  prices: MarketPrice[]
}

export interface EventMarket {
  id: string
  question: string
  yesTokenId: string
  noTokenId: string
  volume: number
  liquidity: number
}

export interface NegRiskEventDetail extends NegRiskEvent {
  yesArbCondition: string | null
  yesArbMet: boolean
  noArbCondition: string | null
  noArbMet: boolean
  yesCoverage: string
  noCoverage: string
  yesCoveragePct: number
  noCoveragePct: number
  yesPriceSumActive: number | null
  noPriceSumActive: number | null
  activeOutcomesYes: number
  activeOutcomesNo: number
  markets: EventMarket[]
}

export interface ScoreBreakdown {
  roi: number
  liquidity: number
  feasibility: number
  marketSize: number
  strategy: number
  expiry: number
}

export interface PerMarketBreakdown {
  marketId: string
  question: string
  yesPrice: number | null
  noPrice: number | null
  yesDepth: number
  noDepth: number
  isRetainTarget: boolean
  isActive?: boolean
}

export interface ArbOpportunity {
  eventId: string
  eventTitle: string
  strategy: StrategyType
  numOutcomes: number
  activeOutcomes?: number
  priceSum: number
  threshold: number
  margin: number
  roiPct: number
  jMax: number
  estimatedProfitUsd: number
  safetyMargin: number
  isSafe: boolean
  netProfitUsd: number
  retainNoMarketId: string | null
  endDate: string | null
  score: number
  rank: number
  scoreBreakdown: ScoreBreakdown
  perMarket: PerMarketBreakdown[]
  timestamp: string
}

export interface NegRiskEventsResponse {
  events: NegRiskEvent[]
  count: number
}

export interface NegRiskArbResponse {
  opportunities: ArbOpportunity[]
  count: number
}

export interface NegRiskStatsResponse {
  scanner: Record<string, number | boolean>
  detector: Record<string, number>
  opportunitiesInMemory: number
  runtimeSeconds: number
}

export interface SimulationParams {
  eventId: string
  strategy: StrategyType
  quantity: number
  retainNoMarketId?: string
}

export interface ExecutionStep {
  step: number
  action: 'BUY' | 'CONVERT' | 'MERGE' | 'REDEEM'
  description: string
  marketId?: string
  tokenId?: string
  quantity?: number
  price?: number
  cost?: number
}

export interface SimulationResult {
  strategy: StrategyType
  quantity: number
  totalCost: number
  totalReturn: number
  netProfit: number
  roi: number
  steps: ExecutionStep[]
  warnings: string[]
}

export interface NegRiskNearMiss {
  eventId: string
  eventTitle: string
  strategy: string
  numOutcomes: number
  priceSum: number
  threshold: number
  margin: number
  reason: string
  roiPct: number | null
  jMax: number | null
  timestamp: string
}

export interface NegRiskNearMissResponse {
  nearMisses: NegRiskNearMiss[]
  count: number
}

export interface NegRiskExecution {
  timestamp: string
  market: string
  status: string
  totalCost: number
  expectedProfit: number
  profitPct: number
  slug: string
}

export interface NegRiskExecutionsResponse {
  executions: NegRiskExecution[]
  count: number
}

/** WS-specific price tracking used by useNegRiskStream */
export interface OutcomePrice {
  tokenId: string
  outcome: string
  yesPrice: number
  noPrice: number
  yesBestAsk: number
  noBestAsk: number
  yesDepth: number
  noDepth: number
}
