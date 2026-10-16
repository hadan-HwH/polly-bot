import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import EventDetail from '@pages/negrisk/EventDetail'
import type { NegRiskEventDetail } from '@src/types/negrisk'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async (importOriginal) => {
  const mod = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...mod,
    useNavigate: () => mockNavigate,
    useParams: () => ({ eventId: 'test-event-1' }),
  }
})

vi.mock('@lib/api/negrisk', () => ({
  getNegRiskEventDetail: vi.fn(),
}))

import { getNegRiskEventDetail } from '@lib/api/negrisk'

const mockGetDetail = vi.mocked(getNegRiskEventDetail)

const mockEvent: NegRiskEventDetail = {
  eventId: 'test-event-1',
  title: 'Presidential Election 2026',
  slug: 'presidential-election-2026',
  numOutcomes: 4,
  endDate: '2026-11-03T00:00:00Z',
  yesPriceSum: 0.88,
  noPriceSum: 2.8,
  yesArbCondition: 'Σ YES (0.8800) < 1.00',
  yesArbMet: true,
  noArbCondition: 'Σ NO (2.8000) < 3.00',
  noArbMet: true,
  yesCoverage: '4/4',
  noCoverage: '4/4',
  yesCoveragePct: 1,
  noCoveragePct: 1,
  yesPriceSumActive: 0.88,
  noPriceSumActive: 2.8,
  activeOutcomesYes: 4,
  activeOutcomesNo: 4,
  prices: [
    {
      marketId: 'mkt-1',
      question: 'Candidate Alpha?',
      yesBestAsk: 0.3,
      yesBestBid: 0.29,
      noBestAsk: 0.7,
      noBestBid: 0.69,
      yesDepth: 500,
      noDepth: 300,
    },
    {
      marketId: 'mkt-2',
      question: 'Candidate Beta?',
      yesBestAsk: 0.25,
      yesBestBid: 0.24,
      noBestAsk: 0.75,
      noBestBid: 0.74,
      yesDepth: 400,
      noDepth: 250,
    },
    {
      marketId: 'mkt-3',
      question: 'Candidate Gamma?',
      yesBestAsk: 0.18,
      yesBestBid: 0.17,
      noBestAsk: 0.82,
      noBestBid: 0.81,
      yesDepth: 600,
      noDepth: 350,
    },
    {
      marketId: 'mkt-4',
      question: 'Candidate Delta?',
      yesBestAsk: 0.15,
      yesBestBid: 0.14,
      noBestAsk: 0.53,
      noBestBid: 0.52,
      yesDepth: 350,
      noDepth: 200,
    },
  ],
  markets: [
    {
      id: 'mkt-1',
      question: 'Candidate Alpha?',
      yesTokenId: 'tok-1a',
      noTokenId: 'tok-1b',
      volume: 50000,
      liquidity: 10000,
    },
    {
      id: 'mkt-2',
      question: 'Candidate Beta?',
      yesTokenId: 'tok-2a',
      noTokenId: 'tok-2b',
      volume: 40000,
      liquidity: 8000,
    },
    {
      id: 'mkt-3',
      question: 'Candidate Gamma?',
      yesTokenId: 'tok-3a',
      noTokenId: 'tok-3b',
      volume: 30000,
      liquidity: 6000,
    },
    {
      id: 'mkt-4',
      question: 'Candidate Delta?',
      yesTokenId: 'tok-4a',
      noTokenId: 'tok-4b',
      volume: 20000,
      liquidity: 4000,
    },
  ],
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/negrisk/test-event-1']}>
      <EventDetail />
    </MemoryRouter>,
  )
}

describe('EventDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetDetail.mockResolvedValue(mockEvent)
  })

  it('shows loading state initially', () => {
    mockGetDetail.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(document.querySelector('.spin-loader')).toBeInTheDocument()
  })

  it('renders event title and metadata', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Presidential Election 2026')).toBeInTheDocument()
    })
    expect(screen.getByText('4 outcomes')).toBeInTheDocument()
  })

  it('displays summary stat cards', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Σ YES Prices')).toBeInTheDocument()
    })
    expect(screen.getByText('0.8800')).toBeInTheDocument()
    expect(screen.getByText('Σ NO Prices')).toBeInTheDocument()
    expect(screen.getByText('2.8000')).toBeInTheDocument()
  })

  it('shows strategy condition cards with met/not-met status', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Strategy A: YES ARB')).toBeInTheDocument()
    })
    expect(screen.getByText('Strategy B: NO CONVERT ARB')).toBeInTheDocument()

    const metBadges = screen.getAllByText('Met')
    expect(metBadges.length).toBe(2)
  })

  it('displays condition formulas', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Σ YES (0.8800) < 1.00')).toBeInTheDocument()
    })
    expect(screen.getByText('Σ NO (2.8000) < 3.00')).toBeInTheDocument()
  })

  it('renders price table with all outcomes', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Outcome Prices')).toBeInTheDocument()
    })
    const alphas = screen.getAllByText('Candidate Alpha?')
    expect(alphas.length).toBeGreaterThanOrEqual(1)
    const betas = screen.getAllByText('Candidate Beta?')
    expect(betas.length).toBeGreaterThanOrEqual(1)
    const gammas = screen.getAllByText('Candidate Gamma?')
    expect(gammas.length).toBeGreaterThanOrEqual(1)
    const deltas = screen.getAllByText('Candidate Delta?')
    expect(deltas.length).toBeGreaterThanOrEqual(1)
  })

  it('renders conversion simulator', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Conversion Simulator')).toBeInTheDocument()
    })
    expect(screen.getByText('YES ARB')).toBeInTheDocument()
    expect(screen.getByText('NO CONVERT ARB')).toBeInTheDocument()
  })

  it('navigates back on back button click', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Presidential Election 2026')).toBeInTheDocument()
    })

    await user.click(screen.getByLabelText('Back'))
    expect(mockNavigate).toHaveBeenCalledWith('/negrisk')
  })

  it('shows error state when fetch fails', async () => {
    mockGetDetail.mockRejectedValue(new Error('Server error'))
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument()
    })
    expect(screen.getByText('Retry')).toBeInTheDocument()
  })

  it('shows not-met condition cards when conditions are false', async () => {
    mockGetDetail.mockResolvedValue({
      ...mockEvent,
      yesArbMet: false,
      noArbMet: false,
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Strategy A: YES ARB')).toBeInTheDocument()
    })

    const notMetBadges = screen.getAllByText('Not Met')
    expect(notMetBadges.length).toBe(2)
  })
})
