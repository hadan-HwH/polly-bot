import { apiClient } from './client'
import { transformKeys } from './transform'
import type {
  NegRiskEventsResponse,
  NegRiskEventDetail,
  NegRiskArbResponse,
  NegRiskStatsResponse,
  NegRiskNearMissResponse,
  NegRiskExecutionsResponse,
  SimulationParams,
  SimulationResult,
} from '@src/types/negrisk'

async function get<T>(url: string): Promise<T> {
  const response = await apiClient.get(url)
  return transformKeys<T>(response.data)
}

async function post<T>(url: string, data: unknown): Promise<T> {
  const response = await apiClient.post(url, data)
  return transformKeys<T>(response.data)
}

export function getNegRiskEvents(): Promise<NegRiskEventsResponse> {
  return get<NegRiskEventsResponse>('/negrisk-events')
}

export function getNegRiskEventDetail(eventId: string): Promise<NegRiskEventDetail> {
  return get<NegRiskEventDetail>(`/negrisk-events/${eventId}`)
}

export function getNegRiskArb(): Promise<NegRiskArbResponse> {
  return get<NegRiskArbResponse>('/negrisk-arb')
}

export function getNegRiskStats(): Promise<NegRiskStatsResponse> {
  return get<NegRiskStatsResponse>('/negrisk-stats')
}

export function getNegRiskNearMiss(): Promise<NegRiskNearMissResponse> {
  return get<NegRiskNearMissResponse>('/negrisk-near-miss')
}

export function getNegRiskExecutions(): Promise<NegRiskExecutionsResponse> {
  return get<NegRiskExecutionsResponse>('/negrisk-executions')
}

export function simulateArb(params: SimulationParams): Promise<SimulationResult> {
  return post<SimulationResult>('/negrisk-arb/simulate', params)
}
