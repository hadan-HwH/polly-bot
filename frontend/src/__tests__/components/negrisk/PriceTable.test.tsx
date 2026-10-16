import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PriceTable } from '@components/negrisk'
import type { MarketPrice } from '@src/types/negrisk'

const prices: MarketPrice[] = [
  {
    marketId: 'mkt-1',
    question: 'Candidate A?',
    yesBestAsk: 0.35,
    yesBestBid: 0.34,
    noBestAsk: 0.65,
    noBestBid: 0.64,
    yesDepth: 1200,
    noDepth: 800,
  },
  {
    marketId: 'mkt-2',
    question: 'Candidate B?',
    yesBestAsk: null,
    yesBestBid: null,
    noBestAsk: 0.72,
    noBestBid: 0.71,
    yesDepth: 0,
    noDepth: 500,
  },
]

describe('PriceTable', () => {
  it('renders all outcome questions', () => {
    render(<PriceTable prices={prices} />)
    expect(screen.getByText('Candidate A?')).toBeInTheDocument()
    expect(screen.getByText('Candidate B?')).toBeInTheDocument()
  })

  it('renders price values as cents', () => {
    render(<PriceTable prices={prices} />)
    expect(screen.getByText('35.00¢')).toBeInTheDocument()
    expect(screen.getByText('65.00¢')).toBeInTheDocument()
  })

  it('shows dash for null prices', () => {
    render(<PriceTable prices={prices} />)
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(2)
  })

  it('renders depth values', () => {
    render(<PriceTable prices={prices} />)
    expect(screen.getByText('1,200')).toBeInTheDocument()
    expect(screen.getByText('800')).toBeInTheDocument()
  })

  it('shows RETAIN badge for retain market', () => {
    render(<PriceTable prices={prices} retainMarketId="mkt-1" />)
    expect(screen.getByText('RETAIN')).toBeInTheDocument()
  })

  it('does not show RETAIN badge when no retain market', () => {
    render(<PriceTable prices={prices} />)
    expect(screen.queryByText('RETAIN')).not.toBeInTheDocument()
  })

  it('shows empty message when no prices', () => {
    render(<PriceTable prices={[]} />)
    expect(screen.getByText('No price data available')).toBeInTheDocument()
  })
})
