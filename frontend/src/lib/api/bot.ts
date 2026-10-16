import type { BotStatus, BotConfig } from '@src/types/bot'
import type { ApiResponse } from '@src/types/api'
import { apiGet, apiPost, apiPut } from './client'

export function getBotStatus(): Promise<ApiResponse<BotStatus>> {
  return apiGet<BotStatus>('/bot/status')
}

export function startBot(config?: Partial<BotConfig>): Promise<ApiResponse<BotStatus>> {
  return apiPost<BotStatus>('/bot/start', config)
}

export function stopBot(): Promise<ApiResponse<BotStatus>> {
  return apiPost<BotStatus>('/bot/stop')
}

export function updateBotConfig(config: Partial<BotConfig>): Promise<ApiResponse<BotConfig>> {
  return apiPut<BotConfig>('/bot/config', config)
}

export function getBotConfig(): Promise<ApiResponse<BotConfig>> {
  return apiGet<BotConfig>('/bot/config')
}
