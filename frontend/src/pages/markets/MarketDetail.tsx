import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, ExternalLink, RefreshCw, Radio, ChevronDown, ChevronUp } from 'lucide-react'
import { StatCard, StatusBadge } from '@components/ui'
import { TradingWidget } from '@components/negrisk'
import { getMarketDetail, getMarketsByEvent, type MarketDetail as MarketDetailType, type MarketListItem } from '@lib/api/markets'
import { useMarketPriceStream, type BookLevel } from '@hooks/useMarketPriceStream'
import ReactApexChart from 'react-apexcharts'
import type { ApexOptions } from 'apexcharts'

export default function MarketDetail() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [market, setMarket] = useState<MarketDetailType | null>(null)
  const [siblings, setSiblings] = useState<MarketListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!slug) return
    try {
      setError(null)
      const res = await getMarketDetail(slug)
      setMarket(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch market')
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (!market?.eventId) {
      setSiblings([])
      return
    }
    let cancelled = false
    getMarketsByEvent(market.eventId)
      .then((res) => {
        if (!cancelled) {
          setSiblings(res.markets.filter((m) => m.slug !== market.slug))
        }
      })
      .catch(() => {
        if (!cancelled) setSiblings([])
      })
    return () => { cancelled = true }
  }, [market?.eventId, market?.slug])

  const yesTokenId = market?.clobTokenIds?.[0]
  const noTokenId = market?.clobTokenIds?.[1]
  const stream = useMarketPriceStream(yesTokenId, noTokenId)

  const yesPrice = stream.yesBestAsk ?? market?.yesPrice ?? null
  const noPrice = stream.noBestAsk ?? market?.noPrice ?? null

  const chartOptions = useMemo<ApexOptions>(() => ({
    chart: {
      id: 'price-live',
      type: 'area',
      animations: { enabled: true, easing: 'linear', dynamicAnimation: { speed: 800 } },
      toolbar: { show: false },
      zoom: { enabled: false },
      background: 'transparent',
      sparkline: { enabled: false },
    },
    colors: ['#22c55e'],
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0.05, stops: [0, 100] } },
    stroke: { curve: 'smooth', width: 2 },
    xaxis: {
      type: 'datetime',
      labels: { show: true, datetimeUTC: false, style: { colors: '#9ca3af', fontSize: '11px' } },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      min: 0,
      max: 1,
      tickAmount: 4,
      labels: {
        formatter: (v: number) => `${(v * 100).toFixed(0)}¢`,
        style: { colors: '#9ca3af', fontSize: '11px' },
      },
    },
    grid: { borderColor: '#374151', strokeDashArray: 3, xaxis: { lines: { show: false } } },
    tooltip: {
      x: { format: 'HH:mm:ss' },
      y: { formatter: (v: number) => `${(v * 100).toFixed(2)}¢` },
      theme: 'dark',
    },
    dataLabels: { enabled: false },
    theme: { mode: 'dark' },
  }), [])

  const chartSeries = useMemo(() => [{
    name: 'YES Ask',
    data: stream.priceHistory.map((p) => ({ x: p.time, y: p.yesAsk })),
  }], [stream.priceHistory])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="spin-loader text-primary-500 size-8" />
      </div>
    )
  }

  if (error || !market) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-500 mb-4">{error || 'Market not found'}</p>
        <button className="btn btn-outline-primary" onClick={() => navigate('/markets')}>
          Back to Markets
        </button>
      </div>
    )
  }

  const polymarketUrl = market.eventSlug
    ? `https://polymarket.com/event/${market.eventSlug}`
    : null

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          className="btn btn-sm btn-outline-gray flex items-center gap-1.5"
          onClick={() => navigate('/markets')}
        >
          <ArrowLeft className="size-4" />
          Back
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h5 className="text-lg font-semibold text-gray-800 dark:text-dark-100 truncate">
              {market.question}
            </h5>
            {market.negRisk && <StatusBadge label="NegRisk" variant="info" />}
            {polymarketUrl && (
              <a
                href={polymarketUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-dark-700 text-gray-600 dark:text-dark-300 hover:bg-gray-200 dark:hover:bg-dark-600 transition-colors"
              >
                <ExternalLink className="size-3" />
                Polymarket
              </a>
            )}
          </div>
          <p className="text-sm text-gray-500 dark:text-dark-400 mt-0.5">
            {market.category || 'Uncategorized'}
            {market.endDate && ` · Expires ${new Date(market.endDate).toLocaleDateString()}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ConnectionBadge connected={stream.connected} />
          <button className="btn btn-sm btn-outline-primary flex items-center gap-1.5" onClick={fetchData}>
            <RefreshCw className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Main content + Trading widget sidebar */}
      <div className="flex flex-col xl:flex-row gap-6 mb-6">
        {/* Left: Chart + Stats + Orderbook */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* Big price display + chart */}
          <div className="card">
            <div className="card-body">
              <div className="flex items-end gap-6 mb-4">
                <div>
                  <p className="text-xs text-green-600 dark:text-green-400 mb-0.5">YES</p>
                  <p className="text-3xl font-mono font-bold text-green-700 dark:text-green-300">
                    {yesPrice !== null ? `${(yesPrice * 100).toFixed(1)}¢` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-red-600 dark:text-red-400 mb-0.5">NO</p>
                  <p className="text-3xl font-mono font-bold text-red-700 dark:text-red-300">
                    {noPrice !== null ? `${(noPrice * 100).toFixed(1)}¢` : '—'}
                  </p>
                </div>
                <div className="flex-1" />
                <div className="text-right text-sm text-gray-500 dark:text-dark-400">
                  {yesPrice !== null && noPrice !== null && (
                    <>
                      <span>Spread {(Math.abs(yesPrice - (1 - noPrice)) * 100).toFixed(2)}¢</span>
                      <span className="mx-2">·</span>
                      <span>Sum {((yesPrice + noPrice) * 100).toFixed(1)}¢</span>
                    </>
                  )}
                </div>
              </div>

              {stream.priceHistory.length > 1 ? (
                <ReactApexChart
                  options={chartOptions}
                  series={chartSeries}
                  type="area"
                  height={220}
                />
              ) : (
                <div className="flex items-center justify-center h-[220px] text-sm text-gray-400 dark:text-dark-500">
                  {stream.connected ? 'Waiting for price data...' : 'Connecting to Polymarket...'}
                </div>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="YES Bid / Ask" value={formatBidAsk(stream.yesBestBid, stream.yesBestAsk)} />
            <StatCard title="NO Bid / Ask" value={formatBidAsk(stream.noBestBid, stream.noBestAsk)} />
            <StatCard title="Volume" value={`$${(market.volume / 1000).toFixed(0)}k`} />
            <StatCard title="Liquidity" value={`$${(market.liquidity / 1000).toFixed(0)}k`} />
          </div>

          {/* Orderbook depth */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <OrderbookCard title="YES Orderbook" bids={stream.yesBids} asks={stream.yesAsks} />
            <OrderbookCard title="NO Orderbook" bids={stream.noBids} asks={stream.noAsks} />
          </div>

          {/* Description + NegRisk — collapsible in left column */}
          {(market.description || (market.negRisk && market.eventId)) && (
            <MarketInfoAccordion
              description={market.description}
              negRisk={market.negRisk}
              eventId={market.eventId}
            />
          )}
        </div>

        {/* Right: Trading widget + Related markets */}
        {yesTokenId && noTokenId && (
          <div className="xl:w-[360px] shrink-0 space-y-5">
            <div className="xl:sticky xl:top-20">
              <TradingWidget
                yesTokenId={yesTokenId}
                noTokenId={noTokenId}
                yesBestAsk={stream.yesBestAsk}
                yesBestBid={stream.yesBestBid}
                noBestAsk={stream.noBestAsk}
                noBestBid={stream.noBestBid}
              />
            </div>
            {siblings.length > 0 && (
              <RelatedMarketsList siblings={siblings} />
            )}
          </div>
        )}
      </div>

    </div>
  )
}

function MarketInfoAccordion({
  description,
  negRisk,
  eventId,
}: {
  description: string
  negRisk: boolean
  eventId: string
}) {
  const [descOpen, setDescOpen] = useState(false)

  const hasDesc = !!description
  const hasNegRisk = negRisk && !!eventId

  return (
    <div className="card !mb-0">
      {hasDesc && (
        <>
          <button
            type="button"
            onClick={() => setDescOpen(!descOpen)}
            className="flex items-center justify-between w-full px-5 py-3.5 text-left hover:bg-gray-50 dark:hover:bg-dark-850 transition-colors"
          >
            <h6 className="text-sm font-semibold text-gray-700 dark:text-dark-200">
              Description
            </h6>
            {descOpen
              ? <ChevronUp className="size-4 text-gray-400" />
              : <ChevronDown className="size-4 text-gray-400" />}
          </button>
          {descOpen && (
            <div className="px-5 pb-4">
              <p className="text-sm text-gray-600 dark:text-dark-300 whitespace-pre-wrap leading-relaxed">
                {description}
              </p>
              {hasNegRisk && (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-dark-700">
                  <Link to={`/negrisk/${eventId}`} className="btn btn-xs btn-sub-primary">
                    View NegRisk Event Detail
                  </Link>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {hasNegRisk && !hasDesc && (
        <div className="px-5 py-3.5">
          <Link to={`/negrisk/${eventId}`} className="btn btn-xs btn-sub-primary">
            View NegRisk Event Detail
          </Link>
        </div>
      )}
    </div>
  )
}

function RelatedMarketsList({ siblings }: { siblings: MarketListItem[] }) {
  return (
    <div className="card !mb-0">
      <div className="px-5 py-3.5">
        <h6 className="text-sm font-semibold text-gray-700 dark:text-dark-200">
          Related
          <span className="ml-1.5 text-xs font-normal text-gray-400 dark:text-dark-500">
            {siblings.length}
          </span>
        </h6>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-dark-800">
        {siblings.map((sib) => (
          <Link
            key={sib.conditionId}
            to={`/markets/${sib.slug}`}
            className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-dark-850 transition-colors group"
          >
            <div className="flex-1 min-w-0 mr-3">
              <p className="text-sm text-gray-800 dark:text-dark-100 truncate group-hover:text-primary-500 transition-colors">
                {sib.question}
              </p>
              <p className="text-xs text-gray-400 dark:text-dark-500 mt-0.5">
                ${(sib.volume / 1000).toFixed(0)}k Vol.
              </p>
            </div>
            <span className="shrink-0 font-mono text-sm font-semibold text-green-600 dark:text-green-400">
              {sib.yesPrice > 0 ? `${Math.round(sib.yesPrice * 100)}%` : '—'}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}

function ConnectionBadge({ connected }: { connected: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
      connected
        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
        : 'bg-gray-100 dark:bg-dark-700 text-gray-500 dark:text-dark-400'
    }`}>
      <Radio className={`size-3 ${connected ? 'animate-pulse' : ''}`} />
      {connected ? 'Live' : 'Connecting'}
    </span>
  )
}

