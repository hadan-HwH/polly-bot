export interface Market {
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
  eventId?: string
  prices: MarketPrices
  updatedAt: string
}

export interface MarketPrices {
  yesPrice: number
  noPrice: number
  yesBestAsk: number
  yesBestBid: number
  noBestAsk: number
  noBestBid: number
  lastTradePrice: number
  spread: number
}

export interface OrderBookEntry {
  price: number
  size: number
  cumulativeSize: number
}

export interface OrderBook {
  tokenId: string
  bids: OrderBookEntry[]
  asks: OrderBookEntry[]
  timestamp: string
}
