import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ConversionSimulator } from '@components/negrisk'
import type { NegRiskEventDetail } from '@src/types/negrisk'

const mockEvent: NegRiskEventDetail = {
  eventId: 'evt-1',
  title: 'Test Event',
  slug: 'test-event',
  numOutcomes: 3,
  endDate: null,
  yesPriceSum: 0.85,
  noPriceSum: 1.7,
  yesArbCondition: null,
  yesArbMet: false,
  noArbCondition: null,
  noArbMet: false,
  yesCoverage: '3/3',
  noCoverage: '3/3',
  yesCoveragePct: 1,
  noCoveragePct: 1,
  yesPriceSumActive: 0.85,
  noPriceSumActive: 1.7,
  activeOutcomesYes: 3,
  activeOutcomesNo: 3,
  prices: [
    {
      marketId: 'mkt-1',
      question: 'Option A?',
      yesBestAsk: 0.3,
      yesBestBid: 0.29,
      noBestAsk: 0.6,
      noBestBid: 0.59,
      yesDepth: 100,
      noDepth: 80,
    },
    {
      marketId: 'mkt-2',
      question: 'Option B?',
      yesBestAsk: 0.25,
      yesBestBid: 0.24,
      noBestAsk: 0.55,
      noBestBid: 0.54,
      yesDepth: 120,
      noDepth: 90,
    },
    {
      marketId: 'mkt-3',
      question: 'Option C?',
      yesBestAsk: 0.3,
      yesBestBid: 0.29,
      noBestAsk: 0.55,
      noBestBid: 0.54,
      yesDepth: 150,
      noDepth: 100,
    },
  ],
  markets: [
    {
      id: 'mkt-1',
      question: 'Option A?',
      yesTokenId: 't1a',
      noTokenId: 't1b',
      volume: 10000,
      liquidity: 5000,
    },
    {
      id: 'mkt-2',
      question: 'Option B?',
      yesTokenId: 't2a',
      noTokenId: 't2b',
      volume: 8000,
      liquidity: 4000,
    },
    {
      id: 'mkt-3',
      question: 'Option C?',
      yesTokenId: 't3a',
      noTokenId: 't3b',
      volume: 6000,
      liquidity: 3000,
    },
  ],
}

describe('ConversionSimulator', () => {
  it('renders the simulator with default NO_CONVERT_ARB strategy', () => {
    render(<ConversionSimulator event={mockEvent} />)
    expect(screen.getByText('Conversion Simulator')).toBeInTheDocument()
    expect(screen.getByText('Total Cost')).toBeInTheDocument()
    expect(screen.getByText('Net Profit')).toBeInTheDocument()
    expect(screen.getByText('ROI')).toBeInTheDocument()
  })

  it('shows retain NO dropdown for NO_CONVERT_ARB', () => {
    render(<ConversionSimulator event={mockEvent} />)
    expect(screen.getByLabelText('Retain NO Token')).toBeInTheDocument()
    expect(screen.getByText('Option A?')).toBeInTheDocument()
    expect(screen.getByText('Option B?')).toBeInTheDocument()
  })

  it('hides retain dropdown when switching to YES_ARB', async () => {
    const user = userEvent.setup()
    render(<ConversionSimulator event={mockEvent} />)

    expect(screen.getByLabelText('Retain NO Token')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'YES ARB' }))
    expect(screen.queryByLabelText('Retain NO Token')).not.toBeInTheDocument()
  })

  it('calculates NO_CONVERT_ARB: total return = j * (k-1)', () => {
    render(<ConversionSimulator event={mockEvent} />)

    // Default quantity is 10, k=3 so totalReturn = 10 * 2 = 20
    expect(screen.getByText('$20.0000')).toBeInTheDocument()
  })

  it('calculates YES_ARB: total return = j', async () => {
    const user = userEvent.setup()
    render(<ConversionSimulator event={mockEvent} />)

    await user.click(screen.getByRole('button', { name: 'YES ARB' }))

    // Default quantity 10, totalReturn = 10
    expect(screen.getByText('$10.0000')).toBeInTheDocument()
  })

  it('updates results when quantity slider changes', () => {
    render(<ConversionSimulator event={mockEvent} />)

    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '50' } })

    // totalCost = 50 * (0.6 + 0.55 + 0.55) = 50 * 1.7 = 85
    // totalReturn = 50 * 2 = 100
    expect(screen.getByText('$85.0000')).toBeInTheDocument()
    expect(screen.getByText('$100.0000')).toBeInTheDocument()
  })

  it('shows max quantity based on min depth', () => {
    render(<ConversionSimulator event={mockEvent} />)
    // min NO depth is 80 (mkt-1), so max = 80
    expect(screen.getByText('max: 80')).toBeInTheDocument()
  })

  it('shows loss warning when profit is negative', () => {
    const expensiveEvent: NegRiskEventDetail = {
      ...mockEvent,
      numOutcomes: 2,
      prices: [
        { ...mockEvent.prices[0]!, noBestAsk: 0.6, noDepth: 100 },
        { ...mockEvent.prices[1]!, noBestAsk: 0.55, noDepth: 100 },
      ],
    }
    render(<ConversionSimulator event={expensiveEvent} />)
    // k=2, totalReturn = j*1, totalCost = j*(0.6+0.55) = j*1.15 > j*1
    expect(
      screen.getByText(/This trade would result in a loss/),
    ).toBeInTheDocument()
  })
})
