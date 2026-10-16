import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Calendar,
  Hash,
  RefreshCw,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { StatCard } from '@components/ui'
import { PriceTable, ConversionSimulator, TradingWidget } from '@components/negrisk'
import { getNegRiskEventDetail } from '@lib/api/negrisk'
import type { NegRiskEventDetail as EventDetailType } from '@src/types/negrisk'

export default function EventDetail() {
  const { eventId } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const [event, setEvent] = useState<EventDetailType | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!eventId) return
    try {
      setError(null)
      const data = await getNegRiskEventDetail(eventId)
      setEvent(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch event')
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="spin-loader text-primary-500 size-8" />
      </div>
    )
  }

  if (error || !event) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-red-500">{error ?? 'Event not found'}</p>
        <div className="flex gap-3">
          <button
            className="btn btn-sm btn-outline-primary"
            onClick={() => navigate('/negrisk')}
          >
            <ArrowLeft className="size-4 mr-1" />
            Back
          </button>
          <button className="btn btn-sm btn-primary" onClick={fetchData}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => navigate('/negrisk')}
          aria-label="Back"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div className="flex-1">
          <h5 className="text-lg font-semibold text-gray-800 dark:text-dark-100">
            {event.title}
          </h5>
          <div className="flex items-center gap-4 mt-1 text-sm text-gray-500 dark:text-dark-400">
            <span className="flex items-center gap-1">
              <Hash className="size-3.5" />
              {event.numOutcomes} outcomes
            </span>
            {event.endDate && (
              <span className="flex items-center gap-1">
                <Calendar className="size-3.5" />
                {new Date(event.endDate).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        <button
          className="btn btn-sm btn-outline-primary flex items-center gap-1.5"
          onClick={fetchData}
        >
          <RefreshCw className="size-3.5" />
          Refresh
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-6">
        <StatCard
          title="Σ YES Prices"
          value={event.yesPriceSum != null ? event.yesPriceSum.toFixed(4) : '—'}
        />
        <StatCard
          title="Σ NO Prices"
          value={event.noPriceSum != null ? event.noPriceSum.toFixed(4) : '—'}
        />
        <StatCard title="Outcomes" value={event.numOutcomes} />
        <StatCard title="Markets" value={event.markets.length} />
      </div>

      {/* Strategy Conditions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <ConditionCard
          title="Strategy A: YES ARB"
          condition={event.yesArbCondition}
          met={event.yesArbMet}
          description="Buy all YES tokens → merge complete set → $1 per share"
          colorClass="blue"
        />
        <ConditionCard
          title="Strategy B: NO CONVERT ARB"
          condition={event.noArbCondition}
          met={event.noArbMet}
          description="Buy all NO tokens → convert to YES → merge → $(k-1) per share"
          colorClass="green"
        />
      </div>

      {/* Price Table */}
      <div className="card mb-6">
        <div className="card-body">
          <h6 className="text-base font-semibold text-gray-800 dark:text-dark-100 mb-4">
            Outcome Prices
          </h6>
          <PriceTable prices={event.prices} />
        </div>
      </div>

      {/* Manual Trade per Outcome */}
      {event.markets.length > 0 && (
        <OutcomeTradeSection event={event} />
      )}

      {/* Conversion Simulator */}
      {event.markets.length > 0 && <ConversionSimulator event={event} />}
    </div>
  )
}

function ConditionCard({
  title,
  condition,
  met,
  description,
  colorClass,
}: {
  title: string
  condition: string | null
  met: boolean
  description: string
  colorClass: 'blue' | 'green'
}) {
  const bgClass =
    colorClass === 'blue'
      ? met
        ? 'border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/10'
        : 'border-gray-200 dark:border-dark-700'
      : met
        ? 'border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-900/10'
        : 'border-gray-200 dark:border-dark-700'

  return (
    <div className={`card border ${bgClass}`}>
      <div className="card-body">
        <div className="flex items-center justify-between mb-3">
          <h6 className="text-sm font-semibold text-gray-800 dark:text-dark-100">
            {title}
          </h6>
          {met ? (
            <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <CheckCircle className="size-4" /> Met
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-dark-500">
              <XCircle className="size-4" /> Not Met
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 dark:text-dark-400 mb-2">
          {description}
        </p>
        {condition ? (
          <code className="text-sm font-mono bg-gray-100 dark:bg-dark-800 px-2 py-1 rounded">
            {condition}
          </code>
        ) : (
          <span className="text-sm text-gray-400 dark:text-dark-500">
            No price data
          </span>
        )}
      </div>
    </div>
  )
}

function OutcomeTradeSection({ event }: { event: EventDetailType }) {
  const [expanded, setExpanded] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)

  const priceMap = useMemo(
    () => new Map(event.prices.map((p) => [p.marketId, p])),
    [event.prices],
  )

  const selected = event.markets[selectedIdx]
  const mp = selected ? priceMap.get(selected.id) : undefined

  if (event.markets.length === 0) return null

  return (
    <div className="card mb-6">
      <div className="card-body">
        <button
          type="button"
          className="flex items-center justify-between w-full text-left"
          onClick={() => setExpanded(!expanded)}
        >
          <h6 className="text-base font-semibold text-gray-800 dark:text-dark-100">
            수동 거래
          </h6>
          {expanded ? (
            <ChevronUp className="size-5 text-gray-400" />
          ) : (
            <ChevronDown className="size-5 text-gray-400" />
          )}
        </button>

        {expanded && selected && (
          <div className="mt-4 space-y-4">
            {event.markets.length > 1 && (
              <div>
                <label className="text-xs text-gray-500 dark:text-dark-400 mb-1.5 block">
                  Outcome 선택
                </label>
                <select
                  value={selectedIdx}
                  onChange={(e) => setSelectedIdx(Number(e.target.value))}
                  className="form-select text-sm w-full"
                >
                  {event.markets.map((m, i) => (
                    <option key={m.id} value={i}>
                      {m.question}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex justify-center">
              <TradingWidget
                yesTokenId={selected.yesTokenId}
                noTokenId={selected.noTokenId}
                yesBestAsk={mp?.yesBestAsk ?? null}
                yesBestBid={mp?.yesBestBid ?? null}
                noBestAsk={mp?.noBestAsk ?? null}
                noBestBid={mp?.noBestBid ?? null}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
