import { useState } from 'react'
import { ShoppingCart, ArrowDownCircle, Loader2 } from 'lucide-react'
import { placeTrade, type TradeResult } from '@lib/api/trade'
import { getWalletStatus } from '@lib/api/wallet'
import { showToast } from '@components/ui/AppToast'

interface TradePanelProps {
  tokenId: string
  tokenLabel: string
  side: 'BUY' | 'SELL'
  /** Current best ask (for BUY) or best bid (for SELL) — used as default price */
  referencePrice: number | null
  compact?: boolean
  onTradeComplete?: (result: TradeResult) => void
}

export function TradePanel({
  tokenId,
  tokenLabel,
  side,
  referencePrice,
  compact = false,
  onTradeComplete,
}: TradePanelProps) {
  const [price, setPrice] = useState('')
  const [size, setSize] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<TradeResult | null>(null)

  const isBuy = side === 'BUY'
  const colorClass = isBuy ? 'green' : 'red'
  const Icon = isBuy ? ShoppingCart : ArrowDownCircle

  const estimatedCost = price && size ? (parseFloat(price) * parseFloat(size)).toFixed(4) : null

  async function handleSubmit() {
    const priceParsed = parseFloat(price)
    const sizeParsed = parseFloat(size)

    if (!priceParsed || !sizeParsed || priceParsed <= 0 || priceParsed >= 1 || sizeParsed <= 0) {
      showToast('error', '가격 (0~1)과 수량을 올바르게 입력하세요')
      return
    }

    const wallet = await getWalletStatus()
    if (!wallet.connected) {
      showToast('error', '지갑을 먼저 연결하세요 (Settings → Wallet)')
      return
    }

    setSubmitting(true)
    setResult(null)
    try {
      const res = await placeTrade({
        tokenId,
        side,
        price: priceParsed,
        size: sizeParsed,
        orderType: 'GTC',
      })
      setResult(res)
      const msg = res.dryRun
        ? `[Dry Run] ${side} ${sizeParsed} @ ${priceParsed}`
        : `${side} 주문 완료 — ${res.status}`
      showToast(res.status === 'matched' || res.dryRun ? 'success' : 'info', msg)
      onTradeComplete?.(res)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '주문 실패')
    } finally {
      setSubmitting(false)
    }
  }

  function handleSetRefPrice() {
    if (referencePrice !== null) {
      setPrice(referencePrice.toFixed(4))
    }
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="0.01"
          min="0.01"
          max="0.99"
          placeholder="가격"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="form-input w-20 text-xs py-1 px-2"
        />
        <input
          type="number"
          step="1"
          min="1"
          placeholder="수량"
          value={size}
          onChange={(e) => setSize(e.target.value)}
          className="form-input w-20 text-xs py-1 px-2"
        />
        <button
          className={`btn btn-xs ${isBuy ? 'btn-success' : 'btn-danger'} flex items-center gap-1`}
          disabled={submitting || !price || !size}
          onClick={handleSubmit}
        >
          {submitting ? <Loader2 className="size-3 animate-spin" /> : <Icon className="size-3" />}
          {side}
        </button>
      </div>
    )
  }

  return (
    <div className={`card border ${isBuy ? 'border-green-200 dark:border-green-800/40' : 'border-red-200 dark:border-red-800/40'}`}>
      <div className="card-body space-y-3">
        <div className="flex items-center justify-between">
          <h6 className={`text-sm font-semibold flex items-center gap-1.5 text-${colorClass}-700 dark:text-${colorClass}-400`}>
            <Icon className="size-4" />
            {side} {tokenLabel}
          </h6>
          {referencePrice !== null && (
            <button
              type="button"
              className="text-xs text-primary-500 hover:underline"
              onClick={handleSetRefPrice}
            >
              {isBuy ? 'Ask' : 'Bid'}: {(referencePrice * 100).toFixed(1)}¢
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 dark:text-dark-400 mb-1 block">
              가격 (0~1)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max="0.99"
              placeholder="0.50"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="form-input text-sm w-full"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-dark-400 mb-1 block">
              수량 (shares)
            </label>
            <input
              type="number"
              step="1"
              min="1"
              placeholder="10"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className="form-input text-sm w-full"
            />
          </div>
        </div>

        {estimatedCost && (
          <p className="text-xs text-gray-500 dark:text-dark-400">
            예상 비용: <span className="font-mono font-semibold">${estimatedCost} USDC</span>
          </p>
        )}

        <button
          className={`btn w-full ${isBuy ? 'btn-success' : 'btn-danger'} flex items-center justify-center gap-2`}
          disabled={submitting || !price || !size}
          onClick={handleSubmit}
        >
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Icon className="size-4" />
          )}
          {submitting ? '처리 중...' : `${side} 주문`}
        </button>

        {result && (
          <div className={`mt-2 p-2.5 rounded-lg text-xs ${
            result.dryRun
              ? 'bg-yellow-50 dark:bg-yellow-900/10 text-yellow-700 dark:text-yellow-400'
              : result.status === 'matched'
                ? 'bg-green-50 dark:bg-green-900/10 text-green-700 dark:text-green-400'
                : 'bg-gray-50 dark:bg-dark-800 text-gray-600 dark:text-dark-300'
          }`}>
            <p className="font-semibold mb-0.5">
              {result.dryRun ? '[Dry Run]' : ''} {result.status}
            </p>
            <p>{result.side} {result.size} @ ${result.price}</p>
            {result.orderId && <p className="font-mono text-[10px] truncate">ID: {result.orderId}</p>}
            {result.message && <p>{result.message}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
