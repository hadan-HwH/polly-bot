import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Wallet,
  Coins,
  Percent,
  RefreshCw,
  Loader2,
  AlertTriangle,
  ArrowDownCircle,
  Minus,
  Plus,
  Clock,
} from 'lucide-react'
import ReactApexChart from 'react-apexcharts'
import type { ApexOptions } from 'apexcharts'
import { DataTable, StatCard, AppTabs, type TabItem, StatusBadge, AppModal, EventAccordion, groupBy } from '@components/ui'
import { showToast } from '@components/ui/AppToast'
import { placeTrade } from '@lib/api/trade'
import { getExecutionHistory, type ExecutionHistoryItem, type ExecutionType } from '@lib/api/execution'
import {
  getBalance,
  getPositions,
  getPnl,
  getClosedPositions,
  getRedeemable,
  redeemPositions,
  getOrders,
  getDailyBalanceChart,
  getFundTransfers,
  getActivity,
  type BalanceResponse,
  type OpenPosition,
  type ClosedPosition,
  type PnlResponse,
  type RedeemableResponse,
  type OrdersResponse,
  type DailyBalanceChart,
  type FundTransfersResponse,
  type ActivityResponse,
} from '@lib/api/portfolio'
import type { ColumnDef } from '@tanstack/react-table'
import { useAppSelector } from '@slices/hooks'

const POLL_INTERVAL = 60_000

function formatRelativeTime(dateStr: string | undefined): string {
  if (!dateStr) return '—'
  const target = new Date(dateStr).getTime()
  const now = Date.now()
  const diffMs = target - now
  if (diffMs < 0) return '정산 대기'
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 60) return `${diffMin}분 후`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}시간 후`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}일 후`
}

