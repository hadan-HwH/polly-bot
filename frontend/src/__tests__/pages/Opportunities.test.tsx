import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import Opportunities from '@pages/negrisk/Opportunities'
import type { ArbOpportunity } from '@src/types/negrisk'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async (importOriginal) => {
  const mod = await importOriginal<typeof import('react-router-dom')>()
  return { ...mod, useNavigate: () => mockNavigate }
})

vi.mock('@lib/api/negrisk', () => ({
  getNegRiskArb: vi.fn(),
  getNegRiskEvents: vi.fn(),
  getNegRiskNearMiss: vi.fn(),
  getNegRiskExecutions: vi.fn(),
  getNegRiskStats: vi.fn(),
}))

vi.mock('@lib/api/settings', () => ({
  getSettings: vi.fn().mockRejectedValue(new Error('offline')),
}))

vi.mock('@lib/api/wallet', () => ({
  getWalletStatus: vi.fn().mockResolvedValue({ connected: false }),
}))

import {
  getNegRiskArb,
  getNegRiskEvents,
  getNegRiskNearMiss,
  getNegRiskExecutions,
  getNegRiskStats,
} from '@lib/api/negrisk'

const mockGetArb = vi.mocked(getNegRiskArb)
const mockGetEvents = vi.mocked(getNegRiskEvents)

function makeOpp(overrides: Partial<ArbOpportunity> = {}): ArbOpportunity {
  return {
    eventId: 'evt-1',
    eventTitle: 'Who will win the 2026 election?',
    strategy: 'YES_ARB',
    numOutcomes: 4,
    priceSum: 0.88,
    threshold: 1.0,
    margin: 0.12,
    roiPct: 0.1364,
    jMax: 150,
    estimatedProfitUsd: 18.0,
    safetyMargin: 0.02,
    isSafe: true,
    netProfitUsd: 15.5,
    retainNoMarketId: null,
    endDate: null,
    score: 0.82,
    rank: 1,
    scoreBreakdown: {
      roi: 0.9,
      liquidity: 0.8,
      feasibility: 0.7,
      marketSize: 0.6,
      strategy: 0.5,
      expiry: 0.4,
    },
    perMarket: [
      {
        marketId: 'mkt-1',
        question: 'Candidate A?',
        yesPrice: 0.22,
        noPrice: 0.78,
        yesDepth: 500,
        noDepth: 300,
        isRetainTarget: false,
      },
    ],
    timestamp: '2026-03-21T10:00:00Z',
    ...overrides,
  }
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/negrisk']}>
      <Opportunities />
    </MemoryRouter>,
  )
}

describe('Opportunities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetArb.mockResolvedValue({ opportunities: [], count: 0 })
    mockGetEvents.mockResolvedValue({ events: [], count: 0 })
    vi.mocked(getNegRiskNearMiss).mockResolvedValue({ nearMisses: [], count: 0 })
    vi.mocked(getNegRiskExecutions).mockResolvedValue({ executions: [], count: 0 })
    vi.mocked(getNegRiskStats).mockResolvedValue({
      scanner: {},
      detector: {},
      opportunitiesInMemory: 0,
      runtimeSeconds: 0,
    })
  })

  it('shows loading state initially', () => {
    mockGetArb.mockReturnValue(new Promise(() => {}))
    mockGetEvents.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(document.querySelector('.spin-loader')).toBeInTheDocument()
  })

  it('shows empty state when no opportunities', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('No arbitrage opportunities detected')).toBeInTheDocument()
    })
  })

  it('renders opportunities after fetch', async () => {
    const opp = makeOpp()
    mockGetArb.mockResolvedValue({ opportunities: [opp], count: 1 })
    mockGetEvents.mockResolvedValue({ events: [], count: 3 })

    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Who will win the 2026 election?')).toBeInTheDocument()
    })

    const badges = screen.getAllByText('YES ARB')
    expect(badges.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Safe')).toBeInTheDocument()
  })

  it('displays correct stat card values', async () => {
    const opp1 = makeOpp({ roiPct: 0.1, netProfitUsd: 10 })
    const opp2 = makeOpp({
      eventId: 'evt-2',
      strategy: 'NO_CONVERT_ARB',
      roiPct: 0.2,
      netProfitUsd: 20,
      rank: 2,
    })
    mockGetArb.mockResolvedValue({ opportunities: [opp1, opp2], count: 2 })
    mockGetEvents.mockResolvedValue({ events: [], count: 5 })

    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Total Opportunities')).toBeInTheDocument()
    })

    expect(screen.getByText('Best ROI')).toBeInTheDocument()
    const roiTexts = screen.getAllByText('20.00%')
    expect(roiTexts.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('1Y / 1N')).toBeInTheDocument()
  })

  it('filters by strategy', async () => {
    const user = userEvent.setup()
    const opp1 = makeOpp({ eventTitle: 'YES Event', strategy: 'YES_ARB' })
    const opp2 = makeOpp({
      eventId: 'evt-2',
      eventTitle: 'NO Event',
      strategy: 'NO_CONVERT_ARB',
      rank: 2,
    })
    mockGetArb.mockResolvedValue({ opportunities: [opp1, opp2], count: 2 })

    renderPage()
    await waitFor(() => {
      expect(screen.getByText('YES Event')).toBeInTheDocument()
    })
    expect(screen.getByText('NO Event')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'YES ARB' }))
    expect(screen.getByText('YES Event')).toBeInTheDocument()
    expect(screen.queryByText('NO Event')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'NO CONVERT' }))
    expect(screen.queryByText('YES Event')).not.toBeInTheDocument()
    expect(screen.getByText('NO Event')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'All' }))
    expect(screen.getByText('YES Event')).toBeInTheDocument()
    expect(screen.getByText('NO Event')).toBeInTheDocument()
  })

  it('navigates to event detail on row click', async () => {
    const user = userEvent.setup()
    const opp = makeOpp()
    mockGetArb.mockResolvedValue({ opportunities: [opp], count: 1 })

    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Who will win the 2026 election?')).toBeInTheDocument()
    })

    // 기본 뷰(이벤트 그룹): 그룹 안의 기회 행을 클릭
    await user.click(screen.getByText('13.64% ROI'))
    expect(mockNavigate).toHaveBeenCalledWith('/negrisk/evt-1')

    // 플랫 리스트: 이벤트 제목이 상세 페이지 링크
    await user.click(screen.getByRole('button', { name: '이벤트 그룹' }))
    expect(screen.getByRole('link', { name: 'Who will win the 2026 election?' })).toHaveAttribute(
      'href',
      '/negrisk/evt-1',
    )
  })

  it('shows error state and allows retry', async () => {
    const user = userEvent.setup()
    mockGetArb.mockRejectedValueOnce(new Error('Network error'))

    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })

    mockGetArb.mockResolvedValue({ opportunities: [], count: 0 })
    await user.click(screen.getByText('Retry'))
    await waitFor(() => {
      expect(screen.getByText('No arbitrage opportunities detected')).toBeInTheDocument()
    })
  })
})
