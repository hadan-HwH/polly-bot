import { apiClient } from './client'
import { transformKeys } from './transform'

export interface MarketsListParams {
  limit?: number
  offset?: number
  sort_by?: 'volume' | 'liquidity'
  category?: string
  search?: string
  min_liquidity?: number
}

export interface MarketListItem {
  conditionId: string
  questionId: string
  question: string
  slug: string
  category: string
  endDate: string | null
  active: boolean
  closed: boolean
  volume: number
  liquidity: number
  negRisk: boolean
  eventId: string
  yesPrice: number
  noPrice: number
  spread: number
}

export interface FiltersApplied {
  minLiquidity: number
  activeOnly: boolean
  excludeExpired: boolean
}

export interface MarketsResponse {
  markets: MarketListItem[]
  total: number | null
  offset: number
  limit: number
  hasMore: boolean
  filtersApplied?: FiltersApplied
}

export interface MarketDetail extends MarketListItem {
  description: string
  eventSlug: string
  tokens: Array<{ token_id?: string; outcome?: string; price?: string }>
  clobTokenIds: string[]
}

async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const response = await apiClient.get(url, { params })
  return transformKeys<T>(response.data)
}

export function getAllMarkets(params?: MarketsListParams): Promise<MarketsResponse> {
  return get<MarketsResponse>('/markets', params as Record<string, unknown>)
}

export function getMarketDetail(slug: string): Promise<MarketDetail> {
  return get<MarketDetail>(`/markets/by-slug/${slug}`)
}

export interface SiblingMarketsResponse {
  markets: MarketListItem[]
  count: number
  eventId: string
}

export function getMarketsByEvent(eventId: string): Promise<SiblingMarketsResponse> {
  return get<SiblingMarketsResponse>(`/markets/by-event/${eventId}`)
}

export interface CategoryInfo {
  name: string
  count: number
}

export interface CategoriesResponse {
  categories: CategoryInfo[]
}

export function getMarketCategories(): Promise<CategoriesResponse> {
  return get<CategoriesResponse>('/market-categories')
}