export default function Portfolio() {
  const layoutMode = useAppSelector((s) => s.layout.layoutMode)
  const [balance, setBalance] = useState<BalanceResponse | null>(null)
  const [positions, setPositions] = useState<OpenPosition[]>([])
  const [closedPositions, setClosedPositions] = useState<ClosedPosition[]>([])
  const [pnl, setPnl] = useState<PnlResponse | null>(null)
  const [redeemable, setRedeemable] = useState<RedeemableResponse | null>(null)
  const [orders, setOrders] = useState<OrdersResponse | null>(null)
  const [chartData, setChartData] = useState<DailyBalanceChart | null>(null)
  const [execHistory, setExecHistory] = useState<ExecutionHistoryItem[]>([])
  const [execFilter, setExecFilter] = useState<ExecutionType | 'all'>('all')
  const [execGrouped, setExecGrouped] = useState(true)
  const [fundTransfers, setFundTransfers] = useState<FundTransfersResponse | null>(null)
  const [fundTransfersLoaded, setFundTransfersLoaded] = useState(false)
  const [activity, setActivity] = useState<ActivityResponse | null>(null)
  const [activityLoaded, setActivityLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [redeeming, setRedeeming] = useState(false)

  const [sellModal, setSellModal] = useState(false)
  const [sellTarget, setSellTarget] = useState<OpenPosition | null>(null)
  const [sellPrice, setSellPrice] = useState('')
  const [sellSize, setSellSize] = useState('')
  const [selling, setSelling] = useState(false)

  const fetchAll = useCallback(async () => {
    try {
      const [balRes, posRes, pnlRes, closedRes, redeemRes, ordersRes, chartRes, execRes] =
        await Promise.allSettled([
          getBalance(),
          getPositions(),
          getPnl(),
          getClosedPositions(50),
          getRedeemable(),
          getOrders(50),
          getDailyBalanceChart(30),
          getExecutionHistory(100),
        ])

      if (balRes.status === 'fulfilled') setBalance(balRes.value)
      if (posRes.status === 'fulfilled') setPositions(posRes.value.open ?? [])
      if (pnlRes.status === 'fulfilled') setPnl(pnlRes.value)
      if (closedRes.status === 'fulfilled') setClosedPositions(closedRes.value.positions ?? [])
      if (redeemRes.status === 'fulfilled') setRedeemable(redeemRes.value)
      if (ordersRes.status === 'fulfilled') setOrders(ordersRes.value)
      if (chartRes.status === 'fulfilled') setChartData(chartRes.value)
      if (execRes.status === 'fulfilled') setExecHistory(execRes.value.executions ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchAll])

  const loadFundTransfers = useCallback(async () => {
    if (fundTransfersLoaded) return
    try {
      const res = await getFundTransfers()
      setFundTransfers(res)
    } catch { /* ignore */ }
    setFundTransfersLoaded(true)
  }, [fundTransfersLoaded])

  const loadActivity = useCallback(async () => {
    if (activityLoaded) return
    try {
      const res = await getActivity()
      setActivity(res)
    } catch { /* ignore */ }
    setActivityLoaded(true)
  }, [activityLoaded])

  const handleTabChange = useCallback((key: string) => {
    if (key === 'transfers') loadFundTransfers()
    if (key === 'activity') loadActivity()
  }, [loadFundTransfers, loadActivity])

  function openSellModal(pos: OpenPosition) {
    setSellTarget(pos)
    setSellPrice(pos.currentPrice > 0 ? pos.currentPrice.toFixed(4) : '')
    setSellSize(pos.size.toFixed(0))
    setSellModal(true)
  }

  async function handleSell() {
    if (!sellTarget) return
    const priceParsed = parseFloat(sellPrice)
    const sizeParsed = parseFloat(sellSize)
    if (!priceParsed || !sizeParsed || priceParsed <= 0 || priceParsed >= 1 || sizeParsed <= 0) {
      showToast('error', '가격 (0~1)과 수량을 올바르게 입력하세요')
      return
    }
    setSelling(true)
    try {
      const res = await placeTrade({
        tokenId: sellTarget.tokenId,
        side: 'SELL',
        price: priceParsed,
        size: sizeParsed,
        orderType: 'GTC',
      })
      const msg = res.dryRun
        ? `[Dry Run] SELL ${sizeParsed} @ ${priceParsed}`
        : `SELL 주문 완료 — ${res.status}`
      showToast(res.status === 'matched' || res.dryRun ? 'success' : 'info', msg)
      setSellModal(false)
      await fetchAll()
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '매도 실패')
    } finally {
      setSelling(false)
    }
  }

  const handleRedeem = async () => {
    setRedeeming(true)
    try {
      const result = await redeemPositions()
      const redeemed = (result as Record<string, number>).redeemed ?? 0
      if (redeemed > 0) {
        showToast('success', `${redeemed} position(s) redeemed`)
      } else if (result.error) {
        showToast('error', String(result.error))
      } else {
        showToast('info', 'No positions to redeem')
      }
      await fetchAll()
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Redemption failed')
    } finally {
      setRedeeming(false)
    }
  }

  const openCols = useMemo<ColumnDef<OpenPosition, unknown>[]>(() => [
    {
      accessorKey: 'market',
      header: '마켓',
      cell: ({ getValue }) => (
        <span className="text-sm truncate max-w-[200px] inline-block" title={getValue() as string}>
          {getValue() as string}
        </span>
      ),
    },
    { accessorKey: 'outcome', header: '결과', size: 60 },
    {
      accessorKey: 'size',
      header: '수량',
      cell: ({ getValue }) => <span className="font-mono text-sm">{(getValue() as number).toFixed(2)}</span>,
    },
    {
      accessorKey: 'avgPrice',
      header: '매수가',
      cell: ({ getValue }) => <span className="font-mono text-sm">${(getValue() as number).toFixed(4)}</span>,
    },
    {
      accessorKey: 'currentPrice',
      header: '현재가',
      cell: ({ getValue }) => <span className="font-mono text-sm">${(getValue() as number).toFixed(4)}</span>,
    },
    {
      id: 'value',
      header: '가치',
      cell: ({ row }) => {
        const v = row.original.size * row.original.currentPrice
        return <span className="font-mono text-sm font-semibold">${v.toFixed(2)}</span>
      },
    },
    {
      accessorKey: 'pnl',
      header: '손익',
      cell: ({ getValue }) => {
        const v = getValue() as number
        return (
          <span className={`font-mono text-sm font-semibold ${v >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {v >= 0 ? '+' : ''}${v.toFixed(2)}
          </span>
        )
      },
    },
    {
      accessorKey: 'endDate',
      header: '정산 예정',
      cell: ({ getValue }) => {
        const dateStr = getValue() as string | undefined
        const label = formatRelativeTime(dateStr)
        const isPending = label === '정산 대기'
        return (
          <span
            className={`text-xs ${isPending ? 'px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' : 'text-gray-500 dark:text-dark-400'}`}
            title={dateStr ?? ''}
          >
            {isPending ? <span className="flex items-center gap-1"><Clock className="size-3" />{label}</span> : label}
          </span>
        )
      },
    },
    {
      accessorKey: 'status',
      header: '상태',
      cell: ({ getValue }) => {
        const s = getValue() as string
        const variant = s === 'OPEN' ? 'primary' : s === 'WON' ? 'success' : s === 'LOST' ? 'danger' : 'warning'
        return <StatusBadge label={s} variant={variant} />
      },
    },
    {
      id: 'sell',
      header: '',
      size: 70,
      cell: ({ row }) => {
        const pos = row.original
        if (pos.status !== 'OPEN' || !pos.tokenId) return null
        return (
          <button
            className="btn btn-xs btn-outline-danger flex items-center gap-1"
            onClick={() => openSellModal(pos)}
          >
            <ArrowDownCircle className="size-3" />
            매도
          </button>
        )
      },
    },
  ], [])

  const closedCols = useMemo<ColumnDef<ClosedPosition, unknown>[]>(() => [
    {
      accessorKey: 'market',
      header: 'Market',
      cell: ({ getValue }) => (
        <span className="text-sm truncate max-w-[200px] inline-block" title={getValue() as string}>
          {getValue() as string}
        </span>
      ),
    },
    {
      accessorKey: 'avgPrice',
      header: 'Buy Price',
      cell: ({ getValue }) => <span className="font-mono text-sm">${(getValue() as number).toFixed(4)}</span>,
    },
    {
      accessorKey: 'exitPrice',
      header: 'Exit Price',
      cell: ({ getValue }) => <span className="font-mono text-sm">${(getValue() as number).toFixed(4)}</span>,
    },
    {
      accessorKey: 'realizedPnl',
      header: 'Realized PnL',
      cell: ({ getValue }) => {
        const v = getValue() as number
        return (
          <span className={`font-mono text-sm font-semibold ${v >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {v >= 0 ? '+' : ''}${v.toFixed(2)}
          </span>
        )
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ getValue }) => {
        const s = getValue() as string
        const variant = s === 'WON' ? 'success' : s === 'LOST' ? 'danger' : 'warning'
        return <StatusBadge label={s} variant={variant} />
      },
    },
  ], [])

  const chartOptions = useMemo<ApexOptions>(() => ({
    chart: {
      type: 'area',
      toolbar: { show: false },
      background: 'transparent',
      fontFamily: 'inherit',
    },
    theme: { mode: layoutMode === 'dark' ? 'dark' : 'light' },
    colors: ['#3b82f6', '#10b981', '#8b5cf6'],
    stroke: { curve: 'smooth', width: 2 },
    fill: {
      type: 'gradient',
      gradient: { opacityFrom: 0.3, opacityTo: 0.05 },
    },
    xaxis: {
      categories: chartData?.dates ?? [],
      labels: { style: { fontSize: '11px' } },
    },
    yaxis: {
      labels: {
        formatter: (v: number) => `$${v.toFixed(0)}`,
        style: { fontSize: '11px' },
      },
    },
    tooltip: {
      y: { formatter: (v: number) => `$${v.toFixed(2)}` },
    },
    legend: { position: 'top' },
    grid: {
      borderColor: layoutMode === 'dark' ? '#374151' : '#e5e7eb',
    },
  }), [chartData, layoutMode])

  const chartSeries = useMemo(() => [
    { name: 'USDC', data: chartData?.usdc ?? [] },
    { name: 'Positions', data: chartData?.positionsValue ?? [] },
    { name: 'Total', data: chartData?.total ?? [] },
  ], [chartData])

  const posSummary = useMemo(() => {
    const totalValue = positions.reduce((s, p) => s + p.size * p.currentPrice, 0)
    const totalPnl = positions.reduce((s, p) => s + p.pnl, 0)
    const largest = positions.length > 0
      ? positions.reduce((max, p) => (p.size * p.currentPrice > max!.size * max!.currentPrice ? p : max), positions[0] as OpenPosition | null)
      : null
    return { count: positions.length, totalValue, totalPnl, largest }
  }, [positions])

  const tabs = useMemo<TabItem[]>(() => [
    {
      key: 'positions',
      label: `보유 포지션 (${positions.length})`,
      content: (
        <div className="space-y-4">
          {positions.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="text-center p-3 rounded-md bg-gray-50 dark:bg-dark-800">
                <p className="text-xs text-gray-500 dark:text-dark-400">총 포지션</p>
                <p className="text-lg font-semibold">{posSummary.count}개</p>
              </div>
              <div className="text-center p-3 rounded-md bg-gray-50 dark:bg-dark-800">
                <p className="text-xs text-gray-500 dark:text-dark-400">총 포지션 가치</p>
                <p className="text-lg font-semibold">${posSummary.totalValue.toFixed(2)}</p>
              </div>
              <div className="text-center p-3 rounded-md bg-gray-50 dark:bg-dark-800">
                <p className="text-xs text-gray-500 dark:text-dark-400">미확정 손익</p>
                <p className={`text-lg font-semibold ${posSummary.totalPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {posSummary.totalPnl >= 0 ? '+' : ''}${posSummary.totalPnl.toFixed(2)}
                </p>
              </div>
              <div className="text-center p-3 rounded-md bg-gray-50 dark:bg-dark-800">
                <p className="text-xs text-gray-500 dark:text-dark-400">최대 포지션</p>
                <p className="text-sm font-semibold truncate" title={posSummary.largest?.market}>
                  {posSummary.largest ? `$${(posSummary.largest.size * posSummary.largest.currentPrice).toFixed(2)}` : '—'}
                </p>
                <p className="text-xs text-gray-400 dark:text-dark-500 truncate">
                  {posSummary.largest?.market ?? ''}
                </p>
              </div>
            </div>
          )}
          <DataTable
            columns={openCols}
            data={positions}
            searchable
            paginated
            pageSize={20}
            searchPlaceholder="포지션 검색..."
            emptyMessage="보유 포지션이 없습니다"
          />
        </div>
      ),
    },
    {
      key: 'closed',
      label: `Closed (${closedPositions.length})`,
      content: (
        <DataTable
          columns={closedCols}
          data={closedPositions}
          searchable
          paginated
          pageSize={20}
          searchPlaceholder="Search closed..."
          emptyMessage="No closed positions"
        />
      ),
    },
    {
      key: 'executions',
      label: `Executions (${execHistory.length})`,
      content: (() => {
        const filtered = execFilter === 'all' ? execHistory : execHistory.filter((e) => e.executionType === execFilter)
        const stats = {
          total: execHistory.length,
          pureArb: execHistory.filter((e) => e.executionType === 'pure_arb').length,
          negrisk: execHistory.filter((e) => e.executionType === 'negrisk').length,
          success: execHistory.filter((e) => e.status === 'filled' || e.status === 'simulated').length,
          totalProfit: execHistory.reduce((s, e) => s + (e.expectedProfit ?? 0), 0),
        }
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="text-center p-3 rounded-md bg-gray-50 dark:bg-dark-800">
                <p className="text-xs text-gray-500 dark:text-dark-400">Total</p>
                <p className="text-lg font-semibold">{stats.total}</p>
              </div>
              <div className="text-center p-3 rounded-md bg-gray-50 dark:bg-dark-800">
                <p className="text-xs text-gray-500 dark:text-dark-400">Pure Arb</p>
                <p className="text-lg font-semibold text-amber-600">{stats.pureArb}</p>
              </div>
              <div className="text-center p-3 rounded-md bg-gray-50 dark:bg-dark-800">
                <p className="text-xs text-gray-500 dark:text-dark-400">NegRisk</p>
                <p className="text-lg font-semibold text-indigo-600">{stats.negrisk}</p>
              </div>
              <div className="text-center p-3 rounded-md bg-gray-50 dark:bg-dark-800">
                <p className="text-xs text-gray-500 dark:text-dark-400">Success</p>
                <p className="text-lg font-semibold text-green-500">{stats.success}</p>
              </div>
              <div className="text-center p-3 rounded-md bg-gray-50 dark:bg-dark-800">
                <p className="text-xs text-gray-500 dark:text-dark-400">Total Profit</p>
                <p className={`text-lg font-semibold ${stats.totalProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>${stats.totalProfit.toFixed(2)}</p>
              </div>
            </div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {(['all', 'pure_arb', 'negrisk'] as const).map((f) => (
                  <button
                    key={f}
                    className={`btn btn-xs ${execFilter === f ? 'btn-primary' : 'btn-outline-gray'}`}
                    onClick={() => setExecFilter(f)}
                  >
                    {f === 'all' ? 'All' : f === 'pure_arb' ? 'Pure Arb' : 'NegRisk'}
                  </button>
                ))}
              </div>
              <button
                className={`btn btn-xs ${execGrouped ? 'btn-primary' : 'btn-outline-gray'}`}
                onClick={() => setExecGrouped(!execGrouped)}
              >
                {execGrouped ? '이벤트 그룹' : '플랫 리스트'}
              </button>
            </div>
            {execGrouped && filtered.length > 0 ? (
              <EventAccordion
                groups={groupBy(
                  filtered,
                  (e) => e.slug || e.market,
                  (e) => e.market.replace(/^\[(YES_ARB|NO_CONVERT_ARB)\]\s*/, ''),
                  (items) => {
                    const totalCost = items.reduce((s, e) => s + (e.totalCost ?? 0), 0)
                    const totalProfit = items.reduce((s, e) => s + (e.expectedProfit ?? 0), 0)
                    const successCount = items.filter((e) => e.status === 'filled' || e.status === 'simulated').length
                    return (
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-400">{successCount}/{items.length} 성공</span>
                        <span className={`text-xs font-mono font-semibold ${totalProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          ${totalProfit.toFixed(2)}
                        </span>
                        <span className="text-xs font-mono text-gray-400">(${totalCost.toFixed(2)})</span>
                      </div>
                    )
                  },
                )}
                renderGroup={(items) => (
                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-dark-700">
                          <th className="text-left py-2 px-3 text-gray-500 dark:text-dark-400 font-medium">Time</th>
                          <th className="text-left py-2 px-3 text-gray-500 dark:text-dark-400 font-medium">Type</th>
                          <th className="text-left py-2 px-3 text-gray-500 dark:text-dark-400 font-medium">Market</th>
                          <th className="text-left py-2 px-3 text-gray-500 dark:text-dark-400 font-medium">Status</th>
                          <th className="text-right py-2 px-3 text-gray-500 dark:text-dark-400 font-medium">Cost</th>
                          <th className="text-right py-2 px-3 text-gray-500 dark:text-dark-400 font-medium">Profit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((e, i) => (
                          <tr key={i} className="border-b border-gray-100 dark:border-dark-800">
                            <td className="py-2 px-3 text-xs text-gray-400">{new Date(e.timestamp).toLocaleString()}</td>
                            <td className="py-2 px-3">
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                e.executionType === 'negrisk'
                                  ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                                  : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                              }`}>
                                {e.executionType === 'negrisk' ? 'NegRisk' : 'Pure Arb'}
                              </span>
                            </td>
                            <td className="py-2 px-3 truncate max-w-[200px]">{e.market}</td>
                            <td className="py-2 px-3">
                              <StatusBadge
                                label={e.status}
                                variant={e.status === 'filled' || e.status === 'simulated' ? 'success' : e.status === 'failed' || e.status === 'rolled_back' ? 'danger' : 'warning'}
                              />
                            </td>
                            <td className="py-2 px-3 text-right font-mono">${(e.totalCost ?? 0).toFixed(2)}</td>
                            <td className={`py-2 px-3 text-right font-mono font-semibold ${(e.expectedProfit ?? 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                              ${(e.expectedProfit ?? 0).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              />
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-dark-700">
                      <th className="text-left py-2 px-3 text-gray-500 dark:text-dark-400 font-medium">Time</th>
                      <th className="text-left py-2 px-3 text-gray-500 dark:text-dark-400 font-medium">Type</th>
                      <th className="text-left py-2 px-3 text-gray-500 dark:text-dark-400 font-medium">Market</th>
                      <th className="text-left py-2 px-3 text-gray-500 dark:text-dark-400 font-medium">Status</th>
                      <th className="text-right py-2 px-3 text-gray-500 dark:text-dark-400 font-medium">Cost</th>
                      <th className="text-right py-2 px-3 text-gray-500 dark:text-dark-400 font-medium">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((e, i) => (
                      <tr key={i} className="border-b border-gray-100 dark:border-dark-800">
                        <td className="py-2 px-3 text-xs text-gray-400">{new Date(e.timestamp).toLocaleString()}</td>
                        <td className="py-2 px-3">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            e.executionType === 'negrisk'
                              ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                              : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                          }`}>
                            {e.executionType === 'negrisk' ? 'NegRisk' : 'Pure Arb'}
                          </span>
                        </td>
                        <td className="py-2 px-3 truncate max-w-[200px]">{e.market}</td>
                        <td className="py-2 px-3">
                          <StatusBadge
                            label={e.status}
                            variant={e.status === 'filled' || e.status === 'simulated' ? 'success' : e.status === 'failed' ? 'danger' : 'warning'}
                          />
                        </td>
                        <td className="py-2 px-3 text-right font-mono">${(e.totalCost ?? 0).toFixed(2)}</td>
                        <td className={`py-2 px-3 text-right font-mono font-semibold ${(e.expectedProfit ?? 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          ${(e.expectedProfit ?? 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-gray-400 dark:text-dark-500">No executions yet</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })(),
    },
    {
      key: 'redeem',
      label: `Redeem (${redeemable?.count ?? 0})`,
      content: (
        <div className="space-y-4">
          {redeemable?.error && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="size-4 text-amber-500 shrink-0" />
              <span className="text-sm text-amber-700 dark:text-amber-300">{redeemable.error}</span>
            </div>
          )}
          {redeemable && redeemable.count > 0 && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-dark-200">
                  {redeemable.count} redeemable position{redeemable.count > 1 ? 's' : ''} — Total: ${redeemable.totalValue.toFixed(2)}
                </p>
              </div>
              <button
                className="btn btn-sm btn-primary flex items-center gap-1.5"
                onClick={handleRedeem}
                disabled={redeeming}
              >
                {redeeming ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                Redeem All
              </button>
            </div>
          )}
          <div className="space-y-2">
            {redeemable?.positions.map((p, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-md bg-gray-50 dark:bg-dark-800">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-dark-200">{p.market}</p>
                  <p className="text-xs text-gray-400 dark:text-dark-500">{p.outcome} — {p.size} shares</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">${p.value.toFixed(2)}</p>
                  <p className={`text-xs ${p.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {p.pnl >= 0 ? '+' : ''}${p.pnl.toFixed(2)}
                  </p>
                </div>
              </div>
            ))}
            {(!redeemable || redeemable.count === 0) && (
              <p className="py-8 text-center text-gray-400 dark:text-dark-500">No redeemable positions</p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'activity',
      label: `히스토리 (${activity?.count ?? '…'})`,
      content: (
        <div>
          {!activityLoaded ? (
            <p className="py-8 text-center text-gray-400 dark:text-dark-500">탭을 클릭하면 로드됩니다</p>
          ) : activity && activity.activities.length > 0 ? (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-dark-700">
                    <th className="text-left py-2 px-3 text-gray-500 dark:text-dark-400 font-medium">활동</th>
                    <th className="text-left py-2 px-3 text-gray-500 dark:text-dark-400 font-medium">마켓</th>
                    <th className="text-right py-2 px-3 text-gray-500 dark:text-dark-400 font-medium">수량</th>
                    <th className="text-right py-2 px-3 text-gray-500 dark:text-dark-400 font-medium">가격</th>
                    <th className="text-right py-2 px-3 text-gray-500 dark:text-dark-400 font-medium">금액</th>
                    <th className="text-right py-2 px-3 text-gray-500 dark:text-dark-400 font-medium">시간</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.activities.map((a, i) => (
                    <tr key={i} className="border-b border-gray-100 dark:border-dark-800">
                      <td className="py-2 px-3">
                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                          a.label === '매수' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                          : a.label === '매도' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                          : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        }`}>
                          {a.label}
                        </span>
                      </td>
                      <td className="py-2 px-3 truncate max-w-[250px]" title={a.market}>{a.market}</td>
                      <td className="py-2 px-3 text-right font-mono">{a.size > 0 ? a.size.toFixed(2) : '—'}</td>
                      <td className="py-2 px-3 text-right font-mono">{a.price > 0 ? `${(a.price * 100).toFixed(0)}¢` : '—'}</td>
                      <td className={`py-2 px-3 text-right font-mono font-semibold ${
                        a.label === '매수' ? 'text-red-600 dark:text-red-400'
                        : 'text-green-600 dark:text-green-400'
                      }`}>
                        {a.usdcSize > 0 ? `${a.label === '매수' ? '-' : '+'}$${a.usdcSize.toFixed(2)}` : '—'}
                      </td>
                      <td className="py-2 px-3 text-right text-xs text-gray-400">
                        {new Date(Number(a.timestamp) * 1000).toLocaleString('ko-KR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-8 text-center text-gray-400 dark:text-dark-500">활동 내역이 없습니다</p>
          )}
        </div>
      ),
    },
    {
      key: 'transfers',
      label: `입출금 (${fundTransfers?.transfers.length ?? '…'})`,
      content: (
        <div>
          {!fundTransfersLoaded ? (
            <p className="py-8 text-center text-gray-400 dark:text-dark-500">탭을 클릭하면 로드됩니다</p>
          ) : fundTransfers && fundTransfers.transfers.length > 0 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 rounded-md bg-gray-50 dark:bg-dark-800">
                  <p className="text-xs text-gray-500 dark:text-dark-400">총 입금</p>
                  <p className="text-lg font-semibold text-green-500">${fundTransfers.totalDeposits.toFixed(2)}</p>
                </div>
                <div className="text-center p-3 rounded-md bg-gray-50 dark:bg-dark-800">
                  <p className="text-xs text-gray-500 dark:text-dark-400">총 출금</p>
                  <p className="text-lg font-semibold text-red-500">${fundTransfers.totalWithdrawals.toFixed(2)}</p>
                </div>
                <div className="text-center p-3 rounded-md bg-gray-50 dark:bg-dark-800">
                  <p className="text-xs text-gray-500 dark:text-dark-400">순 투입</p>
                  <p className="text-lg font-semibold">${fundTransfers.netInvested.toFixed(2)}</p>
                </div>
              </div>
              <div className="space-y-2">
                {fundTransfers.transfers.map((t) => (
                  <div key={t.id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-dark-800 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${t.type === 'deposit' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`}>
                        {t.type === 'deposit' ? '입금' : '출금'}
                      </span>
                      <span className="text-sm text-gray-600 dark:text-dark-300">{t.memo || '—'}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`font-mono text-sm font-semibold ${t.type === 'deposit' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {t.type === 'deposit' ? '+' : '-'}${t.amount.toFixed(2)}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-dark-500">
                        {new Date(t.timestamp).toLocaleDateString('ko-KR')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-gray-400 dark:text-dark-500">입출금 내역이 없습니다</p>
          )}
        </div>
      ),
    },
    {
      key: 'chart',
      label: '잔액 차트',
      content: (
        <div>
          {chartData && chartData.count > 0 ? (
            <ReactApexChart
              type="area"
              height={350}
              options={chartOptions}
              series={chartSeries}
            />
          ) : (
            <p className="py-8 text-center text-gray-400 dark:text-dark-500">잔액 기록이 없습니다</p>
          )}
        </div>
      ),
    },
  ], [positions, closedPositions, orders, redeemable, chartData, openCols, closedCols, chartOptions, chartSeries, redeeming, handleRedeem, activity, activityLoaded, fundTransfers, fundTransfersLoaded])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="spin-loader text-primary-500 size-8" />
      </div>
    )
  }

  const usdcBalance = balance?.polymarketUsdc ?? 0
  const positionsValue = balance?.positionsValue ?? 0
  const totalAssets = usdcBalance + positionsValue
  const portfolioPnl = pnl?.portfolio?.pnlUsd ?? 0
  const netInvested = fundTransfers?.netInvested ?? pnl?.portfolio?.startingBalance ?? 0
  const returnPct = netInvested > 0 ? ((totalAssets - netInvested) / netInvested) * 100 : 0

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h5 className="text-lg font-semibold text-gray-800 dark:text-dark-100">
            포트폴리오
          </h5>
          <p className="text-sm text-gray-500 dark:text-dark-400 mt-0.5">
            자산 현황 및 거래 내역
          </p>
        </div>
        <button
          className="btn btn-sm btn-outline-primary flex items-center gap-1.5"
          onClick={fetchAll}
        >
          <RefreshCw className="size-3.5" />
          새로고침
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-5 mb-6">
        <StatCard
          title="총 자산"
          value={`$${totalAssets.toFixed(2)}`}
          icon={<DollarSign className="size-5" />}
          tooltip="현금(USDC)과 보유 토큰 가치를 합산한 전체 자산입니다."
        />
        <StatCard
          title="현금 (USDC)"
          value={`$${usdcBalance.toFixed(2)}`}
          icon={<Wallet className="size-5" />}
          tooltip="거래에 바로 사용할 수 있는 현금 잔액입니다. 토큰을 사면 줄어듭니다."
        />
        <StatCard
          title="포지션 가치"
          value={`$${positionsValue.toFixed(2)}`}
          icon={<Coins className="size-5" />}
          tooltip="보유 중인 토큰의 현재 시장 가치입니다. 마켓 결과에 따라 변동됩니다."
        />
        <StatCard
          title="전체 손익"
          value={`${portfolioPnl >= 0 ? '+' : ''}$${portfolioPnl.toFixed(2)}`}
          icon={portfolioPnl >= 0 ? <TrendingUp className="size-5" /> : <TrendingDown className="size-5" />}
          tooltip="처음 잔액 대비 현재까지의 전체 손익입니다. 매매 손익 + Claim 수익이 모두 포함됩니다."
        />
        <StatCard
          title="원금 대비"
          value={`${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(2)}%`}
          icon={<Percent className="size-5" />}
          trend={returnPct}
          tooltip={`투입 원금($${netInvested.toFixed(0)}) 대비 현재 총 자산의 증감률입니다.`}
        />
      </div>

      <div className="card">
        <div className="card-body">
          <AppTabs tabs={tabs} defaultActiveKey="positions" onChange={handleTabChange} />
        </div>
      </div>

      {/* Sell Modal */}
      <AppModal
        isOpen={sellModal}
        onClose={() => setSellModal(false)}
        title={`Sell ${sellTarget?.outcome ?? ''}`}
        size="sm"
      >
        <div className="space-y-4">
          {/* Market name + badge */}
          <div>
            <p className="text-sm text-gray-700 dark:text-dark-200 truncate" title={sellTarget?.market}>
              {sellTarget?.market}
            </p>
            <StatusBadge
              label={sellTarget?.outcome ?? ''}
              variant={sellTarget?.outcome === 'Yes' ? 'success' : 'danger'}
              className="mt-1"
            />
          </div>

          {/* Position info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-gray-100 dark:border-dark-700 p-3">
              <p className="text-xs text-gray-500 dark:text-dark-400">보유 수량</p>
              <p className="text-lg font-mono font-semibold text-gray-800 dark:text-dark-100 mt-0.5">
                {sellTarget?.size.toFixed(2)}
              </p>
            </div>
            <div className="rounded-md border border-gray-100 dark:border-dark-700 p-3">
              <p className="text-xs text-gray-500 dark:text-dark-400">현재 가격</p>
              <p className="text-lg font-mono font-semibold text-gray-800 dark:text-dark-100 mt-0.5">
                {sellTarget ? `${(sellTarget.currentPrice * 100).toFixed(0)}¢` : '—'}
              </p>
            </div>
          </div>

          {/* Price stepper */}
          <div>
            <label className="form-label">매도 가격</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const v = Math.max(1, Math.round(parseFloat(sellPrice || '0') * 100) - 1)
                  setSellPrice((v / 100).toFixed(2))
                }}
                className="btn btn-sm btn-outline-gray btn-icon !size-9"
              >
                <Minus className="size-4" />
              </button>
              <div className="flex-1 text-center">
                <span className="text-xl font-bold font-mono text-gray-800 dark:text-dark-100">
                  {sellPrice ? `${Math.round(parseFloat(sellPrice) * 100)}¢` : '0¢'}
                </span>
              </div>
              <button
                onClick={() => {
                  const v = Math.min(99, Math.round(parseFloat(sellPrice || '0') * 100) + 1)
                  setSellPrice((v / 100).toFixed(2))
                }}
                className="btn btn-sm btn-outline-gray btn-icon !size-9"
              >
                <Plus className="size-4" />
              </button>
            </div>
          </div>

          {/* Size input */}
          <div>
            <label className="form-label">매도 수량</label>
            <input
              type="number"
              min={1}
              max={sellTarget?.size ?? 999}
              value={sellSize}
              onChange={(e) => setSellSize(e.target.value)}
              className="form-input text-right font-mono font-semibold"
            />
            <div className="flex gap-1.5 mt-2">
              {[25, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  onClick={() => {
                    if (!sellTarget) return
                    setSellSize(Math.floor(sellTarget.size * pct / 100).toString())
                  }}
                  className="btn btn-xs btn-outline-gray flex-1"
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          {/* Total */}
          <div className="border-t border-gray-100 dark:border-dark-700 pt-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-dark-400">예상 수령</span>
              <span className="font-mono font-semibold text-gray-800 dark:text-dark-100">
                ${sellPrice && sellSize
                  ? (parseFloat(sellPrice) * parseFloat(sellSize)).toFixed(2)
                  : '0.00'} USDC
              </span>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-1">
            <button
              className="btn btn-sm btn-outline-gray flex-1"
              onClick={() => setSellModal(false)}
              disabled={selling}
            >
              취소
            </button>
            <button
              className="btn btn-sm btn-red flex-1 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={selling || !sellPrice || !sellSize}
              onClick={handleSell}
            >
              {selling ? <Loader2 className="size-4 animate-spin" /> : <ArrowDownCircle className="size-4" />}
              {selling ? '처리 중...' : '매도 확인'}
            </button>
          </div>
        </div>
      </AppModal>
    </div>
  )
}
