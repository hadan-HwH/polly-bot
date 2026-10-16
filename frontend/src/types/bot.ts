export type BotMode = 'negrisk' | 'pure_arb' | 'both'
export type BotState = 'running' | 'stopped' | 'error' | 'starting' | 'stopping'

export interface BotStatus {
  state: BotState
  mode: BotMode
  uptime: number
  eventsTracked: number
  opportunitiesFound: number
  lastScanAt: string | null
  wsConnections: WsConnectionInfo[]
  errors: BotError[]
}

export interface WsConnectionInfo {
  name: string
  url: string
  connected: boolean
  subscribedTokens: number
  lastMessageAt: string | null
}

export interface BotError {
  code: string
  message: string
  timestamp: string
  resolved: boolean
}

export interface BotConfig {
  mode: BotMode
  minRoi: number
  minLiquidity: number
  maxSlippage: number
  safetyMarginBuffer: number
  purearbAutoExecute: boolean
  negriskAutoExecute: boolean
  notificationsEnabled: boolean
}
