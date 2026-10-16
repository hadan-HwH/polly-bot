import { useMemo, useState } from 'react'
import type { NegRiskEventDetail, StrategyType } from '@src/types/negrisk'

interface ConversionSimulatorProps {
  event: NegRiskEventDetail
}

interface SimResult {
  strategy: StrategyType
  quantity: number
  totalCost: number
  totalReturn: number
  gasFees: number
  netProfit: number
  roi: number
}

const GAS_PER_TX = 0.005
const SAFETY_BUFFER = 0.005

export function ConversionSimulator({ event }: ConversionSimulatorProps) {
  const [quantity, setQuantity] = useState(10)
  const [retainMarketId, setRetainMarketId] = useState<string>(
    event.markets[0]?.id ?? '',
  )
  const [strategy, setStrategy] = useState<StrategyType>('NO_CONVERT_ARB')

  const maxQuantity = useMemo(() => {
    if (event.prices.length === 0) return 1
    const depths = event.prices.map((p) =>
      strategy === 'YES_ARB' ? p.yesDepth : p.noDepth,
    )
    return Math.max(1, Math.floor(Math.min(...depths)))
  }, [event.prices, strategy])

  const result = useMemo<SimResult | null>(() => {
    const k = event.numOutcomes
    const j = quantity

    if (strategy === 'YES_ARB') {
      const totalCost = event.prices.reduce(
        (sum, p) => sum + j * (p.yesBestAsk ?? 0),
        0,
      )
      const totalReturn = j
      const gasFees = GAS_PER_TX
      const netProfit = totalReturn - totalCost - gasFees - SAFETY_BUFFER
      const roi = totalCost > 0 ? netProfit / totalCost : 0
      return { strategy, quantity: j, totalCost, totalReturn, gasFees, netProfit, roi }
    }

    const totalCost = event.prices.reduce(
      (sum, p) => sum + j * (p.noBestAsk ?? 0),
      0,
    )
    const totalReturn = j * (k - 1)
    const numConversions = k - 1
    const gasFees = GAS_PER_TX * (numConversions + 1)
    const netProfit = totalReturn - totalCost - gasFees - SAFETY_BUFFER
    const roi = totalCost > 0 ? netProfit / totalCost : 0
    return { strategy, quantity: j, totalCost, totalReturn, gasFees, netProfit, roi }
  }, [quantity, strategy, event])

  return (
    <div className="card">
      <div className="card-body space-y-5">
        <h6 className="text-base font-semibold text-gray-800 dark:text-dark-100">
          Conversion Simulator
        </h6>

        <div>
          <label className="text-sm text-gray-500 dark:text-dark-400 mb-1.5 block">Strategy</label>
          <div className="flex gap-2">
            <button
              className={`btn btn-sm ${strategy === 'YES_ARB' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setStrategy('YES_ARB')}
            >
              YES ARB
            </button>
            <button
              className={`btn btn-sm ${strategy === 'NO_CONVERT_ARB' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setStrategy('NO_CONVERT_ARB')}
            >
              NO CONVERT ARB
            </button>
          </div>
        </div>

        <div>
          <label className="text-sm text-gray-500 dark:text-dark-400 mb-1.5 block">
            Quantity (j):{' '}
            <span className="font-mono font-semibold text-gray-800 dark:text-dark-100">
              {quantity}
            </span>
          </label>
          <input
            type="range"
            min={1}
            max={maxQuantity}
            value={quantity}
            onChange={(e) =>
              setQuantity(
                Math.max(1, Math.min(maxQuantity, parseInt(e.target.value, 10) || 1)),
              )
            }
            className="w-full"
            aria-label="Quantity"
          />
          <div className="flex justify-between text-xs text-gray-400 dark:text-dark-500 mt-1">
            <span>1</span>
            <span>max: {maxQuantity}</span>
          </div>
        </div>

        {strategy === 'NO_CONVERT_ARB' && (
          <div>
            <label className="text-sm text-gray-500 dark:text-dark-400 mb-1.5 block">
              Retain NO Token
            </label>
            <select
              className="form-select w-full"
              value={retainMarketId}
              onChange={(e) => setRetainMarketId(e.target.value)}
              aria-label="Retain NO Token"
            >
              {event.markets.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.question}
                </option>
              ))}
            </select>
          </div>
        )}

        {result && (
          <div className="border-t border-gray-200 dark:border-dark-700 pt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <ResultRow label="Total Cost" value={`$${result.totalCost.toFixed(4)}`} />
              <ResultRow label="Total Return" value={`$${result.totalReturn.toFixed(4)}`} />
              <ResultRow label="Gas Fees" value={`$${result.gasFees.toFixed(4)}`} />
              <ResultRow
                label="Net Profit"
                value={`$${result.netProfit.toFixed(4)}`}
                highlight={result.netProfit > 0 ? 'positive' : 'negative'}
              />
              <ResultRow
                label="ROI"
                value={`${(result.roi * 100).toFixed(2)}%`}
                highlight={result.roi > 0 ? 'positive' : 'negative'}
              />
            </div>

            {result.netProfit <= 0 && (
              <div className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded">
                Warning: This trade would result in a loss after fees.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ResultRow({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: 'positive' | 'negative'
}) {
  const colorClass =
    highlight === 'positive'
      ? 'text-green-600 dark:text-green-400'
      : highlight === 'negative'
        ? 'text-red-600 dark:text-red-400'
        : 'text-gray-800 dark:text-dark-100'

  return (
    <div>
      <p className="text-xs text-gray-500 dark:text-dark-400">{label}</p>
      <p className={`text-sm font-semibold font-mono ${colorClass}`}>{value}</p>
    </div>
  )
}
