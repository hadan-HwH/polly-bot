import { apiClient } from './client'
import { transformKeys } from './transform'

export interface TradeParams {
  tokenId: string
  side: 'BUY' | 'SELL'
  price: number
  size: number
  orderType?: 'GTC' | 'FOK' | 'GTD'
}

export interface TradeResult {
  status: string
  dryRun: boolean
  tokenId: string
  side: string
  price: number
  size: number
  orderType: string
  orderId?: string
  message?: string
  response?: Record<string, unknown>
}

export async function placeTrade(params: TradeParams): Promise<TradeResult> {
  const response = await apiClient.post('/trade', {
    token_id: params.tokenId,
    side: params.side,
    price: params.price,
    size: params.size,
    order_type: params.orderType ?? 'GTC',
  })
  return transformKeys<TradeResult>(response.data)
}
