import { apiClient } from './client'
import { transformKeys } from './transform'

export type ScanMode = 'all' | 'binary_only' | 'negrisk_only'

export interface AppSettings {
  dryRun: boolean
  scanMode: ScanMode
  maxPositionSize: number
  minLiquidityUsd: number
  maxDaysUntilResolution: number
  excludedCategories: string[]
  purearbUnwindCategories: string[]
  purearbEnabled: boolean
  purearbAutoExecute: boolean
  minProfitThreshold: number
  negriskEnabled: boolean
  negriskAutoExecute: boolean
  negriskMinOutcomes: number
  negriskMaxOutcomes: number
  negriskNumWsConnections: number
  negriskPriorityCategories: string[]
  negriskSafetyMargin: number
  negriskMinRoi: number
  negriskMaxConcurrentEvents: number
  negriskMinOrderValue: number
  negriskMaxCostPerEvent: number
  negriskYesArbMaxExpiryDays: number
  negriskYesArbMinMargin: number
  purearbOrderType: string
  purearbGtcTimeoutSeconds: number
  slackWebhookUrl: string
  numWsConnections: number
}

export interface UpdateSettingsResponse {
  updated: Record<string, unknown>
  message: string
}

async function get<T>(url: string): Promise<T> {
  const response = await apiClient.get(url)
  return transformKeys<T>(response.data)
}

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
}

export function getSettings(): Promise<AppSettings> {
  return get<AppSettings>('/settings')
}

export async function updateSettings(settings: Partial<AppSettings>): Promise<UpdateSettingsResponse> {
  const snakeBody: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(settings)) {
    snakeBody[camelToSnake(key)] = value
  }
  const response = await apiClient.put('/settings', snakeBody)
  return transformKeys<UpdateSettingsResponse>(response.data)
}

export async function restartScanners(): Promise<{ message: string; numWsConnections: number; maxMarkets: number }> {
  const response = await apiClient.post('/scanner/restart')
  return transformKeys(response.data)
}