function formatBidAsk(bid: number | null, ask: number | null): string {
  const b = bid !== null ? `${(bid * 100).toFixed(1)}` : '—'
  const a = ask !== null ? `${(ask * 100).toFixed(1)}` : '—'
  return `${b} / ${a}¢`
}

function OrderbookCard({ title, bids, asks }: { title: string; bids: BookLevel[]; asks: BookLevel[] }) {
  const empty = bids.length === 0 && asks.length === 0
  return (
    <div className="card">
      <div className="card-body">
        <h6 className="text-sm font-semibold text-gray-700 dark:text-dark-200 mb-3">{title}</h6>
        {empty ? (
          <p className="text-sm text-gray-400 dark:text-dark-500 text-center py-4">Waiting for orderbook data...</p>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-green-600 dark:text-green-400 mb-1.5 font-medium">Bids</p>
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="text-gray-400">
                    <td className="pb-1">Price</td>
                    <td className="pb-1 text-right">Size</td>
                  </tr>
                </thead>
                <tbody>
                  {bids.map((b, i) => (
                    <tr key={i} className="text-green-700 dark:text-green-400">
                      <td className="py-0.5">{(b.price * 100).toFixed(1)}¢</td>
                      <td className="py-0.5 text-right">{b.size.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <p className="text-xs text-red-600 dark:text-red-400 mb-1.5 font-medium">Asks</p>
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="text-gray-400">
                    <td className="pb-1">Price</td>
                    <td className="pb-1 text-right">Size</td>
                  </tr>
                </thead>
                <tbody>
                  {asks.map((a, i) => (
                    <tr key={i} className="text-red-700 dark:text-red-400">
                      <td className="py-0.5">{(a.price * 100).toFixed(1)}¢</td>
                      <td className="py-0.5 text-right">{a.size.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
