import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Minus, Plus } from 'lucide-react'
import { placeTrade, type TradeResult } from '@lib/api/trade'
import { getWalletStatus } from '@lib/api/wallet'
import { showToast } from '@components/ui/AppToast'
import { StatusBadge } from '@components/ui'

type Side = 'BUY' | 'SELL'
type Outcome = 'YES' | 'NO'
type OrderMode = 'market' | 'limit'

export interface TradingWidgetProps {
  yesTokenId: string
  noTokenId: string
  yesBestAsk: number | null
  yesBestBid: number | null
  noBestAsk: number | null
  noBestBid: number | null
  onTradeComplete?: (result: TradeResult) => void
}

const SHARE_QUICK = [-100, -10, 10, 100] as const
const AMOUNT_QUICK = [1, 5, 10, 100] as const

export function TradingWidget({
  yesTokenId,
  noTokenId,
  yesBestAsk,
  yesBestBid,
  noBestAsk,
  noBestBid,
  onTradeComplete,
}: TradingWidgetProps) {
  const [side, setSide] = useState<Side>('BUY')
  const [outcome, setOutcome] = useState<Outcome>('YES')
  const [mode, setMode] = useState<OrderMode>('market')
  const [limitPrice, setLimitPrice] = useState(50)
  const [shares, setShares] = useState(0)
  const [amount, setAmount] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [lastResult, setLastResult] = useState<TradeResult | null>(null)

  const isBuy = side === 'BUY'

  const refPrice = useMemo(() => {
    if (outcome === 'YES') return isBuy ? yesBestAsk : yesBestBid
    return isBuy ? noBestAsk : noBestBid
  }, [outcome, isBuy, yesBestAsk, yesBestBid, noBestAsk, noBestBid])

  const displayYesPrice = useMemo(() => {
    const p = isBuy ? yesBestAsk : yesBestBid
    return p !== null ? Math.round(p * 100) : null
  }, [isBuy, yesBestAsk, yesBestBid])

  const displayNoPrice = useMemo(() => {
    const p = isBuy ? noBestAsk : noBestBid
    return p !== null ? Math.round(p * 100) : null
  }, [isBuy, noBestAsk, noBestBid])

  useEffect(() => {
    if (refPrice !== null && mode === 'limit') {
      setLimitPrice(Math.round(refPrice * 100))
    }
  }, [outcome, side])

  const effectivePrice = mode === 'limit' ? limitPrice / 100 : (refPrice ?? 0)

  const total = useMemo(() => {
    if (mode === 'market') return amount
    return shares * effectivePrice
  }, [mode, shares, amount, effectivePrice])

  const toWin = useMemo(() => {
    if (mode === 'market') {
      if (effectivePrice <= 0) return 0
      const impliedShares = amount / effectivePrice
      return isBuy ? impliedShares - amount : amount
    }
    return isBuy ? shares - total : total
  }, [mode, shares, amount, effectivePrice, total, isBuy])

  const tokenId = outcome === 'YES' ? yesTokenId : noTokenId

  const adjustLimit = useCallback((delta: number) => {
    setLimitPrice((p) => Math.max(1, Math.min(99, p + delta)))
  }, [])

  const adjustShares = useCallback((delta: number) => {
    setShares((s) => Math.max(0, s + delta))
  }, [])

  async function handleTrade() {
    const wallet = await getWalletStatus()
    if (!wallet.connected) {
      showToast('error', '지갑을 먼저 연결하세요 (Settings → Wallet)')
      return
    }

    let tradePrice: number
    let tradeSize: number

    if (mode === 'market') {
      if (!refPrice || amount <= 0) {
        showToast('error', '금액을 입력하세요')
        return
      }
      tradePrice = refPrice
      tradeSize = Math.floor(amount / refPrice)
      if (tradeSize <= 0) {
        showToast('error', '금액이 너무 작습니다')
        return
      }
    } else {
      if (limitPrice <= 0 || limitPrice >= 100 || shares <= 0) {
        showToast('error', '가격과 수량을 올바르게 입력하세요')
        return
      }
      tradePrice = limitPrice / 100
      tradeSize = shares
    }

    setSubmitting(true)
    setLastResult(null)
    try {
      const res = await placeTrade({
        tokenId,
        side,
        price: tradePrice,
        size: tradeSize,
        orderType: mode === 'market' ? 'FOK' : 'GTC',
      })
      setLastResult(res)
      const label = `${side} ${outcome}`
      const msg = res.dryRun
        ? `[Dry Run] ${label} ${tradeSize} @ ${(tradePrice * 100).toFixed(0)}¢`
        : `${label} 주문 ${res.status}`
      showToast(
        res.status === 'matched' || res.dryRun ? 'success' : 'info',
        msg,
      )
      onTradeComplete?.(res)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '주문 실패')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="card !mb-0 w-full max-w-sm">
      {/* Buy / Sell tab header */}
      <div className="flex border-b border-gray-200 dark:border-dark-800">
        {(['BUY', 'SELL'] as Side[]).map((s) => (
          <button
            key={s}
            onClick={() => { setSide(s); setLastResult(null) }}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${
              side === s
                ? s === 'BUY'
                  ? 'text-green-600 dark:text-green-400 border-b-2 border-green-500'
                  : 'text-red-600 dark:text-red-400 border-b-2 border-red-500'
                : 'text-gray-400 dark:text-dark-500 hover:text-gray-600 dark:hover:text-dark-300'
            }`}
          >
            {s === 'BUY' ? 'Buy' : 'Sell'}
          </button>
        ))}
        {/* Mode selector */}
        <div className="flex items-center px-4">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as OrderMode)}
            className="form-select input-sm !h-auto !py-1 !px-2 text-xs !w-auto !border-gray-200 dark:!border-dark-700"
          >
            <option value="market">Market</option>
            <option value="limit">Limit</option>
          </select>
        </div>
      </div>

      <div className="card-body space-y-4">
        {/* Outcome selector: Up (YES) / Down (NO) */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => { setOutcome('YES'); setLastResult(null) }}
            className={`py-2.5 rounded-md text-sm font-bold transition-all border ${
              outcome === 'YES'
                ? 'bg-green-500 text-white border-green-500 shadow-sm'
                : 'bg-white dark:bg-dark-900 text-gray-500 dark:text-dark-400 border-gray-200 dark:border-dark-700 hover:border-green-300 dark:hover:border-green-700'
            }`}
          >
            Up{' '}
            <span className="font-mono">
              {displayYesPrice !== null ? `${displayYesPrice}¢` : '—'}
            </span>
          </button>
          <button
            onClick={() => { setOutcome('NO'); setLastResult(null) }}
            className={`py-2.5 rounded-md text-sm font-bold transition-all border ${
              outcome === 'NO'
                ? 'bg-red-500 text-white border-red-500 shadow-sm'
                : 'bg-white dark:bg-dark-900 text-gray-500 dark:text-dark-400 border-gray-200 dark:border-dark-700 hover:border-red-300 dark:hover:border-red-700'
            }`}
          >
            Down{' '}
            <span className="font-mono">
              {displayNoPrice !== null ? `${displayNoPrice}¢` : '—'}
            </span>
          </button>
        </div>

        {/* LIMIT: Price stepper */}
        {mode === 'limit' && (
          <div>
            <label className="form-label">Limit Price</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => adjustLimit(-1)}
                className="btn btn-sm btn-outline-gray btn-icon !size-9"
              >
                <Minus className="size-4" />
              </button>
              <div className="flex-1 text-center">
                <span className="text-xl font-bold font-mono text-gray-800 dark:text-dark-100">
                  {limitPrice}¢
                </span>
              </div>
              <button
                onClick={() => adjustLimit(1)}
                className="btn btn-sm btn-outline-gray btn-icon !size-9"
              >
                <Plus className="size-4" />
              </button>
            </div>
          </div>
        )}

        {/* Input: Shares (limit) or Amount (market) */}
        {mode === 'limit' ? (
          <div>
            <label className="form-label">Shares</label>
            <input
              type="number"
              min={0}
              value={shares || ''}
              onChange={(e) => setShares(Math.max(0, parseInt(e.target.value) || 0))}
              placeholder="0"
              className="form-input text-right font-mono font-semibold"
            />
            <div className="flex gap-1.5 mt-2">
              {SHARE_QUICK.map((q) => (
                <button
                  key={q}
                  onClick={() => adjustShares(q)}
                  className="btn btn-xs btn-outline-gray flex-1"
                >
                  {q > 0 ? `+${q}` : q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <label className="form-label">Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-dark-500 font-semibold">
                $
              </span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={amount || ''}
                onChange={(e) => setAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                placeholder="0"
                className="form-input text-right font-mono font-semibold !pl-7"
              />
            </div>
            <div className="flex gap-1.5 mt-2">
              {AMOUNT_QUICK.map((q) => (
                <button
                  key={q}
                  onClick={() => setAmount((a) => a + q)}
                  className="btn btn-xs btn-outline-gray flex-1"
                >
                  +${q}
                </button>
              ))}
              <button
                onClick={() => setAmount(0)}
                className="btn btn-xs btn-outline-gray flex-1"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Summary row */}
        <div className="border-t border-gray-100 dark:border-dark-700 pt-3 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-dark-400">Total</span>
            <span className="font-mono font-semibold text-gray-800 dark:text-dark-100">
              ${total > 0 ? total.toFixed(2) : '0.00'}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-dark-400">To win</span>
            <span className="font-mono font-semibold text-green-600 dark:text-green-400">
              ${toWin > 0 ? toWin.toFixed(2) : '0.00'}
            </span>
          </div>
        </div>

        {/* Trade button */}
        <button
          onClick={handleTrade}
          disabled={submitting || (mode === 'market' ? amount <= 0 : shares <= 0)}
          className={`btn w-full flex items-center justify-center gap-2 ${
            isBuy ? 'btn-green' : 'btn-red'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {submitting && <Loader2 className="size-4 animate-spin" />}
          {submitting ? '처리 중...' : 'Trade'}
        </button>

        {/* Result feedback */}
        {lastResult && (
          <div className={`rounded-md p-3 text-xs border ${
            lastResult.dryRun
              ? 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800/30 text-yellow-700 dark:text-yellow-400'
              : lastResult.status === 'matched'
                ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800/30 text-green-700 dark:text-green-400'
                : 'bg-gray-50 dark:bg-dark-850 border-gray-200 dark:border-dark-700 text-gray-600 dark:text-dark-300'
          }`}>
            <div className="flex items-center gap-2 mb-1">
              <StatusBadge
                label={lastResult.dryRun ? 'Dry Run' : lastResult.status}
                variant={lastResult.dryRun ? 'warning' : lastResult.status === 'matched' ? 'success' : 'secondary'}
              />
            </div>
            <p>
              {lastResult.side} {lastResult.size} @ {(lastResult.price * 100).toFixed(0)}¢
            </p>
            {lastResult.orderId && (
              <p className="font-mono text-[10px] truncate mt-0.5 opacity-60">
                {lastResult.orderId}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
